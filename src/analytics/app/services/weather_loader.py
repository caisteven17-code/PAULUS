"""
Laguna Province Weather Loader
================================
Upserts weather output JSON into reference.weather_observations in Supabase.
Applies the migration in 111_fix_weather_observations_index.sql must be run
first so the (date, location) partial unique index exists.

Entry points:
  load_from_file(path)        — monthly aggregated data from weather_collector.py
                                → one record per (municipality, month, day=1)
                                → includes validation against NOAA GSOD and CHIRPS
  load_incremental(path)      — daily records from weather_updater.py
                                → one record per (municipality, date)
  load_daily_classified(path) — classified daily rows (weather_daily_classifier)
                                → upserts reference.weather_rainfall_daily and
                                  reference.weather_temperature_daily, then calls
                                  reference.rebuild_weather_monthly_summary()

Validation (integrated):
  For monthly loads, each municipality-month is validated:
  - NASA POWER AG (source truth) vs NOAA GSOD (temperature)
  - NASA POWER AG (source truth) vs CHIRPS (rainfall)
  - Stores comparison_result ("matched"/"mismatched"), mismatch_reason, validation_payload

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
    return 5  # super typhoon


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

_OBSERVATIONS_CHUNK = 500


def _upsert_batch(rows: list[dict]) -> int:
    """
    Upsert rows into reference.weather_observations.
    Key: (date, location) where institution_id IS NULL.
    Returns the number of rows processed.
    """
    if not rows:
        return 0

    from app.services.supabase_client import get_table

    # Fetch existing (date, location) → id so we can tag rows with their PK.
    # PostgREST caps responses at 1000 rows, so page through with .range().
    dates = list({r["date"] for r in rows})
    locations = list({r["location"] for r in rows})

    existing_map: dict[tuple[str, str], str] = {}
    page_size = 1000
    offset = 0
    while True:
        existing_resp = (
            get_table("reference", "weather_observations")
            .select("id, date, location")
            .in_("date", dates)
            .in_("location", locations)
            .is_("institution_id", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = existing_resp.data or []
        for r in batch:
            existing_map[(r["date"], r["location"])] = r["id"]
        if len(batch) < page_size:
            break
        offset += page_size

    # Tag each row with its existing id (if any), then upsert in chunks.
    # Rows with an id → ON CONFLICT (id) DO UPDATE; rows without → INSERT.
    tagged: list[dict] = []
    for row in rows:
        rec_id = existing_map.get((row["date"], row["location"]))
        tagged.append({**row, "id": rec_id} if rec_id else {**row})

    total = 0
    for i in range(0, len(tagged), _OBSERVATIONS_CHUNK):
        chunk = tagged[i : i + _OBSERVATIONS_CHUNK]
        get_table("reference", "weather_observations").upsert(chunk).execute()
        total += len(chunk)
        logger.info("Upserted %d/%d weather_observations rows", total, len(tagged))

    return len(rows)


# ── Monthly loader ────────────────────────────────────────────────────────────


def load_from_file(path: Path) -> int:
    """
    Load monthly-aggregated champion data from laguna_weather_final.json.
    Validates each municipality-month against NOAA GSOD and CHIRPS.
    CHIRPS caches are pre-fetched for all municipalities in parallel so the
    load does not make 30 sequential HTTP round-trips.
    Stores one record per (municipality, month) with date = first day of month.
    Returns the total number of rows upserted.
    """
    from concurrent.futures import ThreadPoolExecutor
    from datetime import date as date_class

    logger.info("Loading monthly weather data from %s", path)
    data = json.loads(path.read_text())
    now_iso = datetime.now(timezone.utc).isoformat()

    validate_month = None
    try:
        from app.services.weather_validation import validate_month, build_meteostat_cache, build_chirps_cache
    except ImportError:
        logger.warning("weather_validation module not available — skipping validation")

    period_start = date_class.fromisoformat(data.get("period_start", "2023-01-01"))
    period_end = date_class.fromisoformat(data.get("period_end", "2023-12-31"))

    # ── Pre-fetch Meteostat once for the full date range ─────────────────────
    meteostat_cache: dict = {}
    if validate_month:
        try:
            meteostat_cache = build_meteostat_cache(period_start, period_end)
        except Exception as exc:
            logger.warning("Meteostat cache build failed: %s", exc)

    # ── Pre-fetch CHIRPS for all municipalities in parallel ───────────────────
    chirps_caches: dict[str, dict] = {}
    if validate_month:
        nasa_munis = [
            m for m in data.get("municipalities", [])
            if m.get("champion_source") == "nasa_power_ag"
            and m.get("latitude") is not None
            and m.get("longitude") is not None
        ]

        def _fetch_chirps(muni: dict) -> tuple[str, dict]:
            mname = muni["municipality"]
            try:
                cache = build_chirps_cache(muni["latitude"], muni["longitude"], period_start, period_end)
                logger.info("  CHIRPS %-20s → %d months", mname, len(cache))
                return mname, cache
            except Exception as exc:
                logger.warning("CHIRPS failed for %s: %s", mname, exc)
                return mname, {}

        logger.info("Pre-fetching CHIRPS for %d municipalities in parallel…", len(nasa_munis))
        with ThreadPoolExecutor(max_workers=8) as pool:
            for mname, cache in pool.map(_fetch_chirps, nasa_munis):
                chirps_caches[mname] = cache
        logger.info("CHIRPS prefetch complete.")

    rows: list[dict] = []
    for muni in data.get("municipalities", []):
        name = muni["municipality"]
        source = muni["champion_source"]

        chirps_cache = chirps_caches.get(name, {})

        for m in muni.get("monthly_data", []):
            year = int(m["year"])
            month = int(m["month"])
            date_str = f"{year}-{month:02d}-01"
            rainfall_mm = m.get("rainfall_mm")
            days = calendar.monthrange(year, month)[1]
            daily_avg = (rainfall_mm / days) if rainfall_mm is not None else None

            signal = _typhoon_signal_from_monthly(
                m.get("major_events_count", 0),
                m.get("minor_events_count", 0),
                m.get("typhoon_days_count", 0),
            )

            # Validate NASA POWER AG (champion) against pre-fetched validator caches
            source_truth = None
            validator_sources = None
            comparison_result = None
            mismatch_reason = None
            validation_payload = None

            if source == "nasa_power_ag" and validate_month:
                try:
                    validation = validate_month(
                        name,
                        year,
                        month,
                        m.get("temp_avg_c"),
                        rainfall_mm,
                        meteostat_cache,
                        chirps_cache,
                    )
                    source_truth = validation["source_truth"]
                    validator_sources = validation["validator_sources"]
                    comparison_result = validation["comparison_result"]
                    mismatch_reason = validation["mismatch_reason"]
                    validation_payload = validation["validation_payload"]
                except Exception as exc:
                    logger.warning("Validation failed for %s %d-%02d: %s", name, year, month, exc)

            rows.append(
                {
                    "date": date_str,
                    "institution_id": None,
                    "location": name,
                    "condition": _condition(daily_avg),
                    "temp_avg_c": m.get("temp_avg_c"),
                    "rainfall_mm": rainfall_mm,
                    "typhoon_signal": signal,
                    "is_extreme_event": bool(m.get("has_event", False)),
                    "source": source,
                    "source_truth": source_truth,
                    "validator_sources": validator_sources,
                    "comparison_result": comparison_result,
                    "mismatch_reason": mismatch_reason,
                    "validation_payload": validation_payload,
                    "recorded_at": now_iso,
                }
            )

    logger.info("Processing %d monthly weather records...", len(rows))
    count = _upsert_batch(rows)
    logger.info("Monthly load complete — %d records processed.", count)
    return count


# ── Daily incremental loader ──────────────────────────────────────────────────


def load_incremental(path: Path) -> int:
    """
    Load daily records from laguna_weather_incremental.json (weather_updater output).
    Stores one record per (municipality, date).
    Note: Daily records do not include validation metadata (validation is for monthly aggregates).
    Returns the total number of rows upserted.
    """
    logger.info("Loading incremental weather data from %s", path)
    data = json.loads(path.read_text())
    now_iso = datetime.now(timezone.utc).isoformat()

    rows: list[dict] = []
    for muni in data.get("municipalities", []):
        name = muni["municipality"]
        source = muni.get("source_used") or muni.get("champion_source", "unknown")

        for r in muni.get("daily_records", []):
            rainfall_mm = r.get("rainfall_mm")
            signal = _typhoon_signal_from_kt(
                r.get("max_wind_kt"),
                r.get("intensity_class"),
            )

            rows.append(
                {
                    "date": r["date"],
                    "institution_id": None,
                    "location": name,
                    "condition": _condition(rainfall_mm),
                    "temp_avg_c": r.get("temp_avg_c"),
                    "rainfall_mm": rainfall_mm,
                    "typhoon_signal": signal,
                    "is_extreme_event": bool(r.get("typhoon_day", False)),
                    "source": source,
                    "source_truth": None,
                    "validator_sources": None,
                    "comparison_result": None,
                    "mismatch_reason": None,
                    "validation_payload": None,
                    "recorded_at": now_iso,
                }
            )

    logger.info("Processing %d incremental daily records...", len(rows))
    count = _upsert_batch(rows)
    logger.info("Incremental load complete — %d records processed.", count)
    return count


# ── Classified daily loaders (split daily tables, migration 189) ─────────────

_DAILY_UPSERT_CHUNK = 500


def _upsert_daily_table(table: str, rows: list[dict]) -> int:
    """
    Upsert classified daily rows into a reference-schema daily table.
    Conflict target is the (date, municipality) unique constraint, so
    re-running over the same period is safe.
    """
    if not rows:
        return 0

    from app.services.supabase_client import get_table

    total = 0
    for i in range(0, len(rows), _DAILY_UPSERT_CHUNK):
        chunk = rows[i : i + _DAILY_UPSERT_CHUNK]
        get_table("reference", table).upsert(
            chunk, on_conflict="date,municipality"
        ).execute()
        total += len(chunk)
        logger.info("Upserted %d/%d %s rows", total, len(rows), table)

    return total


def upsert_weather_rainfall_daily(rows: list[dict]) -> int:
    """Upsert classified rainfall rows into reference.weather_rainfall_daily."""
    return _upsert_daily_table("weather_rainfall_daily", rows)


def upsert_weather_temperature_daily(rows: list[dict]) -> int:
    """Upsert classified temperature rows into reference.weather_temperature_daily."""
    return _upsert_daily_table("weather_temperature_daily", rows)


def rebuild_monthly_summary(period_start: Optional[str] = None, period_end: Optional[str] = None) -> int:
    """
    Call reference.rebuild_weather_monthly_summary() to re-aggregate the split
    daily tables into weather_monthly_summary for the given period
    (ISO dates; None = unbounded). Returns the number of month-rows upserted.
    """
    from app.services.supabase_client import get_supabase

    resp = (
        get_supabase()
        .schema("reference")
        .rpc(
            "rebuild_weather_monthly_summary",
            {"p_period_start": period_start, "p_period_end": period_end},
        )
        .execute()
    )
    try:
        count = int(resp.data)
    except (TypeError, ValueError):
        count = 0
    logger.info("Monthly summary rebuilt — %d month-rows upserted", count)
    return count


def upsert_monthly_fleiss_kappa(
    daily_rain_rows: list[dict],
    daily_temp_rows: list[dict],
) -> int:
    """
    Compute Fleiss' Kappa per (municipality, month) from the classified daily rows
    and upsert rain_fleiss_kappa / temp_fleiss_kappa into weather_monthly_summary.

    WCI is already handled by the SQL rebuild function. This covers the Kappa
    columns that require Python to compute.
    """
    from collections import defaultdict
    from app.services.weather_daily_classifier import compute_confidence_scores
    from app.services.supabase_client import get_supabase

    # Group rows by (municipality, year_month)
    rain_by_key: dict[tuple, list[dict]] = defaultdict(list)
    temp_by_key: dict[tuple, list[dict]] = defaultdict(list)

    for r in daily_rain_rows:
        ym = r["date"][:7] + "-01"  # "2024-03-15" → "2024-03-01"
        rain_by_key[(r["municipality"], ym)].append(r)

    for r in daily_temp_rows:
        ym = r["date"][:7] + "-01"
        temp_by_key[(r["municipality"], ym)].append(r)

    all_keys = set(rain_by_key.keys()) | set(temp_by_key.keys())
    upsert_rows = []

    for (municipality, ym) in all_keys:
        rain_rows = rain_by_key.get((municipality, ym), [])
        temp_rows = temp_by_key.get((municipality, ym), [])
        confidence = compute_confidence_scores(rain_rows, temp_rows)
        upsert_rows.append({
            "year_month":         ym,
            "municipality":       municipality,
            "rain_fleiss_kappa":  confidence["rainfall"]["fleiss_kappa"],
            "temp_fleiss_kappa":  confidence["temperature"]["fleiss_kappa"],
        })

    if not upsert_rows:
        return 0

    sb = get_supabase()
    sb.schema("reference").table("weather_monthly_summary").upsert(
        upsert_rows,
        on_conflict="year_month,municipality",
    ).execute()

    logger.info("Fleiss Kappa upserted for %d municipality-months", len(upsert_rows))
    return len(upsert_rows)


def load_daily_classified(path: Path) -> int:
    """
    Load classified daily rows (written by weather_collector.py or
    weather_updater.py) into reference.weather_rainfall_daily and
    reference.weather_temperature_daily, then rebuild the monthly summary
    for the file's period. Returns total rows upserted across both tables.
    """
    logger.info("Loading classified daily weather data from %s", path)
    data = json.loads(path.read_text())

    if "rain_rows" not in data and "temp_rows" not in data:
        raise ValueError(
            f"{path} has the pre-migration-189 single-table shape ('rows' key). "
            "Re-run weather_collector.py (or weather_updater.py) to regenerate it "
            "with the split rain_rows/temp_rows shape."
        )

    rain_rows = data.get("rain_rows", [])
    temp_rows = data.get("temp_rows", [])

    rain_count = upsert_weather_rainfall_daily(rain_rows)
    temp_count = upsert_weather_temperature_daily(temp_rows)
    count = rain_count + temp_count
    logger.info(
        "Classified daily load complete — %d rainfall + %d temperature rows upserted.",
        rain_count,
        temp_count,
    )

    rebuild_monthly_summary(data.get("period_start"), data.get("period_end"))
    upsert_monthly_fleiss_kappa(rain_rows, temp_rows)
    return count


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Load Laguna weather data into reference.weather_observations")
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Path to laguna_weather_final.json (monthly); default: weather_output/laguna_weather_final.json",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Load from laguna_weather_incremental.json (daily) instead of monthly",
    )
    parser.add_argument(
        "--daily-classified",
        action="store_true",
        help=(
            "Load classified daily rows into reference.weather_rainfall_daily and "
            "reference.weather_temperature_daily, then rebuild the monthly summary"
        ),
    )
    parser.add_argument(
        "--out", type=str, default=str(DEFAULT_OUT_DIR), help="Directory containing the JSON output files"
    )
    args = parser.parse_args()

    out_dir = Path(args.out)

    if args.daily_classified:
        target = Path(args.file) if args.file else out_dir / "laguna_weather_daily_classified.json"
        count = load_daily_classified(target)
        print(
            f"Loaded {count} rows into reference.weather_rainfall_daily + "
            f"reference.weather_temperature_daily (monthly summary rebuilt)"
        )
    elif args.incremental:
        target = Path(args.file) if args.file else out_dir / "laguna_weather_incremental.json"
        count = load_incremental(target)
        print(f"Loaded {count} records into reference.weather_observations")
    else:
        target = Path(args.file) if args.file else out_dir / "laguna_weather_final.json"
        count = load_from_file(target)
        print(f"Loaded {count} records into reference.weather_observations")
