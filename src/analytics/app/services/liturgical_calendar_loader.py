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

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
_LITURGICAL_CHUNK = 300


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
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    return payload


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


def _upsert_batch(rows: list[dict[str, Any]], run_id: Optional[str] = None) -> int:
    if not rows:
        return 0

    from app.services import analytics_db

    dates = list({row["date"] for row in rows})
    sources = list({row["source_name"] for row in rows})

    with analytics_db.get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, date::text AS date, source_name, review_status
                FROM reference.liturgical_calendar
                WHERE date = ANY(%s::date[]) AND source_name = ANY(%s::text[])
                """,
                (dates, sources),
            )
            existing_map = {
                (record["date"], record["source_name"]): (str(record["id"]), record["review_status"])
                for record in cur.fetchall()
            }

            inserts: list[dict[str, Any]] = []
            updates: list[tuple[str, dict[str, Any]]] = []
            staging_rows: list[dict[str, Any]] = []
            skipped = 0
            for row in rows:
                payload = _db_payload(row)
                key = (payload["date"], payload["source_name"])
                existing = existing_map.get(key)
                if existing:
                    record_id, existing_status = existing
                    if existing_status in {"approved", "approved_with_revisions"}:
                        action = "skip_approved"
                        skipped += 1
                    else:
                        action = "update"
                        updates.append((record_id, payload))
                else:
                    action = "insert"
                    inserts.append(payload)
                if run_id:
                    staging_rows.append(_staging_payload(row, run_id, action))

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
                statement = sql.SQL(
                    "INSERT INTO reference.liturgical_calendar ({}) VALUES ({}) RETURNING id"
                ).format(
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
                statement = sql.SQL("UPDATE reference.liturgical_calendar SET {} WHERE id = %s").format(
                    sql.SQL(", ").join(
                        sql.SQL("{} = %s").format(sql.Identifier(column)) for column in columns
                    )
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

    analytics_db.execute("SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics()")

    if inserts:
        logger.info("Inserted %d liturgical calendar rows", len(inserts))
    if updates:
        logger.info("Updated %d liturgical calendar rows", len(updates))
    if skipped:
        logger.info("Skipped %d approved rows (protected from overwrite)", skipped)
    return len(rows)


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
    args = parser.parse_args()

    loaded = load_from_file(Path(args.file), include_pending=not args.approved_only)
    print(f"Loaded {loaded} rows into AWS reference.liturgical_calendar")
