"""
Laguna Province Weather Loader
================================
Upserts weather output JSON into reference.weather_observations in Supabase.
Applies the migration in 111_fix_weather_observations_index.sql must be run
first so the (date, location) partial unique index exists.

Two entry points:
  load_from_file(path)      — monthly aggregated data from weather_collector.py
                              → one record per (municipality, month, day=1)
  load_incremental(path)    — daily records from weather_updater.py
                              → one record per (municipality, date)

Condition thresholds (daily equivalent rainfall):
  sunny  < 1 mm/day
  cloudy 1 – 10 mm/day
  rainy  10 – 50 mm/day
  stormy > 50 mm/day

Typhoon signal (PAGASA scale, from IBTrACS wind kt):
  0 — no storm activity
  1 — tropical depression  (wind < 34 kt)
  2 — tropical storm       (34 – 47 kt)
  3 — severe tropical storm (48 – 63 kt)
  4 — typhoon              (64 – 99 kt)
  5 — super typhoon        (≥ 100 kt)

Usage:
  python weather_loader.py                        # loads laguna_weather_final.json
  python weather_loader.py --incremental          # loads laguna_weather_incremental.json
  python weather_loader.py --file /custom/path.json
"""

from __future__ import annotations

import calendar
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "weather_output"


# ── Condition derivation ──────────────────────────────────────────────────────

def _condition(daily_avg_mm: Optional[float]) -> Optional[str]:
    if daily_avg_mm is None:
        return None
    if daily_avg_mm < 1.0:
        return "sunny"
    if daily_avg_mm < 10.0:
        return "cloudy"
    if daily_avg_mm < 50.0:
        return "rainy"
    return "stormy"


# ── Typhoon signal derivation ─────────────────────────────────────────────────

def _typhoon_signal_from_kt(
    max_wind_kt: Optional[float],
    intensity_class: Optional[str] = None,
) -> int:
    """Map IBTrACS wind speed (knots) to PAGASA signal scale 0–5."""
    if max_wind_kt is None or max_wind_kt == 0:
        if intensity_class == "typhoon":
            return 4
        if intensity_class == "storm":
            return 2
        if intensity_class == "depression":
            return 1
        return 0
    if max_wind_kt < 25:
        return 0  # tropical disturbance, no public warning
    if max_wind_kt < 34:
        return 1  # tropical depression
    if max_wind_kt < 48:
        return 2  # tropical storm
    if max_wind_kt < 64:
        return 3  # severe tropical storm
    if max_wind_kt < 100:
        return 4  # typhoon
    return 5        # super typhoon


def _typhoon_signal_from_monthly(
    major_events: int,
    minor_events: int,
    typhoon_days: int,
) -> int:
    """Derive peak typhoon signal for the month from aggregate event counts."""
    if major_events > 0:
        return 4  # at least one typhoon-class event
    if minor_events > 0:
        return 2  # at least one tropical-storm-class event
    if typhoon_days > 0:
        return 1  # tropical depression only
    return 0


# ── Batch upsert helper ───────────────────────────────────────────────────────

def _upsert_batch(rows: list[dict]) -> int:
    """
    Upsert rows into reference.weather_observations.
    Key: (date, location) where institution_id IS NULL.
    Returns the number of rows processed.
    """
    if not rows:
        return 0

    from app.services.supabase_client import get_table

    # Pre-fetch all existing records for these (date, location) pairs in one call
    dates     = list({r["date"] for r in rows})
    locations = list({r["location"] for r in rows})

    existing_resp = (
        get_table("reference", "weather_observations")
        .select("id, date, location")
        .in_("date", dates)
        .in_("location", locations)
        .is_("institution_id", "null")
        .execute()
    )
    existing_map: dict[tuple[str, str], str] = {
        (r["date"], r["location"]): r["id"]
        for r in (existing_resp.data or [])
    }

    inserts: list[dict] = []
    updates: list[tuple[str, dict]] = []

    for row in rows:
        key = (row["date"], row["location"])
        payload = {k: v for k, v in row.items() if k != "id"}
        if key in existing_map:
            updates.append((existing_map[key], payload))
        else:
            inserts.append(row)

    if inserts:
        get_table("reference", "weather_observations").insert(inserts).execute()
        logger.info("Inserted %d new weather records", len(inserts))

    for rec_id, payload in updates:
        get_table("reference", "weather_observations").update(payload).eq("id", rec_id).execute()
    if updates:
        logger.info("Updated %d existing weather records", len(updates))

    return len(rows)


# ── Monthly loader ────────────────────────────────────────────────────────────

def load_from_file(path: Path) -> int:
    """
    Load monthly-aggregated champion data from laguna_weather_final.json.
    Stores one record per (municipality, month) with date = first day of month.
    Returns the total number of rows upserted.
    """
    logger.info("Loading monthly weather data from %s", path)
    data = json.loads(path.read_text())
    now_iso = datetime.now(timezone.utc).isoformat()

    rows: list[dict] = []
    for muni in data.get("municipalities", []):
        name   = muni["municipality"]
        source = muni["champion_source"]

        for m in muni.get("monthly_data", []):
            year        = int(m["year"])
            month       = int(m["month"])
            date_str    = f"{year}-{month:02d}-01"
            rainfall_mm = m.get("rainfall_mm")
            days        = calendar.monthrange(year, month)[1]
            daily_avg   = (rainfall_mm / days) if rainfall_mm is not None else None

            signal = _typhoon_signal_from_monthly(
                m.get("major_events_count", 0),
                m.get("minor_events_count", 0),
                m.get("typhoon_days_count", 0),
            )

            rows.append({
                "date":             date_str,
                "institution_id":   None,
                "location":         name,
                "condition":        _condition(daily_avg),
                "temp_avg_c":       m.get("temp_avg_c"),
                "rainfall_mm":      rainfall_mm,
                "typhoon_signal":   signal,
                "is_extreme_event": bool(m.get("has_event", False)),
                "source":           source,
                "recorded_at":      now_iso,
            })

    logger.info("Processing %d monthly weather records...", len(rows))
    count = _upsert_batch(rows)
    logger.info("Monthly load complete — %d records processed.", count)
    return count


# ── Daily incremental loader ──────────────────────────────────────────────────

def load_incremental(path: Path) -> int:
    """
    Load daily records from laguna_weather_incremental.json (weather_updater output).
    Stores one record per (municipality, date).
    Returns the total number of rows upserted.
    """
    logger.info("Loading incremental weather data from %s", path)
    data = json.loads(path.read_text())
    now_iso = datetime.now(timezone.utc).isoformat()

    rows: list[dict] = []
    for muni in data.get("municipalities", []):
        name   = muni["municipality"]
        source = muni.get("source_used") or muni.get("champion_source", "unknown")

        for r in muni.get("daily_records", []):
            rainfall_mm = r.get("rainfall_mm")
            signal = _typhoon_signal_from_kt(
                r.get("max_wind_kt"),
                r.get("intensity_class"),
            )

            rows.append({
                "date":             r["date"],
                "institution_id":   None,
                "location":         name,
                "condition":        _condition(rainfall_mm),
                "temp_avg_c":       r.get("temp_avg_c"),
                "rainfall_mm":      rainfall_mm,
                "typhoon_signal":   signal,
                "is_extreme_event": bool(r.get("typhoon_day", False)),
                "source":           source,
                "recorded_at":      now_iso,
            })

    logger.info("Processing %d incremental daily records...", len(rows))
    count = _upsert_batch(rows)
    logger.info("Incremental load complete — %d records processed.", count)
    return count


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(
        description="Load Laguna weather data into reference.weather_observations"
    )
    parser.add_argument(
        "--file", type=str, default=None,
        help="Path to laguna_weather_final.json (monthly); default: weather_output/laguna_weather_final.json"
    )
    parser.add_argument(
        "--incremental", action="store_true",
        help="Load from laguna_weather_incremental.json (daily) instead of monthly"
    )
    parser.add_argument(
        "--out", type=str, default=str(DEFAULT_OUT_DIR),
        help="Directory containing the JSON output files"
    )
    args = parser.parse_args()

    out_dir = Path(args.out)

    if args.incremental:
        target = Path(args.file) if args.file else out_dir / "laguna_weather_incremental.json"
        count  = load_incremental(target)
    else:
        target = Path(args.file) if args.file else out_dir / "laguna_weather_final.json"
        count  = load_from_file(target)

    print(f"Loaded {count} records into reference.weather_observations")
