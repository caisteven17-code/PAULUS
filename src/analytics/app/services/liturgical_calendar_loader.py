"""
Philippine Liturgical Calendar Loader
=====================================
Loads collector/updater JSON into reference.liturgical_calendar in Supabase.

Usage:
  python -m app.services.liturgical_calendar_loader
  python -m app.services.liturgical_calendar_loader --file /custom/path.json
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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


def _upsert_batch(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0

    from app.services.supabase_client import get_table

    table = get_table("reference", "liturgical_calendar")
    dates = list({row["date"] for row in rows})
    sources = list({row["source_name"] for row in rows})

    existing_resp = table.select("id, date, source_name").in_("date", dates).in_("source_name", sources).execute()
    existing_map: dict[tuple[str, str], str] = {
        (row["date"], row["source_name"]): row["id"] for row in (existing_resp.data or [])
    }

    inserts: list[dict[str, Any]] = []
    updates: list[tuple[str, dict[str, Any]]] = []

    for row in rows:
        payload = _db_payload(row)
        key = (payload["date"], payload["source_name"])
        if key in existing_map:
            updates.append((existing_map[key], payload))
        else:
            inserts.append(payload)

    if inserts:
        table.insert(inserts).execute()
        logger.info("Inserted %d liturgical calendar rows", len(inserts))

    for record_id, payload in updates:
        table.update(payload).eq("id", record_id).execute()
    if updates:
        logger.info("Updated %d liturgical calendar rows", len(updates))

    return len(rows)


def load_from_file(path: Path, include_pending: bool = True) -> int:
    logger.info("Loading liturgical calendar data from %s", path)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("records", [])
    if not include_pending:
        rows = [row for row in rows if row.get("review_status") in {"approved", "approved_with_revisions"}]
    count = _upsert_batch(rows)
    logger.info("Liturgical calendar load complete - %d rows processed.", count)
    return count


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Load liturgical calendar JSON into Supabase")
    parser.add_argument("--file", type=str, default=str(DEFAULT_OUT_DIR / "liturgical_calendar_clean.json"))
    parser.add_argument("--approved-only", action="store_true", help="Only load rows already approved by a human reviewer")
    args = parser.parse_args()

    loaded = load_from_file(Path(args.file), include_pending=not args.approved_only)
    print(f"Loaded {loaded} rows into reference.liturgical_calendar")
