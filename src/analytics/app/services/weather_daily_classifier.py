"""
Daily Weather Classifier
=========================
Classifies each day per municipality into rain and temperature categories,
cross-checking the source of truth (NASA POWER AG) against validators
(CHIRPS for rainfall, Meteostat for temperature) at the DAILY level.

Output rows match reference.weather_daily (migration 187). Monthly counts are
then aggregated server-side by reference.rebuild_weather_monthly_summary().

Thresholds (PAGASA-based, must stay in sync with migration 187 header):
  rain_classification (daily rainfall total)
    none          rainfall < 1 mm
    rainy         1 mm <= rainfall < 20 mm
    heavy_rain    rainfall >= 20 mm
  temp_classification (daily MAXIMUM temperature — a hot day means the
  day's peak reached the threshold; daily averages in Laguna never do)
    normal        max temp < 33 C
    hot           33 C <= max temp < 42 C
    extreme_heat  max temp >= 42 C

Source agreement (category rule): the source of truth and its validator
AGREE when they classify the day into the SAME category, or — for boundary
cases where the categories differ — when their raw values are within
tolerance (10 mm rain, 3 C temp). When both have data and neither condition
holds, the sources genuinely conflict and the day is 'inconclusive'.
Days with no data at all in a dimension are also 'inconclusive'.

confidence_score: 1.0 when both dimensions agree, 0.5 when one agrees,
0.0 when neither agrees. A dimension only "agrees" when BOTH the source of
truth and its validator have data for the day.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Classification thresholds ─────────────────────────────────────────────────

RAIN_NONE_MAX_MM = 1.0       # below this: no significant rain
HEAVY_RAIN_MIN_MM = 20.0     # at or above this: heavy rain day
HOT_MIN_C = 33.0             # at or above this: hot day
EXTREME_HEAT_MIN_C = 42.0    # at or above this: extreme heat day

# ── Source agreement tolerances (daily) ───────────────────────────────────────

RAIN_AGREE_TOLERANCE_MM = 10.0   # NASA POWER AG vs CHIRPS
TEMP_AGREE_TOLERANCE_C = 3.0     # NASA POWER AG vs Meteostat


# ── Pure classification functions ─────────────────────────────────────────────


def classify_rain(rainfall_mm: Optional[float]) -> Optional[str]:
    """Classify a single daily rainfall reading. None in → None out."""
    if rainfall_mm is None:
        return None
    if rainfall_mm < RAIN_NONE_MAX_MM:
        return "none"
    if rainfall_mm < HEAVY_RAIN_MIN_MM:
        return "rainy"
    return "heavy_rain"


def classify_temp(temp_c: Optional[float]) -> Optional[str]:
    """Classify a single daily temperature reading. None in → None out."""
    if temp_c is None:
        return None
    if temp_c < HOT_MIN_C:
        return "normal"
    if temp_c < EXTREME_HEAT_MIN_C:
        return "hot"
    return "extreme_heat"


def classify_day(
    date_iso: str,
    municipality: str,
    nasa_rainfall_mm: Optional[float],
    nasa_temp_c: Optional[float],
    chirps_rainfall_mm: Optional[float],
    meteostat_temp_c: Optional[float],
    nasa_power_raw: Optional[dict] = None,
) -> dict:
    """
    Build one reference.weather_daily row for a single (date, municipality).
    Temperature inputs are daily MAXIMUM temperatures.

    Category agreement rule, per dimension:
      - Both source truth and validator present:
          same category                  → classify from NASA, agree=True
          different category but raw
          values within tolerance        → classify from NASA, agree=True
          otherwise                      → 'inconclusive', agree=False
      - Only one of the two present → classify from it, agree=False
      - Neither present → 'inconclusive', agree=False
    """
    # Rain dimension
    nasa_rain_class = classify_rain(nasa_rainfall_mm)
    chirps_rain_class = classify_rain(chirps_rainfall_mm)
    if nasa_rain_class is not None and chirps_rain_class is not None:
        sources_agree_rain = (
            nasa_rain_class == chirps_rain_class
            or abs(nasa_rainfall_mm - chirps_rainfall_mm) <= RAIN_AGREE_TOLERANCE_MM
        )
        rain_classification = nasa_rain_class if sources_agree_rain else "inconclusive"
    elif nasa_rain_class is not None:
        sources_agree_rain = False
        rain_classification = nasa_rain_class
    elif chirps_rain_class is not None:
        sources_agree_rain = False
        rain_classification = chirps_rain_class
    else:
        sources_agree_rain = False
        rain_classification = "inconclusive"

    # Temperature dimension (daily max)
    nasa_temp_class = classify_temp(nasa_temp_c)
    met_temp_class = classify_temp(meteostat_temp_c)
    if nasa_temp_class is not None and met_temp_class is not None:
        sources_agree_temp = (
            nasa_temp_class == met_temp_class
            or abs(nasa_temp_c - meteostat_temp_c) <= TEMP_AGREE_TOLERANCE_C
        )
        temp_classification = nasa_temp_class if sources_agree_temp else "inconclusive"
    elif nasa_temp_class is not None:
        sources_agree_temp = False
        temp_classification = nasa_temp_class
    elif met_temp_class is not None:
        sources_agree_temp = False
        temp_classification = met_temp_class
    else:
        sources_agree_temp = False
        temp_classification = "inconclusive"

    confidence_score = (0.5 if sources_agree_rain else 0.0) + (
        0.5 if sources_agree_temp else 0.0
    )

    return {
        "date": date_iso,
        "municipality": municipality,
        "nasa_power_rainfall_mm": round(nasa_rainfall_mm, 2) if nasa_rainfall_mm is not None else None,
        "chirps_rainfall_mm": round(chirps_rainfall_mm, 2) if chirps_rainfall_mm is not None else None,
        "nasa_power_temp_c": round(nasa_temp_c, 2) if nasa_temp_c is not None else None,
        "meteostat_temp_c": round(meteostat_temp_c, 2) if meteostat_temp_c is not None else None,
        "nasa_power_raw": nasa_power_raw,
        "chirps_raw": (
            {"source": "chirps_climateserv", "rainfall_mm": round(chirps_rainfall_mm, 2)}
            if chirps_rainfall_mm is not None
            else None
        ),
        "meteostat_raw": (
            {"source": "meteostat", "station": "98429", "temp_max_c": round(meteostat_temp_c, 2)}
            if meteostat_temp_c is not None
            else None
        ),
        "rain_classification": rain_classification,
        "temp_classification": temp_classification,
        "sources_agree_rain": sources_agree_rain,
        "sources_agree_temp": sources_agree_temp,
        "confidence_score": confidence_score,
    }


def build_daily_rows(
    municipality: str,
    start: date,
    end: date,
    nasa_records: list[dict],
    chirps_cache: dict[str, float],
    meteostat_cache: dict[str, float],
) -> list[dict]:
    """
    Classify every day in [start, end] for one municipality.
    nasa_records: daily dicts from fetch_nasa_power_ag() ({date, temp_avg_c,
    rainfall_mm, ...}). Days where no source has any data are skipped.
    """
    nasa_by_date = {r["date"]: r for r in nasa_records}

    rows: list[dict] = []
    day = start
    while day <= end:
        d = day.isoformat()
        nasa = nasa_by_date.get(d)
        nasa_rain = nasa.get("rainfall_mm") if nasa else None
        # Daily MAX temperature drives the hot-day classification; fall back
        # to the daily average only when the max is missing.
        nasa_temp = None
        if nasa:
            nasa_temp = nasa.get("temp_max_c")
            if nasa_temp is None:
                nasa_temp = nasa.get("temp_avg_c")
        chirps_rain = chirps_cache.get(d)
        met_temp = meteostat_cache.get(d)

        if all(v is None for v in (nasa_rain, nasa_temp, chirps_rain, met_temp)):
            day += timedelta(days=1)
            continue

        rows.append(
            classify_day(
                d,
                municipality,
                nasa_rainfall_mm=nasa_rain,
                nasa_temp_c=nasa_temp,
                chirps_rainfall_mm=chirps_rain,
                meteostat_temp_c=met_temp,
                nasa_power_raw=nasa,
            )
        )
        day += timedelta(days=1)

    return rows


# ── Daily validator caches ────────────────────────────────────────────────────


def build_meteostat_daily_cache(start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY MAXIMUM temperature from Meteostat (Ninoy Aquino Intl AP,
    WMO 98429), the same station weather_validation.py uses monthly.
    Returns {iso_date: temp_max_c}. Empty dict on any failure.
    """
    try:
        from meteostat import Station, daily as meteostat_daily
        from datetime import datetime as dt_class
        import math
    except ImportError:
        logger.warning("meteostat not installed -- run: pip install meteostat")
        return {}

    from app.services.weather_validation import METEOSTAT_STATION_ID, METEOSTAT_STATION_NAME

    logger.info(
        "Fetching Meteostat DAILY MAX temperature from %s (%s to %s)...",
        METEOSTAT_STATION_NAME,
        start,
        end,
    )

    try:
        station = Station(METEOSTAT_STATION_ID)
        start_dt = dt_class(start.year, start.month, start.day)
        end_dt = dt_class(end.year, end.month, end.day)
        data = meteostat_daily(station, start_dt, end_dt).fetch()

        if data is None or len(data) == 0:
            logger.warning("Meteostat returned no daily data for station %s", METEOSTAT_STATION_ID)
            return {}

        cache: dict[str, float] = {}
        for idx, row in data.iterrows():
            # Column name differs across meteostat versions
            temp = None
            for col in ("tmax", "temp_max", "tempmax"):
                temp = row.get(col)
                if temp is not None:
                    break
            if temp is None:
                continue
            try:
                val = float(temp)
                if not math.isnan(val):
                    cache[idx.date().isoformat()] = round(val, 2)
            except (TypeError, ValueError, AttributeError):
                continue

        logger.info("Meteostat daily cache built: %d days", len(cache))
        return cache

    except Exception as exc:
        logger.warning("Meteostat daily fetch failed: %s", exc)
        return {}


def build_chirps_daily_cache(lat: float, lon: float, start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY CHIRPS rainfall for a point via ClimateSERV.
    Same request as weather_validation.build_chirps_cache, but keeps the
    per-day raw values instead of summing them into months.
    Returns {iso_date: rainfall_mm}. Empty dict on any failure.
    """
    from app.services.weather_validation import CLIMATESERV_BASE, _chirps_submit_range

    request_id = _chirps_submit_range(lat, lon, start, end)
    if not request_id:
        return {}

    url = f"{CLIMATESERV_BASE}/getDataFromRequest/?id={request_id}"
    deadline = time.time() + 120

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read().decode())

            if isinstance(payload, list) and payload:
                payload = payload[0]

            status = str(payload.get("status", "")).lower()
            if "complete" in status or "data" in payload:
                daily: dict[str, float] = {}
                for item in payload.get("data", []):
                    yr = item.get("year")
                    mo = item.get("month")
                    dy = item.get("day")
                    raw_val = item.get("raw_value")
                    if (yr is None or mo is None or dy is None) and item.get("date"):
                        try:
                            from datetime import datetime as dt_class

                            dt = dt_class.strptime(item["date"], "%m/%d/%Y")
                            yr, mo, dy = dt.year, dt.month, dt.day
                        except ValueError:
                            continue
                    if yr is None or mo is None or dy is None or raw_val is None:
                        continue
                    try:
                        d_iso = date(int(yr), int(mo), int(dy)).isoformat()
                        daily[d_iso] = round(float(raw_val), 2)
                    except (TypeError, ValueError):
                        continue
                return daily

            if "error" in status or "failed" in status:
                logger.warning("CHIRPS daily request %s errored", request_id)
                return {}

        except Exception as exc:
            logger.warning("CHIRPS daily poll error: %s", exc)
            return {}

        time.sleep(5)

    logger.warning("CHIRPS daily request %s timed out", request_id)
    return {}
