"""
Daily Weather Classifier
=========================
Classifies each day per municipality into rainfall and temperature categories,
cross-checking the source of truth (NASA POWER AG) against THREE validators per
dimension at the DAILY level:

  Rainfall    : CHIRPS (satellite + gauge), Open-Meteo ERA5-Land (reanalysis),
                and GPM IMERG (passive microwave satellite)
  Temperature : Meteostat (station), NOAA GSOD (station),
                and Open-Meteo ERA5-Land (reanalysis)

Output rows match reference.weather_rainfall_daily and
reference.weather_temperature_daily (migration 189). Monthly counts and the
ETCCDI indices are then aggregated server-side by
reference.rebuild_weather_monthly_summary().

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rainfall classification — PAGASA Memorandum, 20 June 2012
(Severe Weather Bulletin daily accumulated rainfall thresholds).
These thresholds are expressible as ETCCDI user-defined Rnnmm day-count
indices R60mm / R180mm per Zhang et al. (2011), Wiley Interdisciplinary
Reviews: Climate Change, 2(6), 851-870.

  rain_classification (daily total)
    light         rainfall < 60 mm
    moderate      60 mm ≤ rainfall ≤ 180 mm
    heavy         rainfall > 180 mm

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Temperature classification — PAGASA Heat Index advisory tiers
(PAGASA, n.d., https://www.pagasa.dost.gov.ph/weather/heat-index).
Applied to the COMPUTED HEAT INDEX (not raw temperature), using the
Rothfusz (1990) regression equation (NWS Technical Attachment SR 90-23)
with daily maximum temperature (°C) and relative humidity (%) from
NASA POWER AG (parameter RH2M).

  temp_classification (daily heat index)
    not_hazardous   heat index < 27 °C
    caution         27 °C ≤ HI < 33 °C
    extreme_caution 33 °C ≤ HI < 42 °C
    danger          42 °C ≤ HI < 52 °C
    extreme_danger  HI ≥ 52 °C

  Note: temperature VALIDATORS (Meteostat, NOAA GSOD, Open-Meteo) compare
  against NASA POWER AG raw maximum temperature (not the heat index).
  Agreement is determined from raw temperature; classification is applied
  to the computed heat index once the raw temperature is validated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agreement and confidence — triple collocation / majority rule
(Stoffelen, 1998; Ma et al., 2020; Wei et al., 2023).
All three validators check the same NASA POWER AG value SIMULTANEOUSLY and
INDEPENDENTLY — no sequential gating. Majority rule (≥ 2 of 3):

  validators_agreed = 3 → All validators agree    → sources_agree = true
  validators_agreed = 2 → Majority agree (2/3)    → sources_agree = true
  validators_agreed = 1 → One validator agrees     → sources_agree = false
  validators_agreed = 0 → No validators agree      → sources_agree = false

WMO quality flag mapping (WMO No. 1269, 2020):
  All agree      → Correct
  Majority agree → Probably Correct
  One agrees     → Probably Suspect
  None agree     → Suspect / flagged for review

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confidence scoring (Murphy, 1988; Cohen, 1960; Landis & Koch, 1977):
  MAE-normalized per-validator confidence: C = max(0, 1 - MAE/τ) × 100%
  Weighted Confidence Index (WCI): weighted mean of per-day validator counts
  Cohen's Kappa (κ): categorical agreement corrected for chance, per validator
  See compute_confidence_scores() for the full implementation.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# ── Classification thresholds ─────────────────────────────────────────────────
# Rainfall: PAGASA Memorandum 20 June 2012 (Severe Weather Bulletins)

RAIN_LIGHT_MAX_MM = 60.0      # below this: light rain day
RAIN_HEAVY_MIN_MM = 180.0     # above this: heavy rain day (60–180 inclusive: moderate)

# Temperature: PAGASA heat index advisory tiers (applied to computed HI, not raw temp)
TEMP_CAUTION_MIN_C = 27.0
TEMP_EXTREME_CAUTION_MIN_C = 33.0
TEMP_DANGER_MIN_C = 42.0
TEMP_EXTREME_DANGER_MIN_C = 52.0

# ── Source agreement tolerances (daily) ───────────────────────────────────────

RAIN_AGREE_TOLERANCE_MM = 10.0   # NASA POWER AG vs each rainfall validator
TEMP_AGREE_TOLERANCE_C = 3.0     # NASA POWER AG vs each temperature validator (raw)

# NOAA GSOD finalizes international station data with a 30–90 day lag.
# Cap GSOD requests at this many days before today to avoid requesting
# unfinalized records (reanalysis products use REANALYSIS_LAG_DAYS = 7).
GSOD_LAG_DAYS = 90

# ── Agreement status labels (must match CHECK constraints in migration 189) ───

STATUS_ALL_AGREE = "All validators agree"
STATUS_MAJORITY_AGREE = "Majority agree (2/3)"
STATUS_ONE_AGREES = "One validator agrees"
STATUS_NONE_AGREE = "No validators agree"

# WMO No. 1269 quality flag mapping
WMO_FLAG = {
    STATUS_ALL_AGREE: "Correct",
    STATUS_MAJORITY_AGREE: "Probably Correct",
    STATUS_ONE_AGREES: "Probably Suspect",
    STATUS_NONE_AGREE: "Suspect",
}

# GPM IMERG bounding box for Laguna Province (0.1° grid)
# Lat: 13.85–14.60°N → indices 1038–1045
# Lon: 121.00–121.65°E → indices 3009–3016
_IMERG_LAT_MIN = 13.85
_IMERG_LAT_MAX = 14.60
_IMERG_LON_MIN = 121.00
_IMERG_LON_MAX = 121.65


# ── Pure classification functions ─────────────────────────────────────────────


def classify_rain(rainfall_mm: Optional[float]) -> Optional[str]:
    """Classify a daily rainfall total per PAGASA 2012 thresholds."""
    if rainfall_mm is None:
        return None
    if rainfall_mm < RAIN_LIGHT_MAX_MM:
        return "light"
    if rainfall_mm <= RAIN_HEAVY_MIN_MM:
        return "moderate"
    return "heavy"


def classify_temp(temp_c: Optional[float]) -> Optional[str]:
    """
    Classify a temperature value per PAGASA heat index advisory tiers.
    Input should be the COMPUTED HEAT INDEX (°C), not raw air temperature.
    """
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


def compute_heat_index(temp_max_c: Optional[float], rh_pct: Optional[float]) -> Optional[float]:
    """
    Compute apparent temperature (heat index) in °C using the Rothfusz (1990)
    regression equation (NWS Technical Attachment SR 90-23), as adopted by
    PAGASA for heat advisory classification.

    Inputs: daily maximum temperature (°C) and relative humidity (%).
    Returns None when either input is missing.
    The Rothfusz formula is defined for T ≥ 27°C and RH ≥ 40%; below those
    bounds the formula is not applied and the raw temperature is returned.
    """
    if temp_max_c is None or rh_pct is None:
        return None
    # Below PAGASA's lowest advisory tier — no meaningful heat index
    if temp_max_c < TEMP_CAUTION_MIN_C:
        return round(temp_max_c, 2)

    T = temp_max_c * 9 / 5 + 32  # convert to °F for Rothfusz
    RH = rh_pct

    HI = (
        -42.379
        + 2.04901523 * T
        + 10.14333127 * RH
        - 0.22475541 * T * RH
        - 0.00683783 * T * T
        - 0.05481717 * RH * RH
        + 0.00122874 * T * T * RH
        + 0.00085282 * T * RH * RH
        - 0.00000199 * T * T * RH * RH
    )

    # NWS adjustments (Rothfusz, 1990)
    if RH < 13 and 80 <= T <= 112:
        HI -= ((13 - RH) / 4) * math.sqrt((17 - abs(T - 95)) / 17)
    elif RH > 85 and 80 <= T <= 87:
        HI += ((RH - 85) / 10) * ((87 - T) / 5)

    return round((HI - 32) * 5 / 9, 2)  # back to °C


def _diff(truth: Optional[float], validator: Optional[float]) -> Optional[float]:
    """Absolute difference vs the source of truth; None when either is missing."""
    if truth is None or validator is None:
        return None
    return round(abs(truth - validator), 2)


def _validate_dimension(
    truth_value: Optional[float],
    validators: list[tuple[str, Optional[float]]],
    classify_fn: Callable[[Optional[float]], Optional[str]],
    tolerance: float,
    unit: str,
    classification_value: Optional[float] = None,
) -> Optional[dict]:
    """
    Apply majority agreement rule (≥ 2 of 3) for one weather dimension.

    truth_value         : NASA POWER AG raw value (used for validator comparison).
    validators          : [(name, value), ...] — all checked simultaneously.
    classify_fn         : classification function applied to truth or fallback.
    tolerance           : acceptable absolute difference for agreement.
    unit                : display unit string for reason sentences.
    classification_value: if provided, used for the final classification instead
                          of truth_value (e.g. heat index instead of raw temp).

    Returns None when neither truth nor any validator has data.
    Otherwise returns a dict with classification, validators_agreed,
    sources_agree, agreement_status, wmo_quality_flag, and reason.
    """
    classify_val = classification_value if classification_value is not None else truth_value
    truth_cat = classify_fn(classify_val)
    present = [(name, val, classify_fn(val)) for name, val in validators if val is not None]
    missing = [name for name, val in validators if val is None]
    n_total = len(validators)
    majority = n_total // 2 + 1  # 2 out of 3

    if truth_value is None and not present:
        return None

    # NASA has no data — classify from first available validator
    if truth_value is None:
        name, _val, cat = present[0]
        status = STATUS_NONE_AGREE
        return {
            "classification": cat,
            "validators_agreed": 0,
            "sources_agree": False,
            "agreement_status": status,
            "wmo_quality_flag": WMO_FLAG[status],
            "reason": (
                f"Not cross-checked: NASA POWER AG has no data for this day; "
                f"classified from {name} alone."
            ),
        }

    # NASA has data but no validator does
    if not present:
        status = STATUS_NONE_AGREE
        return {
            "classification": truth_cat,
            "validators_agreed": 0,
            "sources_agree": False,
            "agreement_status": status,
            "wmo_quality_flag": WMO_FLAG[status],
            "reason": (
                f"No validator data available ({', '.join(missing)} all missing). "
                f"Classified from NASA POWER AG alone (unvalidated)."
            ),
        }

    # Per-validator vote: same category OR raw values within tolerance
    agreeing: list[tuple[str, float, str, float]] = []
    conflicting: list[tuple[str, float, str, float]] = []
    for name, val, cat in present:
        # Agreement check always uses raw truth_value vs raw validator value
        raw_truth_cat = classify_fn(truth_value)
        diff = round(abs(truth_value - val), 2)
        if cat == raw_truth_cat or diff <= tolerance:
            agreeing.append((name, val, cat, diff))
        else:
            conflicting.append((name, val, cat, diff))

    agreed = len(agreeing)
    tol_txt = f"{tolerance:g} {unit}"

    if agreed >= majority:
        classification = truth_cat
        sources_agree = True
        status = STATUS_ALL_AGREE if agreed == n_total else STATUS_MAJORITY_AGREE
    elif agreed == 1:
        classification = "inconclusive"
        sources_agree = False
        status = STATUS_ONE_AGREES
    else:
        classification = "inconclusive"
        sources_agree = False
        status = STATUS_NONE_AGREE

    # Build reason sentence
    def _fmt(items):
        return "; ".join(
            f"{n} {v:.2f} {unit} ('{c}', diff {d:.2f} {unit})"
            for n, v, c, d in items
        )

    if agreed == n_total:
        reason = (
            f"All {n_total} validators agree: NASA POWER AG {truth_value:.2f} {unit} "
            f"('{classify_fn(truth_value)}'). {_fmt(agreeing)} — all within the "
            f"{tol_txt} tolerance or same category. Classified from NASA POWER AG."
        )
    elif agreed >= majority:
        reason = (
            f"Majority agree ({agreed}/{n_total}): {_fmt(agreeing)} agree with "
            f"NASA POWER AG {truth_value:.2f} {unit}. "
            + (f"Conflicting: {_fmt(conflicting)}." if conflicting else "")
            + f" Classified from NASA POWER AG."
        )
    elif agreed == 1 and conflicting:
        a_name, _av, _ac, a_diff = agreeing[0]
        reason = (
            f"Inconclusive (1/{n_total}): {a_name} agrees (diff {a_diff:.2f} {unit} "
            f"within {tol_txt}), but {_fmt(conflicting)} conflict — "
            f"diffs exceed {tol_txt} tolerance."
        )
    elif agreed == 1:
        a_name, a_val, a_cat, a_diff = agreeing[0]
        reason = (
            f"Partially checked (1/{n_total}): {', '.join(missing)} missing. "
            f"{a_name} {a_val:.2f} {unit} ('{a_cat}', diff {a_diff:.2f} {unit}) "
            f"within {tol_txt}. Not majority; classified as inconclusive."
        )
    else:
        reason = (
            f"Inconclusive (0/{n_total}): all present validators conflict — "
            f"{_fmt(conflicting)}; diffs exceed {tol_txt} tolerance."
            + (f" {', '.join(missing)} missing." if missing else "")
        )

    return {
        "classification": classification,
        "validators_agreed": agreed,
        "sources_agree": sources_agree,
        "agreement_status": status,
        "wmo_quality_flag": WMO_FLAG[status],
        "reason": reason,
    }


def classify_day(
    date_iso: str,
    municipality: str,
    *,
    # Rainfall — source of truth + 3 validators
    nasa_rainfall_mm: Optional[float],
    chirps_rainfall_mm: Optional[float],
    open_meteo_rainfall_mm: Optional[float],
    imerg_rainfall_mm: Optional[float],
    # Temperature — source of truth (raw + heat index) + 3 validators (raw)
    nasa_temp_c: Optional[float],        # raw temp_max_c for validator comparison
    nasa_heat_index_c: Optional[float],  # computed heat index for PAGASA classification
    meteostat_temp_c: Optional[float],
    gsod_temp_c: Optional[float],
    open_meteo_temp_c: Optional[float],
    # Raw records for storage
    nasa_power_raw: Optional[dict] = None,
    open_meteo_raw: Optional[dict] = None,
    nasa_rh_pct: Optional[float] = None,
) -> tuple[Optional[dict], Optional[dict]]:
    """
    Build reference.weather_rainfall_daily and reference.weather_temperature_daily
    rows for one (date, municipality).

    Rainfall uses 3 validators (CHIRPS, Open-Meteo ERA5-Land, GPM IMERG).
    Temperature validates raw temp_max_c against 3 station/reanalysis sources,
    then classifies the computed heat index (Rothfusz 1990) against PAGASA tiers.

    Returns (rain_row, temp_row); either is None when all sources are missing.
    """
    rain = _validate_dimension(
        nasa_rainfall_mm,
        [
            ("CHIRPS", chirps_rainfall_mm),
            ("Open-Meteo ERA5-Land", open_meteo_rainfall_mm),
            ("GPM IMERG", imerg_rainfall_mm),
        ],
        classify_rain,
        RAIN_AGREE_TOLERANCE_MM,
        "mm",
    )

    # Validate raw temperature; classify using heat index
    temp = _validate_dimension(
        nasa_temp_c,
        [
            ("Meteostat", meteostat_temp_c),
            ("NOAA GSOD", gsod_temp_c),
            ("Open-Meteo ERA5-Land", open_meteo_temp_c),
        ],
        classify_temp,
        TEMP_AGREE_TOLERANCE_C,
        "°C",
        classification_value=nasa_heat_index_c,
    )

    rain_row = None
    if rain is not None:
        rain_row = {
            "date": date_iso,
            "municipality": municipality,
            "nasa_power_rainfall_mm": round(nasa_rainfall_mm, 2) if nasa_rainfall_mm is not None else None,
            "chirps_rainfall_mm": round(chirps_rainfall_mm, 2) if chirps_rainfall_mm is not None else None,
            "open_meteo_rainfall_mm": round(open_meteo_rainfall_mm, 2) if open_meteo_rainfall_mm is not None else None,
            "imerg_rainfall_mm": round(imerg_rainfall_mm, 2) if imerg_rainfall_mm is not None else None,
            "diff_nasa_chirps_mm": _diff(nasa_rainfall_mm, chirps_rainfall_mm),
            "diff_nasa_open_meteo_mm": _diff(nasa_rainfall_mm, open_meteo_rainfall_mm),
            "diff_nasa_imerg_mm": _diff(nasa_rainfall_mm, imerg_rainfall_mm),
            "rain_classification": rain["classification"],
            "validators_agreed": rain["validators_agreed"],
            "sources_agree": rain["sources_agree"],
            "agreement_status": rain["agreement_status"],
            "wmo_quality_flag": rain["wmo_quality_flag"],
            "reason": rain["reason"],
            "nasa_power_raw": nasa_power_raw,
            "chirps_raw": (
                {"source": "chirps_climateserv", "rainfall_mm": round(chirps_rainfall_mm, 2)}
                if chirps_rainfall_mm is not None else None
            ),
            "open_meteo_raw": open_meteo_raw,
            "imerg_raw": (
                {
                    "source": "gpm_imerg_v07",
                    "rainfall_mm": round(imerg_rainfall_mm, 2),
                    "aggregation": "spatial mean over Laguna Province bbox",
                }
                if imerg_rainfall_mm is not None else None
            ),
        }

    temp_row = None
    if temp is not None:
        temp_row = {
            "date": date_iso,
            "municipality": municipality,
            "nasa_power_temp_c": round(nasa_temp_c, 2) if nasa_temp_c is not None else None,
            "nasa_power_heat_index_c": round(nasa_heat_index_c, 2) if nasa_heat_index_c is not None else None,
            "nasa_power_rh_pct": round(nasa_rh_pct, 2) if nasa_rh_pct is not None else None,
            "meteostat_temp_c": round(meteostat_temp_c, 2) if meteostat_temp_c is not None else None,
            "noaa_gsod_temp_c": round(gsod_temp_c, 2) if gsod_temp_c is not None else None,
            "open_meteo_temp_c": round(open_meteo_temp_c, 2) if open_meteo_temp_c is not None else None,
            "diff_nasa_meteostat_c": _diff(nasa_temp_c, meteostat_temp_c),
            "diff_nasa_gsod_c": _diff(nasa_temp_c, gsod_temp_c),
            "diff_nasa_open_meteo_c": _diff(nasa_temp_c, open_meteo_temp_c),
            "temp_classification": temp["classification"],
            "validators_agreed": temp["validators_agreed"],
            "sources_agree": temp["sources_agree"],
            "agreement_status": temp["agreement_status"],
            "wmo_quality_flag": temp["wmo_quality_flag"],
            "reason": temp["reason"],
            "nasa_power_raw": nasa_power_raw,
            "meteostat_raw": (
                {"source": "meteostat", "station": "98429", "temp_max_c": round(meteostat_temp_c, 2)}
                if meteostat_temp_c is not None else None
            ),
            "gsod_raw": (
                {
                    "source": "noaa_gsod",
                    "temp_max_c": round(gsod_temp_c, 2),
                    "aggregation": "mean of Laguna-area stations",
                }
                if gsod_temp_c is not None else None
            ),
            "open_meteo_temp_raw": (
                {"source": "open_meteo_era5land", "temp_max_c": round(open_meteo_temp_c, 2)}
                if open_meteo_temp_c is not None else None
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
    gsod_station_caches: Optional[list[dict]] = None,
    imerg_cache: Optional[dict[str, float]] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> tuple[list[dict], list[dict]]:
    """
    Classify every day in [start, end] for one municipality.

    nasa_records         : daily dicts from weather_collector (include RH2M field).
    open_meteo_records   : daily dicts from fetch_open_meteo (temp_max_c + rainfall_mm).
    chirps_cache         : {iso_date: rainfall_mm}
    meteostat_cache      : {iso_date: temp_max_c}
    gsod_station_caches  : list of {lat, lon, name, cache: {iso_date: temp_max_c}}
                           IDW-weighted per municipality (Shepard, 1968).
    imerg_cache          : {iso_date: rainfall_mm}  ← GPM IMERG 3rd rainfall validator

    Returns (rain_rows, temp_rows).
    """
    nasa_by_date = {r["date"]: r for r in nasa_records}
    open_by_date = {r["date"]: r for r in (open_meteo_records or [])}
    gsod_station_caches = gsod_station_caches or []
    imerg_cache = imerg_cache or {}

    rain_rows: list[dict] = []
    temp_rows: list[dict] = []
    day = start
    while day <= end:
        d = day.isoformat()
        nasa = nasa_by_date.get(d)

        nasa_rain = nasa.get("rainfall_mm") if nasa else None
        nasa_rh = nasa.get("rh_pct") if nasa else None

        # Raw max temperature for validator comparison
        nasa_temp = None
        if nasa:
            nasa_temp = nasa.get("temp_max_c")
            if nasa_temp is None:
                nasa_temp = nasa.get("temp_avg_c")

        # Computed heat index for PAGASA classification (Rothfusz 1990)
        nasa_hi = compute_heat_index(nasa_temp, nasa_rh)

        open_meteo = open_by_date.get(d)
        open_meteo_rain = open_meteo.get("rainfall_mm") if open_meteo else None
        open_meteo_temp = open_meteo.get("temp_max_c") if open_meteo else None

        chirps_rain = chirps_cache.get(d)
        imerg_rain = imerg_cache.get(d)
        met_temp = meteostat_cache.get(d)
        gsod_temp = _gsod_idw(lat, lon, gsod_station_caches, d) if (lat is not None and lon is not None) else None

        rain_row, temp_row = classify_day(
            d,
            municipality,
            nasa_rainfall_mm=nasa_rain,
            chirps_rainfall_mm=chirps_rain,
            open_meteo_rainfall_mm=open_meteo_rain,
            imerg_rainfall_mm=imerg_rain,
            nasa_temp_c=nasa_temp,
            nasa_heat_index_c=nasa_hi,
            meteostat_temp_c=met_temp,
            gsod_temp_c=gsod_temp,
            open_meteo_temp_c=open_meteo_temp,
            nasa_power_raw=nasa,
            open_meteo_raw=open_meteo,
            nasa_rh_pct=nasa_rh,
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
    WMO 98429). Returns {iso_date: temp_max_c}. Empty dict on any failure.
    """
    try:
        from meteostat import Station, daily as meteostat_daily
        from datetime import datetime as dt_class
    except ImportError:
        logger.warning("meteostat not installed — run: pip install meteostat")
        return {}

    from app.services.weather_validation import METEOSTAT_STATION_ID, METEOSTAT_STATION_NAME

    logger.info(
        "Fetching Meteostat DAILY MAX temperature from %s (%s to %s)...",
        METEOSTAT_STATION_NAME, start, end,
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


def build_noaa_gsod_station_caches(start: date, end: date) -> list[dict]:
    """
    Fetch DAILY MAXIMUM temperature from NOAA GSOD for Laguna-area stations.

    Returns one entry per station: {"lat", "lon", "name", "cache": {iso_date: temp_c}}.
    Callers use inverse-distance weighting (IDW) to get a per-municipality value
    rather than a single province-wide average (Shepard, 1968).

    The GSOD end date is capped at today − GSOD_LAG_DAYS (90 days) because
    NOAA GSOD finalizes international station data with a 30–90 day lag.
    """
    from app.services.weather_validator import GSOD_API, GSOD_STATIONS

    gsod_end = min(end, date.today() - timedelta(days=GSOD_LAG_DAYS))
    if gsod_end < start:
        logger.warning(
            "NOAA GSOD: adjusted end date %s is before start %s "
            "(GSOD_LAG_DAYS=%d) — skipping GSOD fetch entirely.",
            gsod_end, start, GSOD_LAG_DAYS,
        )
        return []

    logger.info(
        "Fetching NOAA GSOD DAILY MAX temperature (%s to %s, capped from %s)...",
        start, gsod_end, end,
    )

    station_caches: list[dict] = []
    for station in GSOD_STATIONS:
        params = urllib.parse.urlencode(
            {
                "dataset": "global-summary-of-the-day",
                "stations": station["id"],
                "startDate": start.isoformat(),
                "endDate": gsod_end.isoformat(),
                "format": "json",
                "units": "metric",
                "dataTypes": "MAX",
            }
        )
        url = f"{GSOD_API}?{params}"
        logger.info("  GSOD request URL: %s", url)

        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                records = json.loads(resp.read().decode())
        except Exception as exc:
            logger.warning(
                "NOAA GSOD daily fetch failed for station %s (%s): %s",
                station["id"], station["name"], exc,
            )
            continue

        if not isinstance(records, list) or not records:
            logger.warning(
                "NOAA GSOD empty/unexpected response for station %s (%s).",
                station["id"], station["name"],
            )
            continue

        cache: dict[str, float] = {}
        count = skipped_missing = skipped_implausible = 0
        for r in records:
            d = str(r.get("DATE", ""))[:10]
            raw_val = r.get("MAX")
            try:
                val_f = float(raw_val)
            except (TypeError, ValueError):
                skipped_missing += 1
                continue
            # GSOD ignores units=metric — values arrive in °F; convert to °C
            val = round((val_f - 32) * 5 / 9, 2)
            if not (18.0 <= val <= 45.0):
                skipped_implausible += 1
                continue
            cache[d] = val
            count += 1

        logger.info(
            "  GSOD %-30s → %d daily MAX records kept, "
            "%d skipped (missing MAX), %d skipped (implausible)",
            station["name"], count, skipped_missing, skipped_implausible,
        )
        station_caches.append({
            "lat": station["lat"],
            "lon": station["lon"],
            "name": station["name"],
            "cache": cache,
        })

    expected = (gsod_end - start).days + 1
    total_days = sum(len(s["cache"]) for s in station_caches)
    logger.info(
        "NOAA GSOD station caches built: %d stations, %d total station-days "
        "(%.0f%% avg coverage of %d-day window). "
        "Dates beyond %s (GSOD_LAG_DAYS=%d) are covered by Meteostat + Open-Meteo.",
        len(station_caches), total_days,
        total_days / (len(station_caches) * expected) * 100 if station_caches else 0,
        expected, gsod_end, GSOD_LAG_DAYS,
    )
    return station_caches


def _gsod_idw(lat: float, lon: float, station_caches: list[dict], date_str: str) -> Optional[float]:
    """
    Inverse-distance weighted temperature from GSOD stations for a municipality.
    Weights = 1/d² where d is Euclidean degree distance (Shepard, 1968).
    Returns None when no station has data for the date.
    """
    vals, weights = [], []
    for s in station_caches:
        temp = s["cache"].get(date_str)
        if temp is None:
            continue
        d2 = (lat - s["lat"]) ** 2 + (lon - s["lon"]) ** 2
        w = 1.0 / d2 if d2 > 1e-10 else 1e10
        vals.append(temp)
        weights.append(w)
    if not vals:
        return None
    return round(sum(v * w for v, w in zip(vals, weights)) / sum(weights), 2)


def build_gpm_imerg_daily_cache(start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY precipitation from NASA GPM IMERG Final Run V07 averaged
    over the Laguna Province bounding box via the NASA GES DISC OPeNDAP
    ASCII endpoint.

    Authentication: requires a NASA Earthdata Bearer Token stored in the
    EARTHDATA_BEARER_TOKEN environment variable. Register at
    https://urs.earthdata.nasa.gov/ (free). Token can also be stored in
    ~/.netrc as machine urs.earthdata.nasa.gov login <user> password <pass>.

    IMERG grid: 0.1° resolution, lat −89.95 to +89.95, lon −179.95 to +179.95.
    Laguna bbox: lat 13.85–14.60°N, lon 121.00–121.65°E.

    References:
      Huffman et al. (2023): GPM_3IMERGDF V07 dataset. NASA GES DISC.
        https://doi.org/10.5067/GPM/IMERG/3B-DAY/07
      Huffman et al. (2020): IMERG ATBD V06. NASA.

    Returns {iso_date: rainfall_mm}. Empty dict on any failure.
    """
    bearer_token = os.environ.get("EARTHDATA_BEARER_TOKEN", "").strip()
    if not bearer_token:
        logger.warning(
            "EARTHDATA_BEARER_TOKEN not set — GPM IMERG fetch skipped. "
            "Register at https://urs.earthdata.nasa.gov/ and set the env var."
        )
        return {}

    # Pre-compute fixed grid indices for Laguna bbox
    def _lat_idx(lat: float) -> int:
        return round((lat + 89.95) / 0.1)

    def _lon_idx(lon: float) -> int:
        return round((lon + 179.95) / 0.1)

    lat_i1 = _lat_idx(_IMERG_LAT_MIN)
    lat_i2 = _lat_idx(_IMERG_LAT_MAX)
    lon_i1 = _lon_idx(_IMERG_LON_MIN)
    lon_i2 = _lon_idx(_IMERG_LON_MAX)

    base = "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07"

    cache: dict[str, float] = {}
    current = start
    consecutive_failures = 0

    while current <= end:
        date_str = current.strftime("%Y%m%d")
        year = current.year

        # Try both V07B and V07 filename variants
        filename_candidates = [
            f"3B-DAY.MS.MRG.3IMERG.{date_str}-S000000-E235959.V07B.nc4",
            f"3B-DAY.MS.MRG.3IMERG.{date_str}-S000000-E235959.V07.nc4",
        ]

        fetched = False
        month = current.month
        for fname in filename_candidates:
            # OPeNDAP ASCII endpoint — returns plain text, no netCDF library needed.
            # Path uses YYYY/MM/ (not YYYY/DOY/). Dimension order is [time][lon][lat].
            url = (
                f"{base}/{year}/{month:02d}/{fname}.ascii"
                f"?precipitation[0][{lon_i1}:{lon_i2}][{lat_i1}:{lat_i2}]"
            )
            req = urllib.request.Request(
                url, headers={"Authorization": f"Bearer {bearer_token}"}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    text = resp.read().decode("utf-8")
                values = _parse_imerg_ascii(text)
                if values:
                    avg = round(sum(values) / len(values), 2)
                    cache[current.isoformat()] = avg
                    fetched = True
                    consecutive_failures = 0
                    break
            except Exception:
                continue

        if not fetched:
            consecutive_failures += 1
            if consecutive_failures >= 10:
                logger.warning(
                    "GPM IMERG: %d consecutive failures — stopping fetch at %s. "
                    "Data may not be available for recent dates.",
                    consecutive_failures, current,
                )
                break

        current += timedelta(days=1)
        time.sleep(0.25)  # respect GES DISC rate limits

    expected = (end - start).days + 1
    coverage_pct = len(cache) / expected * 100 if expected > 0 else 0
    logger.info(
        "GPM IMERG daily cache built: %d days (%.0f%% of %d-day window).",
        len(cache), coverage_pct, expected,
    )
    return cache


def _parse_imerg_ascii(text: str) -> list[float]:
    """
    Parse OPeNDAP ASCII response for the IMERG precipitation variable.

    GES DISC OPeNDAP returns lines like:
      precipitation.precipitation[time=NNN][lon=120.95], 1.07, 0.05, 0.01, ...
    Each line is one lon slice; values are per-lat-cell in mm/day.

    Missing/fill values (typically -9999.9) are excluded.
    Returns a flat list of valid precipitation values (mm/day, Final Run product).
    """
    values: list[float] = []
    for line in text.splitlines():
        line = line.strip()
        # Data lines: "precipitation.precipitation[...][...], v1, v2, ..."
        if not line.startswith("precipitation.precipitation["):
            continue
        # Drop the leading index token, keep only the numeric CSV part
        comma_pos = line.find(",")
        if comma_pos == -1:
            continue
        for token in line[comma_pos + 1:].split(","):
            token = token.strip()
            try:
                val = float(token)
            except ValueError:
                continue
            if val < -9000:  # fill value sentinel
                continue
            values.append(val)
    return values


def build_chirps_daily_cache(lat: float, lon: float, start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY CHIRPS rainfall for a point via ClimateSERV API.
    Returns {iso_date: rainfall_mm}. Empty dict on any failure.

    Reference: Funk et al. (2015), Scientific Data, 2, 150066.
    Access: Kruskopf et al. (2025), Environmental Modelling & Software.
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


# ── Confidence scoring ────────────────────────────────────────────────────────


def compute_confidence_scores(
    rain_rows: list[dict],
    temp_rows: list[dict],
) -> dict:
    """
    Compute dataset-level confidence scores for both weather dimensions.

    Three metrics per dimension (Murphy 1988; Cohen 1960; Landis & Koch 1977):

    1. MAE-Normalized Confidence (per validator):
       C = max(0, 1 − MAE/τ) × 100%   where τ is the tolerance threshold.
       Averaged only over validators that have actual data — validators with
       zero coverage are excluded from the denominator, not scored as 0%.
       This prevents a missing optional validator (e.g. GPM IMERG when no
       EARTHDATA_BEARER_TOKEN is set) from artificially depressing the score.

    2. Weighted Confidence Index (WCI):
       weights: 3/3 → 1.0, 2/3 → 0.67, 1/3 → 0.33, 0/3 → 0.0
       WCI = mean of per-day weights.

    3. Cohen's Kappa (κ) per validator:
       κ = (Po − Pe) / (1 − Pe)
       Strength scale per Landis & Koch (1977):
         < 0.20 Slight | 0.21–0.40 Fair | 0.41–0.60 Moderate
         0.61–0.80 Substantial | 0.81–1.00 Almost Perfect

    Returns a full report dict with per-validator and overall scores.
    """
    def _mae_confidence(diffs: list[float], tolerance: float) -> float:
        # Returns 0.0 when no data — but callers use coverage-weighted averaging
        # so a validator with 0 comparisons contributes 0 weight, not 0 score.
        if not diffs:
            return 0.0
        mae = sum(diffs) / len(diffs)
        return round(max(0.0, 1 - mae / tolerance) * 100, 2)

    def _wci(rows: list[dict]) -> float:
        weight_map = {3: 1.0, 2: 0.67, 1: 0.33, 0: 0.0}
        if not rows:
            return 0.0
        weights = [weight_map.get(r.get("validators_agreed", 0), 0.0) for r in rows]
        return round(sum(weights) / len(weights) * 100, 2)

    def _kappa(rows: list[dict], truth_col: str, validator_col: str, classify_fn) -> Optional[float]:
        pairs = [
            (classify_fn(r.get(truth_col)), classify_fn(r.get(validator_col)))
            for r in rows
            if r.get(truth_col) is not None and r.get(validator_col) is not None
        ]
        if len(pairs) < 2:
            return None
        categories = list({c for pair in pairs for c in pair if c is not None})
        n = len(pairs)
        # Observed agreement
        po = sum(1 for a, b in pairs if a == b) / n
        # Expected agreement
        pe = sum(
            (sum(1 for a, _ in pairs if a == cat) / n) *
            (sum(1 for _, b in pairs if b == cat) / n)
            for cat in categories
        )
        if pe >= 1.0:
            return 1.0
        return round((po - pe) / (1 - pe), 4)

    def _kappa_label(k: Optional[float]) -> str:
        if k is None:
            return "insufficient data"
        if k < 0.20:
            return "Slight"
        if k < 0.40:
            return "Fair"
        if k < 0.60:
            return "Moderate"
        if k < 0.80:
            return "Substantial"
        return "Almost Perfect"

    # ── Rainfall confidence ───────────────────────────────────────────────────
    chirps_diffs = [r["diff_nasa_chirps_mm"] for r in rain_rows if r.get("diff_nasa_chirps_mm") is not None]
    om_rain_diffs = [r["diff_nasa_open_meteo_mm"] for r in rain_rows if r.get("diff_nasa_open_meteo_mm") is not None]
    imerg_diffs = [r["diff_nasa_imerg_mm"] for r in rain_rows if r.get("diff_nasa_imerg_mm") is not None]

    c_chirps = _mae_confidence(chirps_diffs, RAIN_AGREE_TOLERANCE_MM)
    c_om_rain = _mae_confidence(om_rain_diffs, RAIN_AGREE_TOLERANCE_MM)
    c_imerg = _mae_confidence(imerg_diffs, RAIN_AGREE_TOLERANCE_MM)
    rain_scores = [s for s in [c_chirps, c_om_rain, c_imerg] if s is not None]
    rain_mae_confidence = round(sum(rain_scores) / len(rain_scores), 2) if rain_scores else 0.0
    rain_wci = _wci(rain_rows)

    k_chirps = _kappa(rain_rows, "nasa_power_rainfall_mm", "chirps_rainfall_mm", classify_rain)
    k_om_rain = _kappa(rain_rows, "nasa_power_rainfall_mm", "open_meteo_rainfall_mm", classify_rain)
    k_imerg = _kappa(rain_rows, "nasa_power_rainfall_mm", "imerg_rainfall_mm", classify_rain)

    # ── Temperature confidence ────────────────────────────────────────────────
    met_diffs = [r["diff_nasa_meteostat_c"] for r in temp_rows if r.get("diff_nasa_meteostat_c") is not None]
    gsod_diffs = [r["diff_nasa_gsod_c"] for r in temp_rows if r.get("diff_nasa_gsod_c") is not None]
    om_temp_diffs = [r["diff_nasa_open_meteo_c"] for r in temp_rows if r.get("diff_nasa_open_meteo_c") is not None]

    c_met = _mae_confidence(met_diffs, TEMP_AGREE_TOLERANCE_C)
    c_gsod = _mae_confidence(gsod_diffs, TEMP_AGREE_TOLERANCE_C)
    c_om_temp = _mae_confidence(om_temp_diffs, TEMP_AGREE_TOLERANCE_C)
    temp_scores = [s for s in [c_met, c_gsod, c_om_temp] if s is not None]
    temp_mae_confidence = round(sum(temp_scores) / len(temp_scores), 2) if temp_scores else 0.0
    temp_wci = _wci(temp_rows)

    k_met = _kappa(temp_rows, "nasa_power_temp_c", "meteostat_temp_c", classify_temp)
    k_gsod = _kappa(temp_rows, "nasa_power_temp_c", "noaa_gsod_temp_c", classify_temp)
    k_om_temp = _kappa(temp_rows, "nasa_power_temp_c", "open_meteo_temp_c", classify_temp)

    # Primary metric: Weighted Confidence Index (majority-rule validator agreement,
    # triple collocation principle — Stoffelen, 1998; Scipal et al., 2008).
    # Secondary metric: MAE-normalized confidence (magnitude accuracy vs tolerance).
    # Overall = 60% WCI + 40% MAE, following the precedence of categorical
    # agreement over point-value accuracy for classification-based applications.
    overall_wci = round((rain_wci + temp_wci) / 2, 2)
    overall_mae = round((rain_mae_confidence + temp_mae_confidence) / 2, 2)
    overall_confidence = round(0.6 * overall_wci + 0.4 * overall_mae, 2)

    return {
        "overall_confidence_pct": overall_confidence,
        "overall_wci_pct": overall_wci,
        "overall_mae_confidence_pct": overall_mae,
        "rainfall": {
            "total_rows": len(rain_rows),
            "mae_confidence_pct": rain_mae_confidence,
            "weighted_confidence_index_pct": rain_wci,
            "per_validator": {
                "CHIRPS": {
                    "mae_confidence_pct": c_chirps,
                    "kappa": k_chirps,
                    "kappa_strength": _kappa_label(k_chirps),
                    "n_comparisons": len(chirps_diffs),
                },
                "Open-Meteo ERA5-Land": {
                    "mae_confidence_pct": c_om_rain,
                    "kappa": k_om_rain,
                    "kappa_strength": _kappa_label(k_om_rain),
                    "n_comparisons": len(om_rain_diffs),
                },
                "GPM IMERG": {
                    "mae_confidence_pct": c_imerg,
                    "kappa": k_imerg,
                    "kappa_strength": _kappa_label(k_imerg),
                    "n_comparisons": len(imerg_diffs),
                },
            },
        },
        "temperature": {
            "total_rows": len(temp_rows),
            "note": "Validation uses raw temp_max_c; classification uses Rothfusz heat index.",
            "mae_confidence_pct": temp_mae_confidence,
            "weighted_confidence_index_pct": temp_wci,
            "per_validator": {
                "Meteostat": {
                    "mae_confidence_pct": c_met,
                    "kappa": k_met,
                    "kappa_strength": _kappa_label(k_met),
                    "n_comparisons": len(met_diffs),
                },
                "NOAA GSOD": {
                    "mae_confidence_pct": c_gsod,
                    "kappa": k_gsod,
                    "kappa_strength": _kappa_label(k_gsod),
                    "n_comparisons": len(gsod_diffs),
                },
                "Open-Meteo ERA5-Land": {
                    "mae_confidence_pct": c_om_temp,
                    "kappa": k_om_temp,
                    "kappa_strength": _kappa_label(k_om_temp),
                    "n_comparisons": len(om_temp_diffs),
                },
            },
        },
    }
