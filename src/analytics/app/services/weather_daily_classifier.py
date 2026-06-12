"""
Daily Weather Classifier
=========================
Classifies each day per municipality into rainfall and temperature categories,
cross-checking the source of truth (NASA POWER AG) against TWO validators per
dimension at the DAILY level:

  Rainfall    : CHIRPS (satellite + gauge) and Open-Meteo (ERA5 reanalysis)
  Temperature : Meteostat and NOAA GSOD (both station-based)

Output rows match reference.weather_rainfall_daily and
reference.weather_temperature_daily (migration 189). Monthly counts and the
ETCCDI indices are then aggregated server-side by
reference.rebuild_weather_monthly_summary().

Thresholds (PAGASA advisory scales, must stay in sync with migration 189
header; the rainfall tiers are expressible as ETCCDI user-defined Rnnmm
day-count indices — R60mm / R180mm. ETCCDI: Expert Team on Climate Change
Detection and Indices, https://etccdi.pacificclimate.org. Applied to
Philippine data per Tejada et al. 2023, Atmosphere 14(12):1790):

  rain_classification (daily rainfall total)
    light         rainfall < 60 mm
    moderate      60 mm <= rainfall <= 180 mm
    heavy         rainfall > 180 mm
  temp_classification (daily MAXIMUM temperature — PAGASA heat advisory tiers
  applied to the day's peak temperature, not a computed heat index)
    not_hazardous   max temp < 27 C
    caution         27 C <= max temp < 33 C
    extreme_caution 33 C <= max temp < 42 C
    danger          42 C <= max temp < 52 C
    extreme_danger  max temp >= 52 C

Agreement (per validator): a validator AGREES with the source of truth when it
classifies the day into the SAME category, or — for boundary cases where the
categories differ — when the raw values are within tolerance (10 mm rain,
3 C temp). Majority rule across the two validators:
  validators_agreed >= 1 → sources_agree = true  → classify from NASA POWER AG
  validators_agreed = 0 with at least one validator present → 'inconclusive'
  no validator has data → NASA's category, sources_agree = false (unvalidated)
  NASA has no data → classify from whichever validator has data, agree = false

Each row also stores, per validator, the absolute difference vs the source of
truth (diff_* columns), a plain-English agreement_status label, and a reason
sentence quoting the tolerance and the actual differences.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# ── Classification thresholds ─────────────────────────────────────────────────

RAIN_LIGHT_MAX_MM = 60.0      # below this: light rain day
RAIN_HEAVY_MIN_MM = 180.0     # above this: heavy rain day (60–180 inclusive: moderate)
TEMP_CAUTION_MIN_C = 27.0     # at or above: caution
TEMP_EXTREME_CAUTION_MIN_C = 33.0  # at or above: extreme caution
TEMP_DANGER_MIN_C = 42.0      # at or above: danger
TEMP_EXTREME_DANGER_MIN_C = 52.0   # at or above: extreme danger

# ── Source agreement tolerances (daily) ───────────────────────────────────────

RAIN_AGREE_TOLERANCE_MM = 10.0   # NASA POWER AG vs each rainfall validator
TEMP_AGREE_TOLERANCE_C = 3.0     # NASA POWER AG vs each temperature validator

# Agreement status labels (must match the CHECK constraints in migration 189)

STATUS_BOTH_AGREE = "Both validators agree"
STATUS_ONE_AGREES = "One validator agrees"
STATUS_NONE_AGREE = "No validators agree"


# ── Pure classification functions ─────────────────────────────────────────────


def classify_rain(rainfall_mm: Optional[float]) -> Optional[str]:
    """Classify a single daily rainfall total. None in → None out."""
    if rainfall_mm is None:
        return None
    if rainfall_mm < RAIN_LIGHT_MAX_MM:
        return "light"
    if rainfall_mm <= RAIN_HEAVY_MIN_MM:
        return "moderate"
    return "heavy"


def classify_temp(temp_c: Optional[float]) -> Optional[str]:
    """Classify a single daily MAXIMUM temperature. None in → None out."""
    if temp_c is None:
        return None
    if temp_c < TEMP_CAUTION_MIN_C:
        return "not_hazardous"
    if temp_c < TEMP_EXTREME_CAUTION_MIN_C:
        return "caution"
    if temp_c < TEMP_DANGER_MIN_C:
        return "extreme_caution"
    if temp_c < TEMP_EXTREME_DANGER_MIN_C:
        return "danger"
    return "extreme_danger"


def _diff(truth: Optional[float], validator: Optional[float]) -> Optional[float]:
    """Absolute difference vs the source of truth; None when either side is missing."""
    if truth is None or validator is None:
        return None
    return round(abs(truth - validator), 2)


def _validate_dimension(
    truth_value: Optional[float],
    validators: list[tuple[str, Optional[float]]],
    classify_fn: Callable[[Optional[float]], Optional[str]],
    tolerance: float,
    unit: str,
) -> Optional[dict]:
    """
    Apply the majority agreement rule for one dimension (rain or temp).

    validators: [(name, value), ...] in fixed order — value None when the
    validator has no data for the day.

    Returns None when neither the source of truth nor any validator has data
    (the caller emits no row), otherwise a dict with:
      classification, validators_agreed, sources_agree, agreement_status, reason
    """
    truth_cat = classify_fn(truth_value)
    present = [(name, val, classify_fn(val)) for name, val in validators if val is not None]
    missing = [name for name, val in validators if val is None]

    if truth_value is None and not present:
        return None

    # NASA has no data → classify from the first validator that does.
    if truth_value is None:
        name, _val, cat = present[0]
        return {
            "classification": cat,
            "validators_agreed": 0,
            "sources_agree": False,
            "agreement_status": STATUS_NONE_AGREE,
            "reason": (
                f"Not cross-checked: NASA POWER AG has no data for this day; "
                f"classified from {name} alone."
            ),
        }

    # NASA has data but no validator does → unvalidated NASA classification.
    if not present:
        return {
            "classification": truth_cat,
            "validators_agreed": 0,
            "sources_agree": False,
            "agreement_status": STATUS_NONE_AGREE,
            "reason": (
                f"No validator data available for this day ({' and '.join(missing)} missing). "
                f"Classified from NASA POWER AG alone (unvalidated)."
            ),
        }

    # Per-validator vote: same category, or raw values within tolerance.
    agreeing: list[tuple[str, float, str, float]] = []
    conflicting: list[tuple[str, float, str, float]] = []
    for name, val, cat in present:
        diff = round(abs(truth_value - val), 2)
        if cat == truth_cat or diff <= tolerance:
            agreeing.append((name, val, cat, diff))
        else:
            conflicting.append((name, val, cat, diff))

    agreed = len(agreeing)
    tol_txt = f"{tolerance:g} {unit}"

    if agreed >= 1:
        classification = truth_cat
        sources_agree = True
        status = STATUS_BOTH_AGREE if agreed == 2 else STATUS_ONE_AGREES
    else:
        classification = "inconclusive"
        sources_agree = False
        status = STATUS_NONE_AGREE

    # Reason sentence per case.
    if agreed == 2:
        detail = "; ".join(
            f"{name} {val:.2f} {unit} ('{cat}', diff {diff:.2f} {unit})"
            for name, val, cat, diff in agreeing
        )
        reason = (
            f"Sources agree (2/2): NASA POWER AG {truth_value:.2f} {unit} ('{truth_cat}'); "
            f"{detail} — both within the {tol_txt} tolerance we set or in the same category. "
            f"Classified from NASA POWER AG."
        )
    elif agreed == 1 and conflicting:
        a_name, _a_val, _a_cat, a_diff = agreeing[0]
        c_name, _c_val, _c_cat, c_diff = conflicting[0]
        reason = (
            f"Sources partially agree (1/2): {a_name} agrees (diff {a_diff:.2f} {unit} within "
            f"the {tol_txt} tolerance we set), {c_name} conflicts — diff {c_diff:.2f} {unit} "
            f"exceeds the {tol_txt} tolerance we set. Classified from NASA POWER AG."
        )
    elif agreed == 1:
        a_name, a_val, a_cat, a_diff = agreeing[0]
        reason = (
            f"Not fully cross-checked: {missing[0]} has no data for this day. Checked against "
            f"{a_name} only (NASA {truth_value:.2f} {unit} '{truth_cat}', {a_name} {a_val:.2f} {unit} "
            f"'{a_cat}', diff {a_diff:.2f} {unit}, within the {tol_txt} tolerance we set). "
            f"Classified from NASA POWER AG."
        )
    elif len(conflicting) == 2:
        (n1, _v1, _c1, d1), (n2, _v2, _c2, d2) = conflicting
        reason = (
            f"Inconclusive (0/2): both validators conflict — {n1} diff {d1:.2f} {unit} and "
            f"{n2} diff {d2:.2f} {unit} both exceed the {tol_txt} tolerance we set."
        )
    else:
        c_name, c_val, c_cat, c_diff = conflicting[0]
        reason = (
            f"Inconclusive: {missing[0]} has no data for this day, and {c_name} conflicts — "
            f"NASA POWER AG {truth_value:.2f} {unit} ('{truth_cat}') vs {c_name} {c_val:.2f} {unit} "
            f"('{c_cat}'), the difference of the two is {c_diff:.2f} {unit}, which exceeds the "
            f"{tol_txt} tolerance we set."
        )

    return {
        "classification": classification,
        "validators_agreed": agreed,
        "sources_agree": sources_agree,
        "agreement_status": status,
        "reason": reason,
    }


def classify_day(
    date_iso: str,
    municipality: str,
    *,
    nasa_rainfall_mm: Optional[float],
    chirps_rainfall_mm: Optional[float],
    open_meteo_rainfall_mm: Optional[float],
    nasa_temp_c: Optional[float],
    meteostat_temp_c: Optional[float],
    gsod_temp_c: Optional[float],
    nasa_power_raw: Optional[dict] = None,
    open_meteo_raw: Optional[dict] = None,
) -> tuple[Optional[dict], Optional[dict]]:
    """
    Build the reference.weather_rainfall_daily and
    reference.weather_temperature_daily rows for one (date, municipality).
    Temperature inputs are daily MAXIMUM temperatures.

    Returns (rain_row, temp_row); either is None when that dimension has no
    data at all (no row should be stored).
    """
    rain = _validate_dimension(
        nasa_rainfall_mm,
        [("CHIRPS", chirps_rainfall_mm), ("Open-Meteo", open_meteo_rainfall_mm)],
        classify_rain,
        RAIN_AGREE_TOLERANCE_MM,
        "mm",
    )
    temp = _validate_dimension(
        nasa_temp_c,
        [("Meteostat", meteostat_temp_c), ("NOAA GSOD", gsod_temp_c)],
        classify_temp,
        TEMP_AGREE_TOLERANCE_C,
        "C",
    )

    rain_row = None
    if rain is not None:
        rain_row = {
            "date": date_iso,
            "municipality": municipality,
            "nasa_power_rainfall_mm": round(nasa_rainfall_mm, 2) if nasa_rainfall_mm is not None else None,
            "chirps_rainfall_mm": round(chirps_rainfall_mm, 2) if chirps_rainfall_mm is not None else None,
            "open_meteo_rainfall_mm": (
                round(open_meteo_rainfall_mm, 2) if open_meteo_rainfall_mm is not None else None
            ),
            "diff_nasa_chirps_mm": _diff(nasa_rainfall_mm, chirps_rainfall_mm),
            "diff_nasa_open_meteo_mm": _diff(nasa_rainfall_mm, open_meteo_rainfall_mm),
            "rain_classification": rain["classification"],
            "validators_agreed": rain["validators_agreed"],
            "sources_agree": rain["sources_agree"],
            "agreement_status": rain["agreement_status"],
            "reason": rain["reason"],
            "nasa_power_raw": nasa_power_raw,
            "chirps_raw": (
                {"source": "chirps_climateserv", "rainfall_mm": round(chirps_rainfall_mm, 2)}
                if chirps_rainfall_mm is not None
                else None
            ),
            "open_meteo_raw": open_meteo_raw,
        }

    temp_row = None
    if temp is not None:
        temp_row = {
            "date": date_iso,
            "municipality": municipality,
            "nasa_power_temp_c": round(nasa_temp_c, 2) if nasa_temp_c is not None else None,
            "meteostat_temp_c": round(meteostat_temp_c, 2) if meteostat_temp_c is not None else None,
            "noaa_gsod_temp_c": round(gsod_temp_c, 2) if gsod_temp_c is not None else None,
            "diff_nasa_meteostat_c": _diff(nasa_temp_c, meteostat_temp_c),
            "diff_nasa_gsod_c": _diff(nasa_temp_c, gsod_temp_c),
            "temp_classification": temp["classification"],
            "validators_agreed": temp["validators_agreed"],
            "sources_agree": temp["sources_agree"],
            "agreement_status": temp["agreement_status"],
            "reason": temp["reason"],
            "nasa_power_raw": nasa_power_raw,
            "meteostat_raw": (
                {"source": "meteostat", "station": "98429", "temp_max_c": round(meteostat_temp_c, 2)}
                if meteostat_temp_c is not None
                else None
            ),
            "gsod_raw": (
                {
                    "source": "noaa_gsod",
                    "temp_max_c": round(gsod_temp_c, 2),
                    "aggregation": "mean of Laguna-area stations",
                }
                if gsod_temp_c is not None
                else None
            ),
        }

    return rain_row, temp_row


def build_daily_rows(
    municipality: str,
    start: date,
    end: date,
    nasa_records: list[dict],
    chirps_cache: dict[str, float],
    meteostat_cache: dict[str, float],
    open_meteo_records: Optional[list[dict]] = None,
    gsod_cache: Optional[dict[str, float]] = None,
) -> tuple[list[dict], list[dict]]:
    """
    Classify every day in [start, end] for one municipality.

    nasa_records / open_meteo_records: daily dicts from the weather_collector
    fetchers ({date, temp_avg_c, temp_max_c, rainfall_mm, ...}).
    chirps_cache / meteostat_cache / gsod_cache: {iso_date: value}.

    Returns (rain_rows, temp_rows). Days where no source has any data in a
    dimension produce no row for that dimension.
    """
    nasa_by_date = {r["date"]: r for r in nasa_records}
    open_by_date = {r["date"]: r for r in (open_meteo_records or [])}
    gsod_cache = gsod_cache or {}

    rain_rows: list[dict] = []
    temp_rows: list[dict] = []
    day = start
    while day <= end:
        d = day.isoformat()
        nasa = nasa_by_date.get(d)
        nasa_rain = nasa.get("rainfall_mm") if nasa else None
        # Daily MAX temperature drives the heat classification; fall back to
        # the daily average only when the max is missing.
        nasa_temp = None
        if nasa:
            nasa_temp = nasa.get("temp_max_c")
            if nasa_temp is None:
                nasa_temp = nasa.get("temp_avg_c")

        open_meteo = open_by_date.get(d)
        open_meteo_rain = open_meteo.get("rainfall_mm") if open_meteo else None
        chirps_rain = chirps_cache.get(d)
        met_temp = meteostat_cache.get(d)
        gsod_temp = gsod_cache.get(d)

        rain_row, temp_row = classify_day(
            d,
            municipality,
            nasa_rainfall_mm=nasa_rain,
            chirps_rainfall_mm=chirps_rain,
            open_meteo_rainfall_mm=open_meteo_rain,
            nasa_temp_c=nasa_temp,
            meteostat_temp_c=met_temp,
            gsod_temp_c=gsod_temp,
            nasa_power_raw=nasa,
            open_meteo_raw=open_meteo,
        )
        if rain_row is not None:
            rain_rows.append(rain_row)
        if temp_row is not None:
            temp_rows.append(temp_row)
        day += timedelta(days=1)

    return rain_rows, temp_rows


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


def build_noaa_gsod_daily_cache(start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY MAXIMUM temperature from NOAA GSOD for the Laguna-area
    stations configured in weather_validator.py, averaged across stations
    per day. One API call per station for the full range.
    Returns {iso_date: temp_max_c}. Empty dict on any failure.
    """
    from app.services.weather_validator import GSOD_API, GSOD_STATIONS

    logger.info("Fetching NOAA GSOD DAILY MAX temperature (%s to %s)...", start, end)

    by_date: dict[str, list[float]] = {}
    for station in GSOD_STATIONS:
        params = urllib.parse.urlencode(
            {
                "dataset": "global-summary-of-the-day",
                "stations": station["id"],
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "format": "json",
                "units": "metric",
                "dataTypes": "MAX",
            }
        )
        url = f"{GSOD_API}?{params}"

        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                records = json.loads(resp.read().decode())
        except Exception as exc:
            logger.warning("NOAA GSOD daily fetch failed for station %s: %s", station["id"], exc)
            continue

        if not isinstance(records, list):
            logger.warning("NOAA GSOD unexpected daily response for station %s", station["id"])
            continue

        count = 0
        for r in records:
            d = str(r.get("DATE", ""))[:10]
            try:
                val = float(r.get("MAX"))
            except (TypeError, ValueError):
                continue
            # GSOD uses 9999.9 as its missing-value sentinel; also discard
            # physically implausible daily max temperatures.
            if not (-90.0 <= val <= 60.0):
                continue
            by_date.setdefault(d, []).append(val)
            count += 1
        logger.info("  GSOD %-30s → %d daily MAX records", station["name"], count)

    cache = {d: round(sum(v) / len(v), 2) for d, v in by_date.items()}
    logger.info("NOAA GSOD daily cache built: %d days", len(cache))
    return cache


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
