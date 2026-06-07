"""
Laguna Province Multi-Source Weather Collector (Enhanced)
==========================================================
Fetches 3 years of historical weather data for all 30 Laguna municipalities
from three independent sources, scores each source's validity, selects the
champion (highest score) per municipality, and merges IBTrACS typhoon flags.

Sources:
  1. Open-Meteo   — ERA5-Land reanalysis (~11 km, free, no API key)
  2. NASA POWER AG — MERRA-2 agroclimatology, 10m wind (free, no API key)
  3. NASA POWER SB — MERRA-2 sustainable buildings, 50m wind (free, no API key)

Validity scoring (matches teammate's methodology):
  Coverage     30% — % of days with non-null temperature data
  Plausibility 30% — % of values within Philippine climate bounds
  Consistency  40% — agreement with cross-source daily medians

Champion = source with highest composite score per municipality.

Usage:
  python weather_collector.py               # full 3-year historical run
  python weather_collector.py --start 2023  # custom start year
  python weather_collector.py --out /path   # custom output directory

Output:
  {out_dir}/laguna_weather_per_city/{city}.json
  {out_dir}/laguna_weather_final.json
  {out_dir}/laguna_source_validity_report.json
  {out_dir}/champion_map.json               # used by weather_updater.py
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Output directory ──────────────────────────────────────────────────────────

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "weather_output"

# ── Run record helpers ────────────────────────────────────────────────────────


def _create_run_record(period_start: date, period_end: date) -> Optional[str]:
    try:
        from app.services.supabase_client import get_table

        resp = (
            get_table("reference", "weather_runs")
            .insert({
                "mode": "full",
                "status": "running",
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "started_at": datetime.now(timezone.utc).isoformat(),
            })
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

        get_table("reference", "weather_runs").update({
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "municipalities_count": municipalities_count,
            "records_loaded": records_loaded,
            "error_detail": error_detail,
        }).eq("id", run_id).execute()
    except Exception as exc:
        logger.warning("Could not update weather run record: %s", exc)


# ── Date range ────────────────────────────────────────────────────────────────

# Reanalysis data has ~7 day lag — stay safely within the available window
REANALYSIS_LAG_DAYS = 7


def _default_start() -> date:
    today = date.today()
    return date(today.year - 3, today.month, today.day)


def _default_end() -> date:
    return date.today() - timedelta(days=REANALYSIS_LAG_DAYS)


# ── Philippine climate plausibility bounds ────────────────────────────────────

PH_TEMP_MIN = 18.0  # °C — coldest highland nights in Laguna
PH_TEMP_MAX = 40.0  # °C — extreme heat events
PH_RAIN_MIN = 0.0  # mm
PH_RAIN_MAX = 800.0  # mm/day — extreme typhoon rainfall


# ── 30 Laguna municipalities with coordinates ─────────────────────────────────

MUNICIPALITIES: list[dict] = [
    {"name": "San Pablo City", "lat": 14.0683, "lon": 121.3229},
    {"name": "Calamba City", "lat": 14.2117, "lon": 121.1653},
    {"name": "Santa Rosa City", "lat": 14.3122, "lon": 121.1114},
    {"name": "Biñan City", "lat": 14.3317, "lon": 121.0783},
    {"name": "Cabuyao City", "lat": 14.2739, "lon": 121.1239},
    {"name": "San Pedro City", "lat": 14.3583, "lon": 121.0472},
    {"name": "Los Baños", "lat": 14.1667, "lon": 121.2436},
    {"name": "Santa Cruz", "lat": 14.2778, "lon": 121.4133},
    {"name": "Pagsanjan", "lat": 14.2686, "lon": 121.4578},
    {"name": "Nagcarlan", "lat": 13.9206, "lon": 121.4156},
    {"name": "Liliw", "lat": 14.1292, "lon": 121.4342},
    {"name": "Majayjay", "lat": 14.0247, "lon": 121.4758},
    {"name": "Magdalena", "lat": 14.2033, "lon": 121.4442},
    {"name": "Pila", "lat": 14.2353, "lon": 121.3656},
    {"name": "Bay", "lat": 14.1783, "lon": 121.2847},
    {"name": "Calauan", "lat": 14.1425, "lon": 121.3203},
    {"name": "Luisiana", "lat": 14.1719, "lon": 121.5058},
    {"name": "Cavinti", "lat": 14.2458, "lon": 121.5133},
    {"name": "Lumban", "lat": 14.2967, "lon": 121.4742},
    {"name": "Paete", "lat": 14.3628, "lon": 121.5031},
    {"name": "Pakil", "lat": 14.3772, "lon": 121.4742},
    {"name": "Pangil", "lat": 14.4003, "lon": 121.4619},
    {"name": "Siniloan", "lat": 14.4258, "lon": 121.4472},
    {"name": "Famy", "lat": 14.4342, "lon": 121.4806},
    {"name": "Mabitac", "lat": 14.4556, "lon": 121.4364},
    {"name": "Santa Maria", "lat": 14.4903, "lon": 121.4275},
    {"name": "Rizal", "lat": 14.1003, "lon": 121.3917},
    {"name": "Victoria", "lat": 14.2128, "lon": 121.3478},
    {"name": "Alaminos", "lat": 14.0619, "lon": 121.2478},
    {"name": "Kalayaan", "lat": 14.3167, "lon": 121.5167},
]


# ── HTTP helper with retry + exponential backoff ──────────────────────────────


def _fetch_json(url: str, max_retries: int = 4, base_delay: float = 2.0) -> Optional[dict]:
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            wait = base_delay * (2**attempt)
            if attempt < max_retries - 1:
                logger.warning("Fetch failed (%s) — retrying in %.0fs: %s", type(exc).__name__, wait, url[:80])
                time.sleep(wait)
            else:
                logger.error("All retries exhausted for %s: %s", url[:80], exc)
    return None


# ── Source fetchers (daily → list of {date, temp_avg_c, rainfall_mm, wind_ms}) ─


def fetch_open_meteo(lat: float, lon: float, start: date, end: date) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,windspeed_10m_max",
            "timezone": "Asia/Manila",
            "wind_speed_unit": "ms",
        }
    )
    url = f"https://archive-api.open-meteo.com/v1/archive?{params}"
    data = _fetch_json(url)
    if not data or "daily" not in data:
        return []

    daily = data["daily"]
    dates = daily.get("time", [])
    temp_mean = daily.get("temperature_2m_mean", [None] * len(dates))
    temp_max = daily.get("temperature_2m_max", [None] * len(dates))
    temp_min = daily.get("temperature_2m_min", [None] * len(dates))
    rain = daily.get("precipitation_sum", [None] * len(dates))
    wind = daily.get("windspeed_10m_max", [None] * len(dates))

    records = []
    for i, d in enumerate(dates):
        t_avg = temp_mean[i]
        if t_avg is None and temp_max[i] is not None and temp_min[i] is not None:
            t_avg = (temp_max[i] + temp_min[i]) / 2
        records.append(
            {
                "date": d,
                "temp_avg_c": t_avg,
                "temp_max_c": temp_max[i],
                "temp_min_c": temp_min[i],
                "rainfall_mm": rain[i],
                "wind_ms": wind[i],
            }
        )
    return records


def _fetch_nasa_power(lat: float, lon: float, start: date, end: date, community: str, wind_param: str) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "parameters": f"T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,{wind_param}",
            "community": community,
            "longitude": lon,
            "latitude": lat,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        }
    )
    url = f"https://power.larc.nasa.gov/api/temporal/daily/point?{params}"
    data = _fetch_json(url)
    if not data:
        return []

    try:
        props = data["properties"]["parameter"]
    except (KeyError, TypeError):
        return []

    t2m = props.get("T2M", {})
    t2m_max = props.get("T2M_MAX", {})
    t2m_min = props.get("T2M_MIN", {})
    precip = props.get("PRECTOTCORR", {})
    wind = props.get(wind_param, {})

    records = []
    for key in t2m:
        # NASA POWER keys are "YYYYMMDD"
        try:
            d = f"{key[:4]}-{key[4:6]}-{key[6:8]}"
        except Exception:
            continue

        def _safe(val):
            try:
                v = float(val)
                return None if v <= -999 else v
            except (TypeError, ValueError):
                return None

        t_avg = _safe(t2m.get(key))
        t_max = _safe(t2m_max.get(key))
        t_min = _safe(t2m_min.get(key))
        if t_avg is None and t_max is not None and t_min is not None:
            t_avg = (t_max + t_min) / 2

        records.append(
            {
                "date": d,
                "temp_avg_c": t_avg,
                "temp_max_c": t_max,
                "temp_min_c": t_min,
                "rainfall_mm": _safe(precip.get(key)),
                "wind_ms": _safe(wind.get(key)),
            }
        )
    return records


def fetch_nasa_power_ag(lat: float, lon: float, start: date, end: date) -> list[dict]:
    return _fetch_nasa_power(lat, lon, start, end, community="AG", wind_param="WS10M")


def fetch_nasa_power_sb(lat: float, lon: float, start: date, end: date) -> list[dict]:
    return _fetch_nasa_power(lat, lon, start, end, community="SB", wind_param="WS50M")


# ── Validity scoring ──────────────────────────────────────────────────────────


def _score_source(records: list[dict], all_sources: dict[str, list[dict]]) -> dict:
    """
    Score a single source's records.
    Returns {coverage, plausibility, consistency, composite} all 0-100.
    """
    if not records:
        return {"coverage": 0, "plausibility": 0, "consistency": 0, "composite": 0}

    total = len(records)

    # Build date-indexed lookup for cross-source consistency
    _by_date: dict[str, float | None] = {r["date"]: r.get("temp_avg_c") for r in records}  # noqa: F841

    # Cross-source medians for consistency check
    source_by_date: dict[str, list[float]] = {}
    for src_records in all_sources.values():
        for r in src_records:
            d = r["date"]
            v = r.get("temp_avg_c")
            if v is not None:
                source_by_date.setdefault(d, []).append(v)

    coverage_count = 0
    plausibility_count = 0
    consistency_count = 0

    for r in records:
        t = r.get("temp_avg_c")
        rn = r.get("rainfall_mm")

        # Coverage
        if t is not None:
            coverage_count += 1

        # Plausibility
        temp_ok = t is not None and PH_TEMP_MIN <= t <= PH_TEMP_MAX
        rain_ok = rn is not None and PH_RAIN_MIN <= rn <= PH_RAIN_MAX
        if temp_ok and rain_ok:
            plausibility_count += 1

        # Consistency — within 15% of cross-source median temperature
        vals = source_by_date.get(r["date"], [])
        if t is not None and len(vals) >= 2:
            vals_sorted = sorted(vals)
            med_idx = len(vals_sorted) // 2
            median = vals_sorted[med_idx]
            if median != 0 and abs(t - median) / abs(median) <= 0.15:
                consistency_count += 1
            elif median == 0 and t == 0:
                consistency_count += 1

    cov = round((coverage_count / total) * 100, 2)
    pla = round((plausibility_count / total) * 100, 2)
    con = round((consistency_count / total) * 100, 2) if total > 0 else 0

    composite = round(cov * 0.30 + pla * 0.30 + con * 0.40, 2)

    return {
        "coverage": cov,
        "plausibility": pla,
        "consistency": con,
        "composite": composite,
        "record_count": total,
    }


# ── Monthly aggregation ───────────────────────────────────────────────────────


def _aggregate_monthly(records: list[dict], typhoon_flags: dict) -> list[dict]:
    """Roll daily records up to monthly summaries."""
    monthly: dict[str, dict] = {}

    for r in records:
        d = r["date"]
        ym = d[:7]  # YYYY-MM

        if ym not in monthly:
            monthly[ym] = {
                "year": int(d[:4]),
                "month": int(d[5:7]),
                "period": ym,
                "temp_avg_c": [],
                "temp_max_c": [],
                "temp_min_c": [],
                "rainfall_mm": [],
                "wind_ms": [],
                "typhoon_days_count": 0,
                "major_events_count": 0,
                "minor_events_count": 0,
                "has_event": False,
                "storm_names": [],
            }

        m = monthly[ym]
        if r.get("temp_avg_c") is not None:
            m["temp_avg_c"].append(r["temp_avg_c"])
        if r.get("temp_max_c") is not None:
            m["temp_max_c"].append(r["temp_max_c"])
        if r.get("temp_min_c") is not None:
            m["temp_min_c"].append(r["temp_min_c"])
        if r.get("rainfall_mm") is not None:
            m["rainfall_mm"].append(r["rainfall_mm"])
        if r.get("wind_ms") is not None:
            m["wind_ms"].append(r["wind_ms"])

        # Merge IBTrACS flags
        flag = typhoon_flags.get(d)
        if flag:
            m["typhoon_days_count"] += 1
            if flag["intensity_class"] == "typhoon":
                m["major_events_count"] += 1
            else:
                m["minor_events_count"] += 1
            if flag["storm_name"] not in m["storm_names"]:
                m["storm_names"].append(flag["storm_name"])
            m["has_event"] = True

    def _avg(lst):
        return round(sum(lst) / len(lst), 2) if lst else None

    def _total(lst):
        return round(sum(lst), 2) if lst else None

    result = []
    for ym in sorted(monthly):
        m = monthly[ym]
        result.append(
            {
                "period": ym,
                "year": m["year"],
                "month": m["month"],
                "temp_avg_c": _avg(m["temp_avg_c"]),
                "temp_max_c": _avg(m["temp_max_c"]),
                "temp_min_c": _avg(m["temp_min_c"]),
                "rainfall_mm": _total(m["rainfall_mm"]),
                "wind_ms_avg": _avg(m["wind_ms"]),
                "typhoon_days_count": m["typhoon_days_count"],
                "major_events_count": m["major_events_count"],
                "minor_events_count": m["minor_events_count"],
                "has_event": m["has_event"],
                "storm_names": m["storm_names"],
            }
        )
    return result


# ── Main collector ────────────────────────────────────────────────────────────


def collect(
    start: Optional[date] = None,
    end: Optional[date] = None,
    out_dir: Path = DEFAULT_OUT_DIR,
    load: bool = False,
) -> dict:
    """
    Run full collection for all 30 municipalities.
    Returns the master output dict (also saved to JSON files).
    """
    start = start or _default_start()
    end = end or _default_end()

    run_id = _create_run_record(start, end)

    out_dir.mkdir(parents=True, exist_ok=True)
    per_city_dir = out_dir / "laguna_weather_per_city"
    per_city_dir.mkdir(exist_ok=True)

    logger.info("Collecting weather %s → %s for %d municipalities", start, end, len(MUNICIPALITIES))

    # Load IBTrACS typhoon flags once for the full date range
    try:
        from app.services.weather_ibtracs import get_typhoon_flags

        typhoon_flags = get_typhoon_flags(start.year, end.year)
        logger.info("IBTrACS loaded — %d typhoon days flagged", len(typhoon_flags))
    except Exception as exc:
        logger.warning("IBTrACS unavailable (%s) — typhoon fields will be 0", exc)
        typhoon_flags = {}

    master: list[dict] = []
    validity_rows: list[dict] = []
    champion_map: dict[str, str] = {}

    for i, muni in enumerate(MUNICIPALITIES):
        name = muni["name"]
        lat = muni["lat"]
        lon = muni["lon"]
        logger.info("[%d/%d] %s", i + 1, len(MUNICIPALITIES), name)

        # Fetch from all 3 sources
        sources = {
            "open_meteo": fetch_open_meteo(lat, lon, start, end),
            "nasa_power_ag": fetch_nasa_power_ag(lat, lon, start, end),
            "nasa_power_sb": fetch_nasa_power_sb(lat, lon, start, end),
        }

        # Score each source
        scores = {src: _score_source(recs, sources) for src, recs in sources.items()}

        # Champion = highest composite score
        champion = max(scores, key=lambda s: scores[s]["composite"])
        champion_map[name] = champion

        logger.info("  Champion: %s (score %.1f)", champion, scores[champion]["composite"])

        # Build monthly data from champion source
        champion_records = sources[champion]
        monthly = _aggregate_monthly(champion_records, typhoon_flags)

        # Per-city output
        city_data = {
            "municipality": name,
            "latitude": lat,
            "longitude": lon,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "champion_source": champion,
            "scores": scores,
            "monthly_data": monthly,
            "raw_by_source": {src: recs for src, recs in sources.items()},
        }

        city_file = per_city_dir / f"{name.lower().replace(' ', '_')}.json"
        city_file.write_text(json.dumps(city_data, indent=2))

        # Validity row for global report
        for src, score in scores.items():
            validity_rows.append(
                {
                    "municipality": name,
                    "source": src,
                    "is_champion": src == champion,
                    **score,
                }
            )

        # Master record (champion data only)
        master.append(
            {
                "municipality": name,
                "latitude": lat,
                "longitude": lon,
                "champion_source": champion,
                "champion_score": scores[champion]["composite"],
                "monthly_data": monthly,
            }
        )

        # Polite delay between municipalities to respect rate limits
        time.sleep(1.5)

    # Save outputs
    master_path = out_dir / "laguna_weather_final.json"
    master_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "municipalities": master,
            },
            indent=2,
        )
    )

    validity_path = out_dir / "laguna_source_validity_report.json"
    # Sort by composite score descending for easy reading
    source_totals: dict[str, list[float]] = {}
    for row in validity_rows:
        source_totals.setdefault(row["source"], []).append(row["composite"])
    global_ranking = sorted(
        [{"source": s, "avg_composite": round(sum(v) / len(v), 2)} for s, v in source_totals.items()],
        key=lambda x: x["avg_composite"],
        reverse=True,
    )
    validity_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "global_ranking": global_ranking,
                "per_municipality": validity_rows,
            },
            indent=2,
        )
    )

    champion_path = out_dir / "champion_map.json"
    champion_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "last_fetched_end": end.isoformat(),
                "champions": champion_map,
            },
            indent=2,
        )
    )

    logger.info("Done. Output saved to %s", out_dir)

    records_loaded = 0
    try:
        if load:
            from app.services.weather_loader import load_from_file

            records_loaded = load_from_file(out_dir / "laguna_weather_final.json")
            logger.info("Loaded %d records into reference.weather_observations", records_loaded)

        _update_run_record(run_id, "success", len(master), records_loaded)
    except Exception as exc:
        _update_run_record(run_id, "failed", len(master), records_loaded, error_detail=str(exc))
        raise

    return {"master": master, "validity": validity_rows, "champion_map": champion_map, "records_loaded": records_loaded}


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Laguna weather collector")
    parser.add_argument("--start", type=str, default=None, help="Start date YYYY-MM-DD (default: 3 years ago)")
    parser.add_argument("--end", type=str, default=None, help="End date YYYY-MM-DD (default: today minus 7 days)")
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR), help="Output directory")
    parser.add_argument("--load", action="store_true", help="Also load results into Supabase after collecting")
    args = parser.parse_args()

    start = date.fromisoformat(args.start) if args.start else None
    end = date.fromisoformat(args.end) if args.end else None

    result = collect(start=start, end=end, out_dir=Path(args.out), load=args.load)
    print(f"Collected {len(result['master'])} municipalities.")
    if args.load:
        print(f"Loaded {result['records_loaded']} records into reference.weather_observations")
