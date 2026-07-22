"""
Laguna Province Weather Loader
================================
Upserts weather output JSON into the AWS reference weather tables.
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
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from app.services import analytics_db

logger = logging.getLogger(__name__)

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "weather_output"

# ── Retry helper for Supabase requests ────────────────────────────────────────
# Bulk loads run for tens of minutes; a single transient network blip
# (WinError 10054 connection reset, read timeout) shouldn't crash a run that
# already collected all its data. Real Postgres/API errors (bad payload,
# constraint violation) are not transient and propagate immediately.

_RETRY_MAX_ATTEMPTS = 5
_RETRY_BASE_DELAY_S = 1.0
_RETRY_MAX_DELAY_S = 30.0


def _execute_with_retry(query):
    for attempt in range(_RETRY_MAX_ATTEMPTS):
        try:
            return query.execute()
        except httpx.TransportError as exc:
            if attempt == _RETRY_MAX_ATTEMPTS - 1:
                raise
            delay = min(_RETRY_BASE_DELAY_S * (2**attempt), _RETRY_MAX_DELAY_S) + random.uniform(0, _RETRY_BASE_DELAY_S)
            logger.warning(
                "Supabase request failed (%s: %s) — retrying in %.1fs (attempt %d/%d)",
                type(exc).__name__,
                exc,
                delay,
                attempt + 1,
                _RETRY_MAX_ATTEMPTS,
            )
            time.sleep(delay)


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

    # Fetch existing (date, location) → id so we can tag rows with their PK.
    # PostgREST caps responses at 1000 rows, so page through with .range().
    dates = list({r["date"] for r in rows})
    locations = list({r["location"] for r in rows})

    existing = analytics_db.fetch_query(
        """
        SELECT id::text AS id, date::text AS date, location
        FROM reference.weather_observations
        WHERE date = ANY(%s::date[])
          AND location = ANY(%s::text[])
          AND institution_id IS NULL
        """,
        (dates, locations),
    )
    existing_map = {(row["date"], row["location"]): row["id"] for row in existing}

    # Tag each row with its existing id (if any), then upsert in chunks.
    # Rows with an id → ON CONFLICT (id) DO UPDATE; rows without → INSERT.
    from uuid import uuid4

    tagged: list[dict] = []
    for row in rows:
        rec_id = existing_map.get((row["date"], row["location"]), str(uuid4()))
        tagged.append({**row, "id": rec_id})

    total = 0
    for i in range(0, len(tagged), _OBSERVATIONS_CHUNK):
        chunk = tagged[i : i + _OBSERVATIONS_CHUNK]
        analytics_db.upsert_rows("reference", "weather_observations", chunk, "id")
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
        from app.services.weather_validation import build_chirps_cache, build_meteostat_cache, validate_month
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
            m
            for m in data.get("municipalities", [])
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

    # Older classified exports predate the required WMO label but retain the
    # agreement count and reason. Reconstruct only missing labels; never
    # overwrite a label produced by the current classifier.
    import re

    for row in rows:
        if row.get("wmo_quality_flag"):
            continue
        agreed = int(row.get("validators_agreed") or 0)
        match = re.search(r"\((\d+)\s*/\s*(\d+)\)", str(row.get("reason") or ""))
        total = int(match.group(2)) if match else None
        if total and agreed == total:
            row["wmo_quality_flag"] = "Correct"
        elif total and agreed > total / 2:
            row["wmo_quality_flag"] = "Probably Correct"
        elif agreed > 0:
            row["wmo_quality_flag"] = "Probably Suspect"
        else:
            row["wmo_quality_flag"] = "Suspect"

    available = {
        row["column_name"]
        for row in analytics_db.fetch_query(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'reference' AND table_name = %s
            """,
            (table,),
        )
    }
    unsupported = sorted(set().union(*(row.keys() for row in rows)) - available)
    if unsupported:
        logger.info(
            "Ignoring retired %s input columns: %s",
            table,
            ", ".join(unsupported),
        )
    rows = [{column: value for column, value in row.items() if column in available} for row in rows]

    total = 0
    for i in range(0, len(rows), _DAILY_UPSERT_CHUNK):
        chunk = rows[i : i + _DAILY_UPSERT_CHUNK]
        analytics_db.upsert_rows("reference", table, chunk, "date,municipality")
        total += len(chunk)
        logger.info("Upserted %d/%d %s rows", total, len(rows), table)

    return total


def upsert_weather_rainfall_daily(rows: list[dict]) -> int:
    """Upsert classified rainfall rows into reference.weather_rainfall_daily."""
    return _upsert_daily_table("weather_rainfall_daily", rows)


def upsert_weather_temperature_daily(rows: list[dict]) -> int:
    """Upsert classified temperature rows into reference.weather_temperature_daily."""
    return _upsert_daily_table("weather_temperature_daily", rows)


def upsert_weather_wind_daily(rows: list[dict]) -> int:
    """Upsert classified wind rows into reference.weather_wind_daily."""
    return _upsert_daily_table("weather_wind_daily", rows)


def rebuild_monthly_summary(period_start: Optional[str] = None, period_end: Optional[str] = None) -> int:
    """
    Call reference.rebuild_weather_monthly_summary() to re-aggregate the split
    daily tables into weather_monthly_summary for the given period
    (ISO dates; None = unbounded). Returns the number of month-rows upserted.
    """
    result = analytics_db.call_function(
        "reference",
        "rebuild_weather_monthly_summary",
        p_period_start=period_start,
        p_period_end=period_end,
    )
    try:
        count = int(result)
    except (TypeError, ValueError):
        count = 0
    logger.info("Monthly summary rebuilt — %d month-rows upserted", count)
    return count


def upsert_monthly_confidence(
    daily_rain_rows: list[dict],
    daily_temp_rows: list[dict],
    daily_wind_rows: Optional[list[dict]] = None,
) -> int:
    """
    Compute Cohen's Kappa and Lin's CCC per (municipality, month) for all
    factors and upsert into weather_monthly_summary.
    """
    from collections import defaultdict

    # The deployed warehouse currently stores the multi-rater Fleiss metrics
    # produced by rebuild_weather_monthly_summary(), not the pairwise
    # Cohen/Lin fields produced by this optional local diagnostic. Never write
    # one metric under another metric's name.
    confidence_columns = {
        "rain_cohens_kappa",
        "rain_lins_ccc",
        "severe_cohens_kappa",
        "temp_cohens_kappa",
        "temp_lins_ccc",
        "humidity_cohens_kappa",
        "humidity_lins_ccc",
        "wind_cohens_kappa",
        "wind_lins_ccc",
    }
    available = {
        row["column_name"]
        for row in analytics_db.fetch_query(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'reference'
              AND table_name = 'weather_monthly_summary'
            """
        )
    }
    if not confidence_columns.issubset(available):
        logger.info("Skipping optional Cohen/Lin confidence fields; AWS uses the monthly Fleiss metric schema")
        return 0

    from app.services.weather_daily_classifier import compute_confidence_scores

    rain_by_key: dict[tuple, list[dict]] = defaultdict(list)
    temp_by_key: dict[tuple, list[dict]] = defaultdict(list)
    wind_by_key: dict[tuple, list[dict]] = defaultdict(list)

    for r in daily_rain_rows:
        ym = r["date"][:7] + "-01"
        rain_by_key[(r["municipality"], ym)].append(r)

    for r in daily_temp_rows:
        ym = r["date"][:7] + "-01"
        temp_by_key[(r["municipality"], ym)].append(r)

    for r in daily_wind_rows or []:
        ym = r["date"][:7] + "-01"
        wind_by_key[(r["municipality"], ym)].append(r)

    all_keys = set(rain_by_key.keys()) | set(temp_by_key.keys()) | set(wind_by_key.keys())
    upsert_rows = []

    for municipality, ym in all_keys:
        rain_rows = rain_by_key.get((municipality, ym), [])
        temp_rows = temp_by_key.get((municipality, ym), [])
        wind_rows = wind_by_key.get((municipality, ym), [])
        confidence = compute_confidence_scores(rain_rows, temp_rows, wind_rows)
        upsert_rows.append(
            {
                "year_month": ym,
                "municipality": municipality,
                "rain_cohens_kappa": confidence["rainfall"]["cohens_kappa"],
                "rain_lins_ccc": confidence["rainfall"]["lins_ccc"],
                "severe_cohens_kappa": confidence["severe_weather"]["cohens_kappa"],
                "temp_cohens_kappa": confidence["temperature"]["cohens_kappa"],
                "temp_lins_ccc": confidence["temperature"]["lins_ccc"],
                "humidity_cohens_kappa": confidence["humidity"]["cohens_kappa"],
                "humidity_lins_ccc": confidence["humidity"]["lins_ccc"],
                "wind_cohens_kappa": confidence["wind"]["cohens_kappa"],
                "wind_lins_ccc": confidence["wind"]["lins_ccc"],
            }
        )

    if not upsert_rows:
        return 0

    analytics_db.upsert_rows("reference", "weather_monthly_summary", upsert_rows, "year_month,municipality")

    logger.info("Cohen's Kappa + Lin's CCC upserted for %d municipality-months", len(upsert_rows))
    return len(upsert_rows)


def _fetch_all_daily_rows(table: str) -> list[dict]:
    """Paginate through every row in a reference daily table and return them all."""
    return analytics_db.fetch_all("reference", table, order_by="date")


def confidence_from_db() -> int:
    """
    Fetch all daily rows from the DB and recompute Cohen's Kappa + Lin's CCC
    from the full dataset (all 30 municipalities, all years). Writes results
    to weather_monthly_summary. Use this when the JSON on disk is stale or
    only covers a subset of municipalities.
    """
    logger.info("Fetching all rows from weather_rainfall_daily…")
    rain_rows = _fetch_all_daily_rows("weather_rainfall_daily")
    logger.info("  → %d rainfall rows", len(rain_rows))

    logger.info("Fetching all rows from weather_temperature_daily…")
    temp_rows = _fetch_all_daily_rows("weather_temperature_daily")
    logger.info("  → %d temperature rows", len(temp_rows))

    logger.info("Fetching all rows from weather_wind_daily…")
    wind_rows = _fetch_all_daily_rows("weather_wind_daily")
    logger.info("  → %d wind rows", len(wind_rows))

    count = upsert_monthly_confidence(rain_rows, temp_rows, wind_rows)
    logger.info("Confidence scores updated for %d municipality-months from full DB dataset", count)
    return count


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
    wind_rows = data.get("wind_rows", [])

    rain_count = upsert_weather_rainfall_daily(rain_rows)
    temp_count = upsert_weather_temperature_daily(temp_rows)
    wind_count = upsert_weather_wind_daily(wind_rows)
    count = rain_count + temp_count + wind_count
    logger.info(
        "Classified daily load complete — %d rainfall + %d temperature + %d wind rows upserted.",
        rain_count,
        temp_count,
        wind_count,
    )

    rebuild_monthly_summary(data.get("period_start"), data.get("period_end"))
    upsert_monthly_confidence(rain_rows, temp_rows, wind_rows)
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
        "--confidence-from-db",
        action="store_true",
        help=(
            "Recompute Cohen's Kappa + Lin's CCC from ALL rows in the DB "
            "(all municipalities, all years) and write to weather_monthly_summary. "
            "Use this instead of --daily-classified when the JSON on disk is stale."
        ),
    )
    parser.add_argument(
        "--out", type=str, default=str(DEFAULT_OUT_DIR), help="Directory containing the JSON output files"
    )
    args = parser.parse_args()

    out_dir = Path(args.out)

    if args.confidence_from_db:
        count = confidence_from_db()
        print(f"Confidence scores updated for {count} municipality-months from full DB dataset")
    elif args.daily_classified:
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
