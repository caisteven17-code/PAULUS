"""
Philippine Liturgical Calendar Loader
=====================================
Loads collector/updater JSON into reference.liturgical_calendar in Supabase.

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

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"


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
        "psalter_week",
        "source_name",
        "source_url",
        "source_reference",
        "raw_payload",
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
        "psalter_week": row.get("psalter_week"),
        "source_name": row.get("source_name"),
        "source_url": row.get("source_url"),
        "source_reference": row.get("source_reference"),
        "raw_payload": row.get("raw_payload"),
        "revision_payload": row.get("revision_payload"),
        "review_status": row.get("review_status"),
        "action": action,
    }


def _upsert_batch(rows: list[dict[str, Any]], run_id: Optional[str] = None) -> int:
    if not rows:
        return 0

    from app.services.supabase_client import get_table

    main_table = get_table("reference", "liturgical_calendar")
    dates = list({row["date"] for row in rows})
    sources = list({row["source_name"] for row in rows})

    existing_resp = (
        main_table.select("id, date, source_name, review_status")
        .in_("date", dates)
        .in_("source_name", sources)
        .execute()
    )
    existing_map: dict[tuple[str, str], tuple[str, str]] = {
        (r["date"], r["source_name"]): (r["id"], r["review_status"])
        for r in (existing_resp.data or [])
    }

    # Pass 1: categorize
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

    # Pass 2: write all proposed rows to staging
    staging_id_map: dict[tuple[str, str], str] = {}
    staging_table = None
    if run_id and staging_rows:
        try:
            staging_table = get_table("staging", "liturgical_calendar")
            staging_resp = staging_table.insert(staging_rows).execute()
            staging_id_map = {
                (s["date"], s["source_name"]): s["id"]
                for s in (staging_resp.data or [])
            }
        except Exception as exc:
            logger.warning("Could not write to staging: %s", exc)
            staging_table = None

    # Pass 3: promote inserts to main table
    promotions: list[tuple[str, str]] = []  # (staging_id, main_record_id)
    if inserts:
        insert_resp = main_table.insert(inserts).execute()
        logger.info("Inserted %d liturgical calendar rows", len(inserts))
        for promoted in insert_resp.data or []:
            key = (promoted["date"], promoted["source_name"])
            staging_id = staging_id_map.get(key)
            if staging_id:
                promotions.append((staging_id, promoted["id"]))

    # Pass 4: promote updates to main table
    for record_id, payload in updates:
        main_table.update(payload).eq("id", record_id).execute()
        key = (payload["date"], payload["source_name"])
        staging_id = staging_id_map.get(key)
        if staging_id:
            promotions.append((staging_id, record_id))
    if updates:
        logger.info("Updated %d liturgical calendar rows", len(updates))
    if skipped:
        logger.info("Skipped %d approved rows (protected from overwrite)", skipped)

    # Pass 5: mark promoted staging rows
    if staging_table and promotions:
        now_iso = datetime.now(timezone.utc).isoformat()
        for staging_id, main_record_id in promotions:
            try:
                staging_table.update(
                    {
                        "promoted_record_id": main_record_id,
                        "applied_at": now_iso,
                    }
                ).eq("id", staging_id).execute()
            except Exception as exc:
                logger.warning(
                    "Could not mark staging row %s as applied: %s", staging_id, exc
                )

    return len(rows)


def load_from_file(
    path: Path,
    include_pending: bool = True,
    run_id: Optional[str] = None,
) -> int:
    logger.info("Loading liturgical calendar data from %s", path)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("records", [])
    if not include_pending:
        rows = [
            row
            for row in rows
            if row.get("review_status") in {"approved", "approved_with_revisions"}
        ]
    count = _upsert_batch(rows, run_id=run_id)
    logger.info("Liturgical calendar load complete — %d rows processed.", count)
    return count


if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    parser = argparse.ArgumentParser(
        description="Load liturgical calendar JSON into Supabase"
    )
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
    print(f"Loaded {loaded} rows into reference.liturgical_calendar")
