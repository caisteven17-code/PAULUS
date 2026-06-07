"""
Laguna Province Incremental Weather Updater
============================================
Reads champion_map.json (written by weather_collector.py) and fetches only the
last N days of weather data from the champion source for each municipality.
Uses the next-best source as fallback if the champion fails.
Merges IBTrACS typhoon flags and saves daily records ready for weather_loader.py.

The 10-day cadence: run this after the initial collection, then every 10 days to
keep reference.weather_observations current.  End date is always today minus 7
days (reanalysis lag) so the request stays within the available data window.

Usage:
  python weather_updater.py                  # fetch last 10 days (default)
  python weather_updater.py --days 7         # custom lookback window
  python weather_updater.py --load           # fetch then load into Supabase
  python weather_updater.py --out /path      # custom output directory
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "weather_output"
DEFAULT_LOOKBACK_DAYS = 10
REANALYSIS_LAG_DAYS = 7

# Source priority order used when building fallback list
_SOURCE_ORDER = ["open_meteo", "nasa_power_ag", "nasa_power_sb"]


# ── Run record helpers ────────────────────────────────────────────────────────


def _create_run_record(period_start: date, period_end: date) -> Optional[str]:
    try:
        from app.services.supabase_client import get_table

        resp = (
            get_table("reference", "weather_runs")
            .insert(
                {
                    "mode": "incremental",
                    "status": "running",
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return resp.data[0]["id"] if resp.data else None
    except Exception as exc:
        logger.warning("Could not create weather run record: %s", exc)
        return None


def _update_run_record(
    run_id: Optional[str],
    status: str,
    municipalities_count: int = 0,
    records_loaded: int = 0,
    error_detail: Optional[str] = None,
) -> None:
    if not run_id:
        return
    try:
        from app.services.supabase_client import get_table

        get_table("reference", "weather_runs").update(
            {
                "status": status,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "municipalities_count": municipalities_count,
                "records_loaded": records_loaded,
                "error_detail": error_detail,
            }
        ).eq("id", run_id).execute()
    except Exception as exc:
        logger.warning("Could not update weather run record: %s", exc)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_champion_map(out_dir: Path) -> dict:
    champion_file = out_dir / "champion_map.json"
    if not champion_file.exists():
        raise FileNotFoundError(
            f"champion_map.json not found at {champion_file}. "
            "Run weather_collector.py first to establish champion sources."
        )
    return json.loads(champion_file.read_text())


def _fetch_for_source(
    source_name: str,
    lat: float,
    lon: float,
    start: date,
    end: date,
) -> list[dict]:
    from app.services.weather_collector import (
        fetch_nasa_power_ag,
        fetch_nasa_power_sb,
        fetch_open_meteo,
    )

    if source_name == "open_meteo":
        return fetch_open_meteo(lat, lon, start, end)
    if source_name == "nasa_power_ag":
        return fetch_nasa_power_ag(lat, lon, start, end)
    if source_name == "nasa_power_sb":
        return fetch_nasa_power_sb(lat, lon, start, end)
    raise ValueError(f"Unknown source name: {source_name!r}")


def _fallbacks(champion: str) -> list[str]:
    """Return the other two sources in priority order, skipping the champion."""
    return [s for s in _SOURCE_ORDER if s != champion]


def _merge_ibtracs(records: list[dict], typhoon_flags: dict) -> list[dict]:
    """Attach IBTrACS fields to each daily record in-place and return the list."""
    for r in records:
        flag = typhoon_flags.get(r["date"])
        r["typhoon_day"] = bool(flag)
        r["storm_name"] = flag["storm_name"] if flag else None
        r["max_wind_kt"] = flag["max_wind_kt"] if flag else None
        r["intensity_class"] = flag["intensity_class"] if flag else None
    return records


# ── Main updater ──────────────────────────────────────────────────────────────


def update(
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    out_dir: Path = DEFAULT_OUT_DIR,
    load: bool = False,
) -> dict:
    """
    Fetch the last `lookback_days` days from each municipality's champion source.
    Falls back to the next-best source if the champion returns no data.
    Saves laguna_weather_incremental.json and returns a summary dict.
    """
    from app.services.weather_collector import MUNICIPALITIES
    from app.services.weather_ibtracs import get_typhoon_flags

    end_date = date.today() - timedelta(days=REANALYSIS_LAG_DAYS)
    start_date = end_date - timedelta(days=lookback_days - 1)

    logger.info(
        "Incremental update: %s → %s (%d days lookback)",
        start_date,
        end_date,
        lookback_days,
    )

    run_id = _create_run_record(start_date, end_date)

    champion_data = _load_champion_map(out_dir)
    champion_map: dict[str, str] = champion_data.get("champions", {})
    logger.info(
        "Champion map loaded (%d municipalities, last full fetch: %s)",
        len(champion_map),
        champion_data.get("last_fetched_end", "unknown"),
    )

    # Pre-load IBTrACS flags for the incremental window (re-uses the 7-day cache)
    try:
        typhoon_flags = get_typhoon_flags(start_date.year, end_date.year)
        window_flags = {
            d: v
            for d, v in typhoon_flags.items()
            if start_date.isoformat() <= d <= end_date.isoformat()
        }
        logger.info("IBTrACS: %d typhoon-day flags in update window", len(window_flags))
    except Exception as exc:
        logger.warning("IBTrACS unavailable (%s) — typhoon fields will be empty", exc)
        typhoon_flags = {}
        window_flags = {}

    # Build name→coords lookup from the canonical MUNICIPALITIES list
    muni_coords = {m["name"]: m for m in MUNICIPALITIES}

    results: list[dict] = []

    for name, champion in champion_map.items():
        muni = muni_coords.get(name)
        if not muni:
            logger.warning(
                "Municipality %r not found in MUNICIPALITIES — skipping", name
            )
            continue

        lat = muni["lat"]
        lon = muni["lon"]

        source_used = champion
        records: list[dict] = []

        # Try champion first, then fallbacks
        for source in [champion] + _fallbacks(champion):
            try:
                fetched = _fetch_for_source(source, lat, lon, start_date, end_date)
            except Exception as exc:
                logger.warning(
                    "[%s] source %s raised %s — trying next", name, source, exc
                )
                fetched = []

            if fetched:
                source_used = source
                records = fetched
                if source != champion:
                    logger.info("[%s] fallback to %s succeeded", name, source)
                break
            else:
                logger.warning("[%s] source %s returned no data", name, source)

        if not records:
            logger.error(
                "[%s] all sources returned no data for %s → %s",
                name,
                start_date,
                end_date,
            )
        else:
            _merge_ibtracs(records, typhoon_flags)
            logger.info(
                "[%s] %d daily records from %s", name, len(records), source_used
            )

        results.append(
            {
                "municipality": name,
                "latitude": lat,
                "longitude": lon,
                "champion_source": champion,
                "source_used": source_used,
                "period_start": start_date.isoformat(),
                "period_end": end_date.isoformat(),
                "daily_records": records,
            }
        )

        time.sleep(0.5)  # gentle rate limit between municipalities

    # Persist incremental output
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "laguna_weather_incremental.json"
    out_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "period_start": start_date.isoformat(),
                "period_end": end_date.isoformat(),
                "lookback_days": lookback_days,
                "municipalities": results,
            },
            indent=2,
        )
    )
    logger.info("Incremental output saved → %s", out_path)

    records_loaded = 0
    try:
        if load:
            from app.services.weather_loader import load_incremental

            records_loaded = load_incremental(out_path)
            logger.info(
                "Loaded %d records into reference.weather_observations", records_loaded
            )

        _update_run_record(run_id, "success", len(results), records_loaded)
    except Exception as exc:
        _update_run_record(
            run_id, "failed", len(results), records_loaded, error_detail=str(exc)
        )
        raise

    return {
        "municipalities": results,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "record_count": sum(len(m["daily_records"]) for m in results),
        "records_loaded": records_loaded,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    parser = argparse.ArgumentParser(
        description="Incremental weather updater for Laguna Province"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_LOOKBACK_DAYS,
        help=f"Lookback window in days (default: {DEFAULT_LOOKBACK_DAYS})",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=str(DEFAULT_OUT_DIR),
        help="Output directory (must contain champion_map.json)",
    )
    parser.add_argument(
        "--load",
        action="store_true",
        help="Also load results into Supabase after fetching",
    )
    args = parser.parse_args()

    result = update(lookback_days=args.days, out_dir=Path(args.out), load=args.load)
    print(
        f"Updated {len(result['municipalities'])} municipalities "
        f"({result['record_count']} daily records): "
        f"{result['period_start']} → {result['period_end']}"
    )
    if args.load:
        print(
            f"Loaded {result['records_loaded']} records into reference.weather_observations"
        )
