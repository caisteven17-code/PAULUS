"""
IBTrACS Typhoon Flagging for Laguna Province
=============================================
Downloads the NOAA IBTrACS Western Pacific best-track CSV and flags every
calendar day where a named typhoon/tropical cyclone was within a configurable
radius of Laguna Province.

IBTrACS is the authoritative global tropical cyclone archive — it aggregates
tracks from PAGASA, JMA, JTWC, and other agencies, so it is effectively the
same data source PAGASA uses internally.

Usage (standalone):
    python weather_ibtracs.py                  # writes ibtracs_laguna_flags.json
    python weather_ibtracs.py --radius 200     # wider radius (km)

Usage (as a module):
    from app.services.weather_ibtracs import get_typhoon_flags
    flags = get_typhoon_flags(start_year=2022, end_year=2026)
    # flags["2024-10-24"] → {"typhoon_day": True, "storm_name": "KRISTINE", ...}

The output integrates directly with the teammate's laguna_weather_all_sources.json:
add the returned flags to each daily record to populate:
  - typhoon_days_count  (1 if typhoon_day else 0, aggregate by month)
  - major_events_count  (wind ≥ 64 kt = typhoon strength)
  - minor_events_count  (wind 34–63 kt = tropical storm strength)
"""

from __future__ import annotations

import csv
import io
import json
import logging
import math
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Laguna Province geographic centroid (decimal degrees)
LAGUNA_LAT = 14.175
LAGUNA_LON = 121.600

# Default radius: a storm within this distance affects Laguna financially
DEFAULT_RADIUS_KM = 150.0

# NOAA IBTrACS WestPacific CSV — updated daily, no API key required
IBTRACS_URL = (
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs"
    "/v04r01/access/csv/ibtracs.WP.list.v04r01.csv"
)

# Local cache path (avoids re-downloading on every run)
CACHE_DIR = Path(__file__).resolve().parents[4] / ".cache"
CACHE_FILE = CACHE_DIR / "ibtracs_WP.csv"
CACHE_MAX_AGE_DAYS = 7  # re-download if older than this

# Intensity thresholds (knots, 1-minute sustained wind — IBTrACS USA_WIND column)
TYPHOON_KT = 64      # Category 1+ typhoon
STORM_KT = 34        # Tropical storm
DEPRESSION_KT = 0    # Tropical depression (any named system)


# ── Haversine distance ────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── IBTrACS download & cache ──────────────────────────────────────────────────

def _download_ibtracs() -> str:
    """Return raw CSV text from cache or fresh download."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if CACHE_FILE.exists():
        age_days = (datetime.now().timestamp() - CACHE_FILE.stat().st_mtime) / 86400
        if age_days < CACHE_MAX_AGE_DAYS:
            logger.info("IBTrACS cache hit (%d days old)", int(age_days))
            return CACHE_FILE.read_text(encoding="utf-8", errors="replace")

    logger.info("Downloading IBTrACS WestPacific CSV from NOAA (~20 MB)…")
    with urllib.request.urlopen(IBTRACS_URL, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    CACHE_FILE.write_text(raw, encoding="utf-8")
    logger.info("IBTrACS cached to %s", CACHE_FILE)
    return raw


# ── Parser ────────────────────────────────────────────────────────────────────

def _parse_ibtracs(
    raw_csv: str,
    start_year: int,
    end_year: int,
    radius_km: float,
) -> dict[str, dict]:
    """
    Parse IBTrACS CSV and return a dict keyed by ISO date string.

    Each entry: {
        "typhoon_day": bool,
        "storm_name": str,
        "distance_km": float,
        "max_wind_kt": float,
        "intensity_class": "typhoon" | "storm" | "depression",
        "count": int  # how many simultaneous storms were within radius
    }
    """
    reader = csv.DictReader(io.StringIO(raw_csv))

    # IBTrACS has two header rows — skip the units row
    rows = list(reader)
    if rows and rows[0].get("SID", "").startswith("Units"):
        rows = rows[1:]

    flags: dict[str, dict] = {}

    for row in rows:
        # ── Parse timestamp ──────────────────────────────────────────────────
        iso_str = row.get("ISO_TIME", "").strip()
        if not iso_str or iso_str == " ":
            continue
        try:
            dt = datetime.strptime(iso_str[:16], "%Y-%m-%d %H:%M")
        except ValueError:
            continue

        if not (start_year <= dt.year <= end_year):
            continue

        day_key = dt.strftime("%Y-%m-%d")

        # ── Parse position ───────────────────────────────────────────────────
        try:
            lat = float(row.get("LAT", "").strip())
            lon = float(row.get("LON", "").strip())
        except (ValueError, AttributeError):
            continue

        dist = _haversine_km(LAGUNA_LAT, LAGUNA_LON, lat, lon)
        if dist > radius_km:
            continue

        # ── Parse wind speed (prefer USA agency wind) ────────────────────────
        wind_kt = 0.0
        for col in ("USA_WIND", "WMO_WIND", "REUNION_WIND", "BOM_WIND"):
            val = row.get(col, "").strip()
            if val and val not in ("", " ", "-9999", "-999"):
                try:
                    wind_kt = float(val)
                    break
                except ValueError:
                    continue

        # ── Intensity class ──────────────────────────────────────────────────
        if wind_kt >= TYPHOON_KT:
            cls = "typhoon"
        elif wind_kt >= STORM_KT:
            cls = "storm"
        else:
            cls = "depression"

        name = row.get("NAME", "UNNAMED").strip() or "UNNAMED"

        # Keep the closest / strongest storm per day
        existing = flags.get(day_key)
        if existing is None or dist < existing["distance_km"]:
            flags[day_key] = {
                "typhoon_day": True,
                "storm_name": name,
                "distance_km": round(dist, 1),
                "max_wind_kt": wind_kt,
                "intensity_class": cls,
                "count": 1,
            }
        else:
            flags[day_key]["count"] += 1
            # upgrade intensity class if this storm is stronger
            if wind_kt > flags[day_key]["max_wind_kt"]:
                flags[day_key]["max_wind_kt"] = wind_kt
                flags[day_key]["intensity_class"] = cls
                flags[day_key]["storm_name"] = name

    return flags


# ── Monthly aggregation ───────────────────────────────────────────────────────

def aggregate_monthly(
    daily_flags: dict[str, dict],
    start_year: int,
    end_year: int,
) -> dict[str, dict]:
    """
    Roll up daily flags to monthly totals.

    Returns dict keyed by "YYYY-MM":
    {
        "typhoon_days_count": int,   # days with typhoon-strength storm nearby
        "major_events_count": int,   # days with ≥64 kt (typhoon)
        "minor_events_count": int,   # days with 34-63 kt (tropical storm)
        "storm_names": list[str],    # distinct storm names that month
    }
    """
    monthly: dict[str, dict] = {}

    start = date(start_year, 1, 1)
    end = date(end_year, 12, 31)
    current = start

    while current <= end:
        month_key = current.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = {
                "typhoon_days_count": 0,
                "major_events_count": 0,
                "minor_events_count": 0,
                "storm_names": [],
            }

        day_key = current.strftime("%Y-%m-%d")
        flag = daily_flags.get(day_key)
        if flag:
            monthly[month_key]["typhoon_days_count"] += 1
            if flag["intensity_class"] == "typhoon":
                monthly[month_key]["major_events_count"] += 1
            else:
                monthly[month_key]["minor_events_count"] += 1
            name = flag["storm_name"]
            if name not in monthly[month_key]["storm_names"]:
                monthly[month_key]["storm_names"].append(name)

        current += timedelta(days=1)

    return monthly


# ── Public API ────────────────────────────────────────────────────────────────

def get_typhoon_flags(
    start_year: int = 2021,
    end_year: int = 2026,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> dict[str, dict]:
    """
    Return daily IBTrACS typhoon flags for Laguna Province.

    Keys are ISO date strings ("2024-10-24").
    Only days where a storm was within `radius_km` are present.
    """
    raw = _download_ibtracs()
    return _parse_ibtracs(raw, start_year, end_year, radius_km)


def get_monthly_typhoon_counts(
    start_year: int = 2021,
    end_year: int = 2026,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> dict[str, dict]:
    """
    Return monthly typhoon/storm counts ready to merge into weather JSON.

    Keys are "YYYY-MM" strings:
    {
        "typhoon_days_count": 3,
        "major_events_count": 1,
        "minor_events_count": 2,
        "storm_names": ["KRISTINE", "LEON"],
    }
    """
    daily = get_typhoon_flags(start_year, end_year, radius_km)
    return aggregate_monthly(daily, start_year, end_year)


# ── CLI entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="IBTrACS typhoon flagging for Laguna Province")
    parser.add_argument("--start", type=int, default=2021, help="Start year (default: 2021)")
    parser.add_argument("--end", type=int, default=2026, help="End year (default: 2026)")
    parser.add_argument("--radius", type=float, default=DEFAULT_RADIUS_KM, help="Radius in km (default: 150)")
    parser.add_argument("--daily", action="store_true", help="Output daily flags instead of monthly")
    parser.add_argument("--out", type=str, default=None, help="Output JSON file path")
    args = parser.parse_args()

    if args.daily:
        result = get_typhoon_flags(args.start, args.end, args.radius)
        label = "daily"
    else:
        result = get_monthly_typhoon_counts(args.start, args.end, args.radius)
        label = "monthly"

    out_path = args.out or f"ibtracs_laguna_{label}_{args.start}_{args.end}.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Written {len(result)} {label} records to {out_path}")

    # Print a quick summary
    if not args.daily:
        months_with_storms = sum(1 for v in result.values() if v["typhoon_days_count"] > 0)
        total_typhoon_days = sum(v["typhoon_days_count"] for v in result.values())
        print(f"Months affected: {months_with_storms}")
        print(f"Total typhoon/storm days within {args.radius} km: {total_typhoon_days}")
