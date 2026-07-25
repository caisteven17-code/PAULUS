"""
Philippine Liturgical Calendar Loader
=====================================
Loads collector/updater JSON into reference.liturgical_calendar in AWS.

Flow per batch:
  1. Categorize rows: insert / update / skip_approved
  2. Write all proposed rows to staging.liturgical_calendar (if run_id provided)
  3. Promote insert/update rows to reference.liturgical_calendar
  4. Mark promoted staging rows with promoted_record_id + applied_at

Usage:
  python -m app.services.liturgical_calendar_loader
  python -m app.services.liturgical_calendar_loader --file /custom/path.json
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import (
    LITURGICAL_CANONICAL_SOURCE,
    LITURGICAL_OPERATIONS_WORKFLOW_ENABLED,
    REFERENCE_SILVER_SCHEMA,
)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
_LITURGICAL_CHUNK = 300
if REFERENCE_SILVER_SCHEMA not in {"reference", "reference_silver"}:
    raise ValueError("REFERENCE_SILVER_SCHEMA must be 'reference' or 'reference_silver'")
_AWS_SILVER_SCHEMA = REFERENCE_SILVER_SCHEMA


def _chunks(items: list[Any], size: int = _LITURGICAL_CHUNK):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _db_payload(row: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "date",
        "year",
        "month",
        "day",
        "weekday",
        "celebration_name",
        "rank",
        "liturgical_season",
        "source_name",
        "source_url",
        "source_reference",
        "raw_payload",
        "validation_status",
        "validation_reason",
        "gcatholic_match_status",
        "romcal_match_status",
        "litcal_match_status",
        "gcatholic_celebration_name",
        "romcal_celebration_name",
        "litcal_celebration_name",
        "review_status",
        "reviewed_by",
        "reviewed_at",
        "review_notes",
        "revision_payload",
    }
    payload = {key: row.get(key) for key in allowed}
    payload["updated_at"] = row.get("updated_at") or datetime.now(timezone.utc).isoformat()
    return payload


def _publish_review_candidates(rows: list[dict[str, Any]], run_id: Optional[str] = None) -> int:
    """Publish candidates to the Supabase-owned human approval workflow.

    Existing approved rows are protected from collector overwrite. Pending or
    rejected rows may be refreshed by a newer source comparison.
    """
    if not rows:
        return 0
    from app.services.supabase_client import get_table

    if LITURGICAL_OPERATIONS_WORKFLOW_ENABLED and run_id:
        years = sorted({int(row["year"]) for row in rows if row.get("year") is not None})
        get_table("operations", "liturgical_calendar_ingestion_runs").upsert(
            {
                "run_id": run_id,
                "years": years,
                "run_mode": "scheduled",
                "status": "collecting",
                "candidate_count": len(rows),
            }
        ).execute()

    published = 0
    for row in rows:
        payload = _db_payload(row)
        existing_response = (
            get_table("reference", "liturgical_calendar")
            .select("id,review_status")
            .eq("date", payload["date"])
            .eq("source_name", payload["source_name"])
            .limit(1)
            .execute()
        )
        existing = (existing_response.data or [None])[0]
        if existing and existing.get("review_status") in {"approved", "approved_with_revisions"}:
            continue
        if existing:
            payload["id"] = existing["id"]
        response = get_table("reference", "liturgical_calendar").upsert(payload).execute()
        canonical = (response.data or [payload])[0]
        if LITURGICAL_OPERATIONS_WORKFLOW_ENABLED and run_id:
            get_table("operations", "liturgical_calendar_ingestion_items").upsert(
                {
                    "run_id": run_id,
                    "calendar_date": payload["date"],
                    "source_name": payload["source_name"],
                    "source_reference": payload.get("source_reference"),
                    "candidate_record_id": canonical.get("id"),
                    "validation_status": payload.get("validation_status") or "pending",
                    "review_status": payload.get("review_status") or "pending",
                    "processing_status": "published",
                    "validation_payload": {
                        "validation_reason": payload.get("validation_reason"),
                        "gcatholic_match_status": payload.get("gcatholic_match_status"),
                        "romcal_match_status": payload.get("romcal_match_status"),
                        "litcal_match_status": payload.get("litcal_match_status"),
                    },
                },
                on_conflict="run_id,calendar_date,source_name",
            ).execute()
        published += 1
    if LITURGICAL_OPERATIONS_WORKFLOW_ENABLED and run_id:
        get_table("operations", "liturgical_calendar_ingestion_runs").update(
            {"status": "awaiting_review", "candidate_count": published}
        ).eq("run_id", run_id).execute()
    return published


def _staging_payload(row: dict[str, Any], run_id: str, action: str) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "date": row.get("date"),
        "year": row.get("year"),
        "month": row.get("month"),
        "day": row.get("day"),
        "weekday": row.get("weekday"),
        "celebration_name": row.get("celebration_name"),
        "rank": row.get("rank"),
        "liturgical_season": row.get("liturgical_season"),
        "source_name": row.get("source_name"),
        "source_url": row.get("source_url"),
        "source_reference": row.get("source_reference"),
        "raw_payload": row.get("raw_payload"),
        "validation_status": row.get("validation_status"),
        "validation_reason": row.get("validation_reason"),
        "gcatholic_match_status": row.get("gcatholic_match_status"),
        "romcal_match_status": row.get("romcal_match_status"),
        "litcal_match_status": row.get("litcal_match_status"),
        "gcatholic_celebration_name": row.get("gcatholic_celebration_name"),
        "romcal_celebration_name": row.get("romcal_celebration_name"),
        "litcal_celebration_name": row.get("litcal_celebration_name"),
        "revision_payload": row.get("revision_payload"),
        "review_status": row.get("review_status"),
        "review_notes": row.get("review_notes"),
        "action": action,
    }


def _upsert_authoritative_calendar(rows: list[dict[str, Any]]) -> int:
    """Chunked Supabase-canonical refresh, including approval reversals."""
    from app.services import analytics_db

    dates = list({row["date"] for row in rows})
    sources = list({row["source_name"] for row in rows})
    source_ids = [row["id"] for row in rows if row.get("id")]
    existing = analytics_db.fetch_query(
        sql.SQL(
            """
        SELECT id::text AS id, date::text AS date, source_name
        FROM {}.liturgical_calendar
        WHERE (date = ANY(%s::date[]) AND source_name = ANY(%s::text[]))
           OR id = ANY(%s::uuid[])
        """,
        ).format(sql.Identifier(_AWS_SILVER_SCHEMA)),
        (dates, sources, source_ids),
        pool=analytics_db.get_etl_pool(),
    )
    existing_by_id = {row["id"]: row["id"] for row in existing}
    existing_by_key = {(row["date"], row["source_name"]): row["id"] for row in existing}

    payloads: list[dict[str, Any]] = []
    for row in rows:
        source_id = str(row.get("id")) if row.get("id") else None
        payload = _db_payload(row)
        payload["id"] = (
            existing_by_id.get(source_id) or existing_by_key.get((payload["date"], payload["source_name"])) or source_id
        )
        payloads.append(payload)

    for offset in range(0, len(payloads), _LITURGICAL_CHUNK):
        analytics_db.upsert_rows(
            _AWS_SILVER_SCHEMA,
            "liturgical_calendar",
            payloads[offset : offset + _LITURGICAL_CHUNK],
            "id",
            pool=analytics_db.get_etl_pool(),
        )
    analytics_db.execute(
        "SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics()", pool=analytics_db.get_etl_pool()
    )
    return len(payloads)


def _upsert_batch(
    rows: list[dict[str, Any]],
    run_id: Optional[str] = None,
    *,
    authoritative_approval: bool = False,
) -> int:
    if not rows:
        return 0

    from app.services import analytics_db

    if authoritative_approval:
        return _upsert_authoritative_calendar(rows)

    canonical_in_supabase = LITURGICAL_CANONICAL_SOURCE == "supabase" and not authoritative_approval
    if canonical_in_supabase:
        published = _publish_review_candidates(rows, run_id=run_id)
        logger.info("Published %d liturgical candidates to Supabase for review", published)

    dates = list({row["date"] for row in rows})
    sources = list({row["source_name"] for row in rows})
    source_ids = [row["id"] for row in rows if authoritative_approval and row.get("id")]

    with analytics_db.get_etl_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                sql.SQL(
                    """
                SELECT id, date::text AS date, source_name, review_status
                FROM {}.liturgical_calendar
                WHERE (date = ANY(%s::date[]) AND source_name = ANY(%s::text[]))
                   OR id = ANY(%s::uuid[])
                """,
                ).format(sql.Identifier(_AWS_SILVER_SCHEMA)),
                (dates, sources, source_ids),
            )
            existing_by_key = {
                (record["date"], record["source_name"]): (str(record["id"]), record["review_status"])
                for record in cur.fetchall()
            }
            existing_by_id = {value[0]: value for value in existing_by_key.values()}

            inserts: list[dict[str, Any]] = []
            updates: list[tuple[str, dict[str, Any]]] = []
            staging_rows: list[dict[str, Any]] = []
            skipped = 0
            for row in rows:
                payload = _db_payload(row)
                key = (payload["date"], payload["source_name"])
                source_id = str(row.get("id")) if row.get("id") else None
                existing = (
                    existing_by_id.get(source_id) if authoritative_approval and source_id else existing_by_key.get(key)
                )
                if existing:
                    record_id, existing_status = existing
                    if existing_status in {"approved", "approved_with_revisions"} and not authoritative_approval:
                        action = "skip_approved"
                        skipped += 1
                    else:
                        action = "update"
                        updates.append((record_id, payload))
                else:
                    action = "insert"
                    if authoritative_approval and source_id:
                        payload["id"] = source_id
                    inserts.append(payload)
                if run_id:
                    staging_rows.append(_staging_payload(row, run_id, action))

            # With Supabase ownership, AWS receives raw staging now and only
            # receives canonical rows later through the approval synchronizer.
            if canonical_in_supabase:
                inserts = []
                updates = []

            staging_id_map: dict[tuple[str, str], str] = {}
            for payload in staging_rows:
                columns = list(payload)
                statement = sql.SQL("INSERT INTO staging.liturgical_calendar ({}) VALUES ({}) RETURNING id").format(
                    sql.SQL(", ").join(sql.Identifier(column) for column in columns),
                    sql.SQL(", ").join(sql.Placeholder() * len(columns)),
                )
                cur.execute(statement, [_adapt(payload[column]) for column in columns])
                staging_id_map[(payload["date"], payload["source_name"])] = str(cur.fetchone()["id"])

            promotions: list[tuple[str, str]] = []
            for payload in inserts:
                columns = list(payload)
                statement = sql.SQL("INSERT INTO {}.liturgical_calendar ({}) VALUES ({}) RETURNING id").format(
                    sql.Identifier(_AWS_SILVER_SCHEMA),
                    sql.SQL(", ").join(sql.Identifier(column) for column in columns),
                    sql.SQL(", ").join(sql.Placeholder() * len(columns)),
                )
                cur.execute(statement, [_adapt(payload[column]) for column in columns])
                record_id = str(cur.fetchone()["id"])
                staging_id = staging_id_map.get((payload["date"], payload["source_name"]))
                if staging_id:
                    promotions.append((staging_id, record_id))

            for record_id, payload in updates:
                columns = list(payload)
                statement = sql.SQL("UPDATE {}.liturgical_calendar SET {} WHERE id = %s").format(
                    sql.Identifier(_AWS_SILVER_SCHEMA),
                    sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(column)) for column in columns)
                )
                cur.execute(statement, [*[_adapt(payload[column]) for column in columns], record_id])
                staging_id = staging_id_map.get((payload["date"], payload["source_name"]))
                if staging_id:
                    promotions.append((staging_id, record_id))

            for staging_id, record_id in promotions:
                cur.execute(
                    """
                    UPDATE staging.liturgical_calendar
                    SET promoted_record_id = %s, applied_at = now()
                    WHERE id = %s
                    """,
                    (record_id, staging_id),
                )
        conn.commit()

    analytics_db.execute(
        "SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics()", pool=analytics_db.get_etl_pool()
    )

    if inserts:
        logger.info("Inserted %d liturgical calendar rows", len(inserts))
    if updates:
        logger.info("Updated %d liturgical calendar rows", len(updates))
    if skipped:
        logger.info("Skipped %d approved rows (protected from overwrite)", skipped)
    return len(rows)


def sync_approved_from_supabase() -> int:
    """Refresh AWS from Supabase canonical rows, including approval reversals."""
    from app.services.supabase_client import get_table

    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = (
            get_table("reference", "liturgical_calendar")
            .select("*")
            .order("updated_at")
            .order("id")
            .range(offset, offset + _LITURGICAL_CHUNK - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < _LITURGICAL_CHUNK:
            break
        offset += _LITURGICAL_CHUNK
    return _upsert_batch(rows, authoritative_approval=True)


async def run_approval_sync_forever(stop_event) -> None:
    """Periodically publish the canonical Supabase calendar into AWS."""
    import asyncio

    from app.config import LITURGICAL_APPROVAL_POLL_SECONDS

    while not stop_event.is_set():
        try:
            await asyncio.to_thread(sync_approved_from_supabase)
        except Exception:
            logger.exception("Liturgical approval synchronization failed")
            from app.services import analytics_db

            analytics_db.discard_etl_pool()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=LITURGICAL_APPROVAL_POLL_SECONDS)
        except TimeoutError:
            pass


def _adapt(value: Any) -> Any:
    return Jsonb(value) if isinstance(value, (dict, list)) else value


def load_records(
    rows: list[dict[str, Any]],
    include_pending: bool = True,
    run_id: Optional[str] = None,
) -> int:
    if not include_pending:
        rows = [row for row in rows if row.get("review_status") in {"approved", "approved_with_revisions"}]
    count = _upsert_batch(rows, run_id=run_id)
    logger.info("Liturgical calendar direct load complete - %d rows processed.", count)
    return count


def load_from_file(
    path: Path,
    include_pending: bool = True,
    run_id: Optional[str] = None,
) -> int:
    logger.info("Loading liturgical calendar data from %s", path)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("records", [])
    if not include_pending:
        rows = [row for row in rows if row.get("review_status") in {"approved", "approved_with_revisions"}]
    count = _upsert_batch(rows, run_id=run_id)
    logger.info("Liturgical calendar load complete — %d rows processed.", count)
    return count


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Load liturgical calendar JSON into AWS")
    parser.add_argument(
        "--file",
        type=str,
        default=str(DEFAULT_OUT_DIR / "liturgical_calendar_clean.json"),
    )
    parser.add_argument(
        "--approved-only",
        action="store_true",
        help="Only load rows already approved by a human reviewer",
    )
    parser.add_argument(
        "--sync-approved-from-supabase",
        action="store_true",
        help="Refresh AWS analytics from the Supabase-approved canonical calendar",
    )
    args = parser.parse_args()

    if args.sync_approved_from_supabase:
        loaded = sync_approved_from_supabase()
    else:
        loaded = load_from_file(Path(args.file), include_pending=not args.approved_only)
    print(f"Loaded {loaded} rows into AWS reference.liturgical_calendar")
