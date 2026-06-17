"""
Daily Weather Classifier
=========================
Classifies each day per municipality into rainfall and temperature categories,
cross-checking the source of truth (NASA POWER AG) against FIVE validators per
dimension at the DAILY level:

  Rainfall    : CHIRPS (satellite + gauge), Open-Meteo ERA5-Land (reanalysis),
                GPM IMERG (passive microwave satellite), ERA5 Full, UKMO
  Temperature : NOAA GSOD (station), Open-Meteo ERA5-Land (reanalysis),
                ERA5 Full, ECMWF IFS, UKMO

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

  Note: temperature VALIDATORS (NOAA GSOD, Open-Meteo, ERA5, ECMWF IFS, UKMO) compare
  against NASA POWER AG raw maximum temperature (not the heat index).
  Agreement is determined from raw temperature; classification is applied
  to the computed heat index once the raw temperature is validated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agreement and confidence — triple collocation / majority rule
(Stoffelen, 1998; Ma et al., 2020; Wei et al., 2023).
All validators check the same NASA POWER AG value SIMULTANEOUSLY and
INDEPENDENTLY — no sequential gating. Majority rule (≥ n//2 + 1 of n):

  validators_agreed = n   → All validators agree    → sources_agree = true
  validators_agreed ≥ maj → Majority agree (k/n)    → sources_agree = true
  validators_agreed < maj → Minority / one / none   → sources_agree = false

WMO quality flag mapping (WMO No. 1269, 2020):
  All agree      → Correct
  Majority agree → Probably Correct
  One agrees     → Probably Suspect
  None agree     → Suspect / flagged for review

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confidence scoring:

  Continuous dimensions (rainfall mm, temperature °C):
    Fleiss' Kappa — multi-rater categorical agreement (Fleiss, 1971).
    All validators are treated as simultaneous co-raters on binned categories.
    Each day is one "subject"; each API is one "rater".
    κ_F = (P_bar − P_e_bar) / (1 − P_e_bar)
    Bins:  Rainfall → PAGASA classes (light / moderate / heavy)
           Temperature → PAGASA heat-index tiers (applied to raw °C values
           so all raters are compared on the same scale)
    Interpretation (Landis & Koch, 1977):
      < 0.20 Slight | 0.21–0.40 Fair | 0.41–0.60 Moderate
      0.61–0.80 Substantial | 0.81–1.00 Almost Perfect

  Nominal dimension (severe weather WMO category — future):
    Krippendorff's Alpha (nominal distance) — handles missing raters.
    α = 1 − D_o / D_e  where D_o = observed disagreement rate,
                               D_e = expected disagreement from marginals.

  Weighted Confidence Index (WCI):
    Retained as a per-day majority-vote summary alongside Fleiss' Kappa.
    weight_map: {6:1.00, 5:0.83, 4:0.67, 3:0.50, 2:0.33, 1:0.17, 0:0.00}
    WCI = mean of per-day weights × 100 %

  References:
    Fleiss, J.L. (1971). Measuring nominal scale agreement among many raters.
      Psychological Bulletin, 76(5), 378–382.
    Krippendorff, K. (2004). Content Analysis: An Introduction to Its
      Methodology (2nd ed.). Sage.
    Landis, J.R. & Koch, G.G. (1977). The measurement of observer agreement
      for categorical data. Biometrics, 33(1), 159–174.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# Wind: PAGASA-aligned thresholds (m/s)
WIND_LIGHT_MIN_MS    = 3.0
WIND_MODERATE_MIN_MS = 7.0
WIND_STRONG_MIN_MS   = 14.0
WIND_STORM_MIN_MS    = 24.0

# Humidity: standard comfort scale (% RH)
HUMIDITY_LOW_MAX_PCT         = 40.0
HUMIDITY_COMFORTABLE_MAX_PCT = 60.0
HUMIDITY_HIGH_MAX_PCT        = 80.0

# ── Source agreement tolerances (daily) ───────────────────────────────────────

RAIN_AGREE_TOLERANCE_MM  = 10.0  # NASA POWER AG vs each rainfall validator
TEMP_AGREE_TOLERANCE_C   = 3.0   # NASA POWER AG vs each temperature validator
WIND_AGREE_TOLERANCE_MS  = 2.0   # NASA POWER AG vs each wind validator
HUMID_AGREE_TOLERANCE_PCT = 10.0  # NASA POWER AG vs each humidity validator

# Both dimensions use absolute MedAE for confidence scoring at the daily level.
# Relative MedAE (used by weather_validator.py) is reserved for monthly
# aggregates — daily median rainfall of ~4 mm makes relative thresholds
# non-discriminating (Aryastana et al., 2022).
# Rainfall reuses RAIN_AGREE_TOLERANCE_MM (10.0 mm) — same scale.
# Temperature reuses TEMP_AGREE_TOLERANCE_C (3.0 °C) — same scale.

# NOAA GSOD finalizes international station data with a 30–90 day lag.
# Cap GSOD requests at this many days before today to avoid requesting
# unfinalized records (reanalysis products use REANALYSIS_LAG_DAYS = 7).
GSOD_LAG_DAYS = 90

# ── Agreement status labels (must match CHECK constraints in migration) ────────

STATUS_ALL_AGREE = "All validators agree"
STATUS_ONE_AGREES = "One validator agrees"
STATUS_NONE_AGREE = "No validators agree"
# Majority/minority statuses are built dynamically: "Majority agree (3/5)", "Minority agree (2/5)"


def _wmo_flag(status: str) -> str:
    """Map an agreement_status string to a WMO No. 1269 quality flag."""
    if status == STATUS_ALL_AGREE:
        return "Correct"
    if status.startswith("Majority agree"):
        return "Probably Correct"
    if status.startswith("Minority agree") or status == STATUS_ONE_AGREES:
        return "Probably Suspect"
    return "Suspect"

# GPM IMERG bounding box for Laguna Province (0.1° grid)
# Lat: 13.85–14.60°N → indices 1038–1045
# Lon: 121.00–121.65°E → indices 3009–3016
_IMERG_LAT_MIN = 13.85
_IMERG_LAT_MAX = 14.60
_IMERG_LON_MIN = 121.00
_IMERG_LON_MAX = 121.65

# JAXA GSMaP NRT — public FTP server (no API key required)
# Product: GSMaP_Gauge_NRT v7, daily gauge-corrected, 0.1° grid
# Grid: XDEF 3600 (0.05°→359.95°, step 0.1°), YDEF 1200 (-59.95°→59.95°, step 0.1°), YREV
# Laguna bbox → stored rows 454–461, cols 1210–1216 (56 cells)
_GSMAP_FTP_HOST = "hokusai.eorc.jaxa.jp"
_GSMAP_FTP_USER = "rainmap"
_GSMAP_FTP_PASS = "Niskur+1404"
_GSMAP_GRID_COLS = 3600
_GSMAP_LAT_TOP   = 59.95   # row 0 latitude (YREV)
_GSMAP_LON_START = 0.05    # col 0 longitude
_GSMAP_STEP      = 0.1
_GSMAP_LAT_MIN   = 13.85
_GSMAP_LAT_MAX   = 14.60
_GSMAP_LON_MIN   = 121.00
_GSMAP_LON_MAX   = 121.65
_GSMAP_UNDEF     = -999.9


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


def classify_severe(weathercode: Optional[int]) -> Optional[str]:
    """
    Classify a WMO weathercode (0-99) into a severe weather category.
    Source: Open-Meteo WMO Weather Interpretation Codes.
      no_severe       → 0-3   (clear, mainly clear, partly cloudy, overcast)
      light_weather   → 45-61 (fog, drizzle, light rain)
      moderate_weather→ 63-65, 80-81 (moderate/heavy rain, rain showers)
      severe_weather  → 82, 95 (violent showers, thunderstorm)
      extreme_weather → 96-99 (thunderstorm with hail)
    """
    if weathercode is None:
        return None
    c = int(weathercode)
    if c <= 3:
        return "no_severe"
    if c <= 61:
        return "light_weather"
    if c <= 65 or 80 <= c <= 81:
        return "moderate_weather"
    if c == 82 or c == 95:
        return "severe_weather"
    if 96 <= c <= 99:
        return "extreme_weather"
    return "light_weather"


def classify_wind(wind_ms: Optional[float]) -> Optional[str]:
    """
    Classify daily wind speed (m/s) per PAGASA-aligned thresholds.
      calm     < 3 m/s
      light    3–7 m/s
      moderate 7–14 m/s
      strong   14–24 m/s
      storm    ≥ 24 m/s
    """
    if wind_ms is None:
        return None
    if wind_ms < WIND_LIGHT_MIN_MS:
        return "calm"
    if wind_ms < WIND_MODERATE_MIN_MS:
        return "light"
    if wind_ms < WIND_STRONG_MIN_MS:
        return "moderate"
    if wind_ms < WIND_STORM_MIN_MS:
        return "strong"
    return "storm"


def classify_humidity(rh_pct: Optional[float]) -> Optional[str]:
    """
    Classify relative humidity (%) into comfort categories.
      low         < 40%
      comfortable 40–60%
      high        60–80%
      very_high   > 80%
    """
    if rh_pct is None:
        return None
    if rh_pct < HUMIDITY_LOW_MAX_PCT:
        return "low"
    if rh_pct < HUMIDITY_COMFORTABLE_MAX_PCT:
        return "comfortable"
    if rh_pct < HUMIDITY_HIGH_MAX_PCT:
        return "high"
    return "very_high"


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
    Apply majority agreement rule (≥ n//2 + 1 of n) for one weather dimension.

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
    majority = n_total // 2 + 1

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
            "wmo_quality_flag": _wmo_flag(status),
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
            "wmo_quality_flag": _wmo_flag(status),
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
        status = STATUS_ALL_AGREE if agreed == n_total else f"Majority agree ({agreed}/{n_total})"
    elif agreed >= 2:
        classification = "inconclusive"
        sources_agree = False
        status = f"Minority agree ({agreed}/{n_total})"
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
    elif agreed >= 2:
        reason = (
            f"Minority agree ({agreed}/{n_total}): {_fmt(agreeing)} agree with "
            f"NASA POWER AG {truth_value:.2f} {unit}, but below majority ({majority}/{n_total}). "
            + (f"Conflicting: {_fmt(conflicting)}." if conflicting else "")
            + " Classified as inconclusive."
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
        "wmo_quality_flag": _wmo_flag(status),
        "reason": reason,
    }


def classify_day(
    date_iso: str,
    municipality: str,
    *,
    # Rainfall — source of truth + 5 validators
    nasa_rainfall_mm: Optional[float],
    chirps_rainfall_mm: Optional[float],
    open_meteo_rainfall_mm: Optional[float],
    gsmap_nrt_rainfall_mm: Optional[float],
    era5_rainfall_mm: Optional[float],
    ukmo_rainfall_mm: Optional[float],
    # Severe weather — source of truth (Open-Meteo ERA5-Land) + 3 validators
    open_meteo_weathercode: Optional[int] = None,
    era5_weathercode: Optional[int] = None,
    ecmwf_ifs_weathercode: Optional[int] = None,
    ukmo_weathercode: Optional[int] = None,
    # IBTrACS typhoon flags (supplementary — not a validator)
    typhoon_flag: bool = False,
    typhoon_signal: int = 0,
    # Temperature — source of truth (raw + heat index) + 4 validators
    nasa_temp_c: Optional[float] = None,
    nasa_heat_index_c: Optional[float] = None,
    nasa_rh_pct: Optional[float] = None,
    open_meteo_temp_c: Optional[float] = None,
    era5_temp_c: Optional[float] = None,
    ecmwf_ifs_temp_c: Optional[float] = None,
    ukmo_temp_c: Optional[float] = None,
    # Humidity validators (source of truth = nasa_rh_pct above)
    open_meteo_rh_pct: Optional[float] = None,
    era5_rh_pct: Optional[float] = None,
    # Wind — source of truth (NASA POWER AG WS10M) + 4 validators
    nasa_wind_ms: Optional[float] = None,
    open_meteo_wind_ms: Optional[float] = None,
    era5_wind_ms: Optional[float] = None,
    ecmwf_ifs_wind_ms: Optional[float] = None,
    ukmo_wind_ms: Optional[float] = None,
) -> tuple[Optional[dict], Optional[dict], Optional[dict]]:
    """
    Build rainfall, temperature, and wind daily rows for one (date, municipality).

    Rainfall  validators (n=5): CHIRPS, Open-Meteo ERA5-Land, GSMaP NRT, ERA5, UKMO.
    Severe    validators (n=3): ERA5, ECMWF IFS, UKMO weathercode.
    Temperature validators (n=4): Open-Meteo ERA5-Land, ERA5, ECMWF IFS, UKMO.
    Humidity  validators (n=2): Open-Meteo ERA5-Land, ERA5.
    Wind      validators (n=4): Open-Meteo ERA5-Land, ERA5, ECMWF IFS, UKMO.

    Returns (rain_row, temp_row, wind_row); any may be None when all sources missing.
    """
    # ── Rainfall ─────────────────────────────────────────────────────────────
    rain = _validate_dimension(
        nasa_rainfall_mm,
        [
            ("CHIRPS",               chirps_rainfall_mm),
            ("Open-Meteo ERA5-Land", open_meteo_rainfall_mm),
            ("GSMaP NRT",            gsmap_nrt_rainfall_mm),
            ("ERA5 (Full)",          era5_rainfall_mm),
            ("UKMO",                 ukmo_rainfall_mm),
        ],
        classify_rain,
        RAIN_AGREE_TOLERANCE_MM,
        "mm",
    )

    # ── Severe weather (weathercode — integer agreement, no numeric tolerance) ─
    # Use _validate_dimension with tolerance=0; category match is sufficient.
    severe = _validate_dimension(
        open_meteo_weathercode,
        [
            ("ERA5",      era5_weathercode),
            ("ECMWF IFS", ecmwf_ifs_weathercode),
            ("UKMO",      ukmo_weathercode),
        ],
        classify_severe,
        0,   # tolerance=0 — agreement is purely by category, not numeric diff
        "code",
    )

    # ── Temperature (validate raw; classify via heat index) ───────────────────
    temp = _validate_dimension(
        nasa_temp_c,
        [
            ("Open-Meteo ERA5-Land", open_meteo_temp_c),
            ("ERA5 (Full)",          era5_temp_c),
            ("ECMWF IFS",            ecmwf_ifs_temp_c),
            ("UKMO",                 ukmo_temp_c),
        ],
        classify_temp,
        TEMP_AGREE_TOLERANCE_C,
        "°C",
        classification_value=nasa_heat_index_c,
    )

    # ── Humidity ──────────────────────────────────────────────────────────────
    humidity = _validate_dimension(
        nasa_rh_pct,
        [
            ("Open-Meteo ERA5-Land", open_meteo_rh_pct),
            ("ERA5 (Full)",          era5_rh_pct),
        ],
        classify_humidity,
        HUMID_AGREE_TOLERANCE_PCT,
        "%",
    )

    # ── Wind ──────────────────────────────────────────────────────────────────
    wind = _validate_dimension(
        nasa_wind_ms,
        [
            ("Open-Meteo ERA5-Land", open_meteo_wind_ms),
            ("ERA5 (Full)",          era5_wind_ms),
            ("ECMWF IFS",            ecmwf_ifs_wind_ms),
            ("UKMO",                 ukmo_wind_ms),
        ],
        classify_wind,
        WIND_AGREE_TOLERANCE_MS,
        "m/s",
    )

    # ── Build rain row ────────────────────────────────────────────────────────
    rain_row = None
    if rain is not None:
        sev = severe or {}
        rain_row = {
            "date":                      date_iso,
            "municipality":              municipality,
            # Rainfall
            "nasa_power_rainfall_mm":    round(nasa_rainfall_mm, 2) if nasa_rainfall_mm is not None else None,
            "chirps_rainfall_mm":        round(chirps_rainfall_mm, 2) if chirps_rainfall_mm is not None else None,
            "open_meteo_rainfall_mm":    round(open_meteo_rainfall_mm, 2) if open_meteo_rainfall_mm is not None else None,
            "gsmap_nrt_rainfall_mm":     round(gsmap_nrt_rainfall_mm, 2) if gsmap_nrt_rainfall_mm is not None else None,
            "era5_rainfall_mm":          round(era5_rainfall_mm, 2) if era5_rainfall_mm is not None else None,
            "ukmo_rainfall_mm":          round(ukmo_rainfall_mm, 2) if ukmo_rainfall_mm is not None else None,
            "diff_nasa_chirps_mm":       _diff(nasa_rainfall_mm, chirps_rainfall_mm),
            "diff_nasa_open_meteo_mm":   _diff(nasa_rainfall_mm, open_meteo_rainfall_mm),
            "diff_nasa_gsmap_mm":        _diff(nasa_rainfall_mm, gsmap_nrt_rainfall_mm),
            "diff_nasa_era5_mm":         _diff(nasa_rainfall_mm, era5_rainfall_mm),
            "diff_nasa_ukmo_mm":         _diff(nasa_rainfall_mm, ukmo_rainfall_mm),
            "rain_classification":       rain["classification"],
            "validators_agreed":         rain["validators_agreed"],
            "wmo_quality_flag":          rain["wmo_quality_flag"],
            "reason":                    rain["reason"],
            # Severe weather
            "open_meteo_weathercode":    open_meteo_weathercode,
            "era5_weathercode":          era5_weathercode,
            "ecmwf_ifs_weathercode":     ecmwf_ifs_weathercode,
            "ukmo_weathercode":          ukmo_weathercode,
            "severe_classification":     sev.get("classification"),
            "severe_validators_agreed":  sev.get("validators_agreed", 0),
            "severe_wmo_quality_flag":   sev.get("wmo_quality_flag"),
            "severe_reason":             sev.get("reason"),
            # IBTrACS
            "typhoon_flag":              typhoon_flag,
            "typhoon_signal":            typhoon_signal,
        }

    # ── Build temp row ────────────────────────────────────────────────────────
    temp_row = None
    if temp is not None:
        hum = humidity or {}
        temp_row = {
            "date":                        date_iso,
            "municipality":                municipality,
            # Temperature
            "nasa_power_temp_c":           round(nasa_temp_c, 2) if nasa_temp_c is not None else None,
            "nasa_power_heat_index_c":     round(nasa_heat_index_c, 2) if nasa_heat_index_c is not None else None,
            "nasa_power_rh_pct":           round(nasa_rh_pct, 2) if nasa_rh_pct is not None else None,
            "open_meteo_temp_c":           round(open_meteo_temp_c, 2) if open_meteo_temp_c is not None else None,
            "era5_temp_c":                 round(era5_temp_c, 2) if era5_temp_c is not None else None,
            "ecmwf_ifs_temp_c":            round(ecmwf_ifs_temp_c, 2) if ecmwf_ifs_temp_c is not None else None,
            "ukmo_temp_c":                 round(ukmo_temp_c, 2) if ukmo_temp_c is not None else None,
            "diff_nasa_open_meteo_c":      _diff(nasa_temp_c, open_meteo_temp_c),
            "diff_nasa_era5_c":            _diff(nasa_temp_c, era5_temp_c),
            "diff_nasa_ecmwf_ifs_c":       _diff(nasa_temp_c, ecmwf_ifs_temp_c),
            "diff_nasa_ukmo_c":            _diff(nasa_temp_c, ukmo_temp_c),
            "temp_classification":         temp["classification"],
            "validators_agreed":           temp["validators_agreed"],
            "wmo_quality_flag":            temp["wmo_quality_flag"],
            "reason":                      temp["reason"],
            # Humidity
            "open_meteo_rh_pct":           round(open_meteo_rh_pct, 2) if open_meteo_rh_pct is not None else None,
            "era5_rh_pct":                 round(era5_rh_pct, 2) if era5_rh_pct is not None else None,
            "diff_nasa_open_meteo_rh_pct": _diff(nasa_rh_pct, open_meteo_rh_pct),
            "diff_nasa_era5_rh_pct":       _diff(nasa_rh_pct, era5_rh_pct),
            "humidity_classification":     hum.get("classification"),
            "humidity_validators_agreed":  hum.get("validators_agreed", 0),
            "humidity_wmo_quality_flag":   hum.get("wmo_quality_flag"),
            "humidity_reason":             hum.get("reason"),
        }

    # ── Build wind row ────────────────────────────────────────────────────────
    wind_row = None
    if wind is not None:
        wind_row = {
            "date":                       date_iso,
            "municipality":               municipality,
            "nasa_power_wind_ms":         round(nasa_wind_ms, 2) if nasa_wind_ms is not None else None,
            "open_meteo_wind_ms":         round(open_meteo_wind_ms, 2) if open_meteo_wind_ms is not None else None,
            "era5_wind_ms":               round(era5_wind_ms, 2) if era5_wind_ms is not None else None,
            "ecmwf_ifs_wind_ms":          round(ecmwf_ifs_wind_ms, 2) if ecmwf_ifs_wind_ms is not None else None,
            "ukmo_wind_ms":               round(ukmo_wind_ms, 2) if ukmo_wind_ms is not None else None,
            "diff_nasa_open_meteo_wind_ms": _diff(nasa_wind_ms, open_meteo_wind_ms),
            "diff_nasa_era5_wind_ms":     _diff(nasa_wind_ms, era5_wind_ms),
            "diff_nasa_ecmwf_ifs_wind_ms": _diff(nasa_wind_ms, ecmwf_ifs_wind_ms),
            "diff_nasa_ukmo_wind_ms":     _diff(nasa_wind_ms, ukmo_wind_ms),
            "wind_classification":        wind["classification"],
            "validators_agreed":          wind["validators_agreed"],
            "wmo_quality_flag":           wind["wmo_quality_flag"],
            "reason":                     wind["reason"],
        }

    return rain_row, temp_row, wind_row


def build_daily_rows(
    municipality: str,
    start: date,
    end: date,
    nasa_records: list[dict],
    chirps_cache: dict[str, float],
    open_meteo_records: Optional[list[dict]] = None,
    gsmap_cache: Optional[dict[str, float]] = None,
    era5_records: Optional[list[dict]] = None,
    ecmwf_ifs_records: Optional[list[dict]] = None,
    ukmo_records: Optional[list[dict]] = None,
    typhoon_flags: Optional[dict[str, dict]] = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Classify every day in [start, end] for one municipality.

    nasa_records      : daily dicts from NASA POWER AG (rainfall, temp, wind, rh).
    chirps_cache      : {iso_date: rainfall_mm}
    open_meteo_records: ERA5-Land daily dicts (temp, rain, wind, weathercode, rh).
    gsmap_cache       : {iso_date: rainfall_mm}
    era5_records      : ERA5 daily dicts (temp, rain, wind, weathercode, rh).
    ecmwf_ifs_records : ECMWF IFS daily dicts (temp, wind, weathercode).
    ukmo_records      : UKMO daily dicts (temp, rain, wind, weathercode).
    typhoon_flags     : {iso_date: {signal, intensity_class}} from IBTrACS.

    Returns (rain_rows, temp_rows, wind_rows).
    """
    nasa_by_date      = {r["date"]: r for r in nasa_records}
    open_by_date      = {r["date"]: r for r in (open_meteo_records or [])}
    era5_by_date      = {r["date"]: r for r in (era5_records or [])}
    ecmwf_ifs_by_date = {r["date"]: r for r in (ecmwf_ifs_records or [])}
    ukmo_by_date      = {r["date"]: r for r in (ukmo_records or [])}
    gsmap_cache       = gsmap_cache or {}
    typhoon_flags     = typhoon_flags or {}

    rain_rows: list[dict] = []
    temp_rows: list[dict] = []
    wind_rows: list[dict] = []

    day = start
    while day <= end:
        d = day.isoformat()
        nasa = nasa_by_date.get(d)

        # NASA POWER AG values
        nasa_rain = nasa.get("rainfall_mm") if nasa else None
        nasa_rh   = nasa.get("rh_pct")      if nasa else None
        nasa_wind = nasa.get("wind_ms")      if nasa else None
        nasa_temp = None
        if nasa:
            nasa_temp = nasa.get("temp_max_c") or nasa.get("temp_avg_c")
        nasa_hi = compute_heat_index(nasa_temp, nasa_rh)

        # Open-Meteo ERA5-Land
        open_meteo           = open_by_date.get(d)
        open_meteo_rain      = open_meteo.get("rainfall_mm")          if open_meteo else None
        open_meteo_temp      = open_meteo.get("temp_max_c")           if open_meteo else None
        open_meteo_wind      = open_meteo.get("wind_ms")              if open_meteo else None
        open_meteo_wcode     = open_meteo.get("weathercode")          if open_meteo else None
        open_meteo_rh        = open_meteo.get("relativehumidity_pct") if open_meteo else None

        # ERA5
        era5           = era5_by_date.get(d)
        era5_rain      = era5.get("rainfall_mm")          if era5 else None
        era5_temp      = era5.get("temp_max_c")           if era5 else None
        era5_wind      = era5.get("wind_ms")              if era5 else None
        era5_wcode     = era5.get("weathercode")          if era5 else None
        era5_rh        = era5.get("relativehumidity_pct") if era5 else None

        # ECMWF IFS
        ecmwf_ifs      = ecmwf_ifs_by_date.get(d)
        ecmwf_ifs_temp = ecmwf_ifs.get("temp_max_c")  if ecmwf_ifs else None
        ecmwf_ifs_wind = ecmwf_ifs.get("wind_ms")     if ecmwf_ifs else None
        ecmwf_ifs_wcode= ecmwf_ifs.get("weathercode") if ecmwf_ifs else None

        # UKMO
        ukmo       = ukmo_by_date.get(d)
        ukmo_rain  = ukmo.get("rainfall_mm") if ukmo else None
        ukmo_temp  = ukmo.get("temp_max_c")  if ukmo else None
        ukmo_wind  = ukmo.get("wind_ms")     if ukmo else None
        ukmo_wcode = ukmo.get("weathercode") if ukmo else None

        # CHIRPS + GSMaP
        chirps_rain = chirps_cache.get(d)
        gsmap_rain  = gsmap_cache.get(d)

        # IBTrACS typhoon flag
        typhoon = typhoon_flags.get(d)
        t_flag   = typhoon is not None
        t_signal = 0
        if typhoon:
            wind_kt = typhoon.get("max_wind_kt") or 0
            if wind_kt >= 100:
                t_signal = 5
            elif wind_kt >= 64:
                t_signal = 4
            elif wind_kt >= 48:
                t_signal = 3
            elif wind_kt >= 34:
                t_signal = 2
            elif wind_kt >= 25:
                t_signal = 1

        rain_row, temp_row, wind_row = classify_day(
            d, municipality,
            nasa_rainfall_mm=nasa_rain,
            chirps_rainfall_mm=chirps_rain,
            open_meteo_rainfall_mm=open_meteo_rain,
            gsmap_nrt_rainfall_mm=gsmap_rain,
            era5_rainfall_mm=era5_rain,
            ukmo_rainfall_mm=ukmo_rain,
            open_meteo_weathercode=open_meteo_wcode,
            era5_weathercode=era5_wcode,
            ecmwf_ifs_weathercode=ecmwf_ifs_wcode,
            ukmo_weathercode=ukmo_wcode,
            typhoon_flag=t_flag,
            typhoon_signal=t_signal,
            nasa_temp_c=nasa_temp,
            nasa_heat_index_c=nasa_hi,
            nasa_rh_pct=nasa_rh,
            open_meteo_temp_c=open_meteo_temp,
            era5_temp_c=era5_temp,
            ecmwf_ifs_temp_c=ecmwf_ifs_temp,
            ukmo_temp_c=ukmo_temp,
            open_meteo_rh_pct=open_meteo_rh,
            era5_rh_pct=era5_rh,
            nasa_wind_ms=nasa_wind,
            open_meteo_wind_ms=open_meteo_wind,
            era5_wind_ms=era5_wind,
            ecmwf_ifs_wind_ms=ecmwf_ifs_wind,
            ukmo_wind_ms=ukmo_wind,
        )
        if rain_row is not None:
            rain_rows.append(rain_row)
        if temp_row is not None:
            temp_rows.append(temp_row)
        if wind_row is not None:
            wind_rows.append(wind_row)
        day += timedelta(days=1)

    return rain_rows, temp_rows, wind_rows


# ── Daily validator caches ────────────────────────────────────────────────────


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
        "Dates beyond %s (GSOD_LAG_DAYS=%d) are covered by Open-Meteo ERA5-Land, ECMWF IFS, and UKMO.",
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

    # Build date list for parallel fetching
    all_dates: list[date] = []
    current = start
    while current <= end:
        all_dates.append(current)
        current += timedelta(days=1)

    def _fetch_imerg_day(d: date) -> tuple[str, float | None]:
        date_str = d.strftime("%Y%m%d")
        filename_candidates = [
            f"3B-DAY.MS.MRG.3IMERG.{date_str}-S000000-E235959.V07B.nc4",
            f"3B-DAY.MS.MRG.3IMERG.{date_str}-S000000-E235959.V07.nc4",
        ]
        for fname in filename_candidates:
            url = (
                f"{base}/{d.year}/{d.month:02d}/{fname}.ascii"
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
                    return d.isoformat(), round(sum(values) / len(values), 2)
            except Exception:
                continue
        return d.isoformat(), None

    cache: dict[str, float] = {}
    # 8 workers: ~8× speedup vs sequential; GES DISC allows burst traffic.
    # Each worker issues one request at a time so the effective rate stays
    # within typical OPeNDAP limits (no per-request sleep needed at this scale).
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(_fetch_imerg_day, d): d for d in all_dates}
        fail_streak = 0
        for fut in as_completed(futs):
            iso, val = fut.result()
            if val is not None:
                cache[iso] = val
                fail_streak = 0
            else:
                fail_streak += 1
                if fail_streak >= 50:
                    logger.warning(
                        "GPM IMERG: %d failures so far — recent dates likely unavailable.",
                        fail_streak,
                    )

    expected = (end - start).days + 1
    coverage_pct = len(cache) / expected * 100 if expected > 0 else 0
    logger.info(
        "GPM IMERG daily cache built: %d days (%.0f%% of %d-day window).",
        len(cache), coverage_pct, expected,
    )
    return cache


def build_gsmap_nrt_daily_cache(start: date, end: date) -> dict[str, float]:
    """
    Fetch DAILY precipitation from JAXA GSMaP Gauge-NRT v7 averaged over
    the Laguna Province bounding box via JAXA's public FTP server.

    Product: /realtime/daily0.1_G/00Z-23Z/{YYYYMM}/gsmap_gauge.{YYYYMMDD}.0.1d.daily.00Z-23Z.dat.gz
    Binary format: 1200 rows × 3600 cols, little-endian float32, YREV.
    Variable: daily mean rain rate in mm/hr → multiply by 24 for mm/day.
    UNDEF: -999.9.  No API key required — public FTP credentials per JAXA docs.

    Reference: Kubota et al. (2020), JMSJ, 98(3).
      https://sharaku.eorc.jaxa.jp/GSMaP/

    Returns {iso_date: rainfall_mm}. Empty dict on any failure.
    """
    import gzip
    import struct

    # Laguna bbox → stored rows 454–461, cols 1210–1216 (56 cells, 0.1° grid)
    def _row(lat: float) -> int:
        return round((_GSMAP_LAT_TOP - lat) / _GSMAP_STEP)

    def _col(lon: float) -> int:
        return round((lon - _GSMAP_LON_START) / _GSMAP_STEP)

    row_min = _row(_GSMAP_LAT_MAX)   # smaller index = higher lat (YREV)
    row_max = _row(_GSMAP_LAT_MIN)
    col_min = _col(_GSMAP_LON_MIN)
    col_max = _col(_GSMAP_LON_MAX)

    all_dates: list[date] = []
    current = start
    while current <= end:
        all_dates.append(current)
        current += timedelta(days=1)

    def _fetch_gsmap_day(d: date) -> tuple[str, float | None]:
        date_str = d.strftime("%Y%m%d")
        ym_str   = d.strftime("%Y%m")
        fname    = f"gsmap_gauge.{date_str}.0.1d.daily.00Z-23Z.dat.gz"
        ftp_url  = (
            f"ftp://{_GSMAP_FTP_USER}:{_GSMAP_FTP_PASS}@{_GSMAP_FTP_HOST}"
            f"/realtime/daily0.1_G/00Z-23Z/{ym_str}/{fname}"
        )
        try:
            req = urllib.request.Request(ftp_url)
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw_gz = resp.read()
            data = gzip.decompress(raw_gz)
            n_cols = col_max - col_min + 1
            values: list[float] = []
            for row in range(row_min, row_max + 1):
                offset = (row * _GSMAP_GRID_COLS + col_min) * 4
                row_bytes = data[offset: offset + n_cols * 4]
                row_vals = struct.unpack(f"<{n_cols}f", row_bytes)
                values.extend(v for v in row_vals if v > _GSMAP_UNDEF + 1.0 and v >= 0.0)
            if values:
                return d.isoformat(), round(sum(values) / len(values) * 24, 2)
            logger.warning("GSMaP NRT: no valid cells for %s", d)
            return d.isoformat(), None
        except Exception as exc:
            logger.warning("GSMaP NRT: failed to fetch %s: %s", d, exc)
            return d.isoformat(), None

    cache: dict[str, float] = {}
    # 3 workers: JAXA FTP rate-limits aggressively; more than 3-4 concurrent
    # connections triggers WinError 10060/10054 timeouts that waste 60s each.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for iso, val in pool.map(_fetch_gsmap_day, all_dates):
            if val is not None:
                cache[iso] = val

    expected = (end - start).days + 1
    coverage_pct = len(cache) / expected * 100 if expected > 0 else 0
    logger.info(
        "GSMaP NRT daily cache built: %d days (%.0f%% of %d-day window).",
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
    wind_rows: Optional[list[dict]] = None,
) -> dict:
    """
    Compute dataset-level confidence scores for both weather dimensions.

    Metrics (Fleiss 1971; Landis & Koch 1977):

    1. Fleiss' Kappa (κ_F) — multi-rater categorical agreement on binned values.
       Each day = one subject; each API with data that day = one rater.
       κ_F = (P_bar − P_e_bar) / (1 − P_e_bar)
         P_bar   = mean per-item proportion of agreeing rater-pairs
         P_e_bar = sum of squared marginal category proportions
       Bins:
         Rainfall    → PAGASA classes via classify_rain()
         Temperature → PAGASA heat-index tiers via classify_temp()
       Strength (Landis & Koch, 1977):
         < 0.20 Slight | 0.21-0.40 Fair | 0.41-0.60 Moderate
         0.61-0.80 Substantial | 0.81-1.00 Almost Perfect

    2. Weighted Confidence Index (WCI) — per-day majority-vote weight.
       weight_map: {6:1.00, 5:0.83, 4:0.67, 3:0.50, 2:0.33, 1:0.17, 0:0.00}
       WCI = mean(weights) x 100 %
    """
    # ── helpers ───────────────────────────────────────────────────────────────

    def _fleiss_kappa(items: list[dict]) -> Optional[float]:
        """items: list of {rater_name: category_str}. Raters may differ per item."""
        if len(items) < 2:
            return None
        # Collect all categories across all items
        all_cats: set[str] = set()
        for item in items:
            all_cats.update(item.values())
        cats = sorted(all_cats)
        k = len(cats)
        if k < 2:
            return None

        # Build count matrix: n_items x n_cats (how many raters assigned each cat per item)
        n_items = len(items)
        cat_idx = {c: i for i, c in enumerate(cats)}
        counts: list[list[int]] = [[0] * k for _ in range(n_items)]
        n_raters_per_item: list[int] = []
        for i, item in enumerate(items):
            rater_count = 0
            for cat in item.values():
                counts[i][cat_idx[cat]] += 1
                rater_count += 1
            n_raters_per_item.append(rater_count)

        # Filter items with fewer than 2 raters (cannot compute agreement)
        valid = [(counts[i], n_raters_per_item[i]) for i in range(n_items) if n_raters_per_item[i] >= 2]
        if len(valid) < 2:
            return None

        # P_bar: mean per-item agreement proportion
        p_items = []
        for cnt, n_j in valid:
            denom = n_j * (n_j - 1)
            p_j = sum(c * (c - 1) for c in cnt) / denom if denom > 0 else 0.0
            p_items.append(p_j)
        p_bar = sum(p_items) / len(p_items)

        # P_e_bar: sum of squared marginal proportions across all valid items
        total_ratings = sum(n_j for _, n_j in valid)
        if total_ratings == 0:
            return None
        cat_totals = [0] * k
        for cnt, _ in valid:
            for j, c in enumerate(cnt):
                cat_totals[j] += c
        p_e_bar = sum((t / total_ratings) ** 2 for t in cat_totals)

        if p_e_bar >= 1.0:
            return 1.0
        return round((p_bar - p_e_bar) / (1.0 - p_e_bar), 4)

    def _fk_label(k: Optional[float]) -> str:
        if k is None:
            return "insufficient data"
        if k < 0.0:
            return "Poor"
        if k < 0.20:
            return "Slight"
        if k < 0.40:
            return "Fair"
        if k < 0.60:
            return "Moderate"
        if k < 0.80:
            return "Substantial"
        return "Almost Perfect"

    def _wci(rows: list[dict], n_validators: int, agreed_col: str = "validators_agreed") -> float:
        if not rows or n_validators == 0:
            return 0.0
        weights = [r.get(agreed_col, 0) / n_validators for r in rows]
        return round(sum(weights) / len(weights) * 100, 2)

    def _build_items(rows: list[dict], col_map: dict[str, str], classify_fn) -> list[dict]:
        """col_map: {rater_label: row_key}. Returns Fleiss items list."""
        items = []
        for row in rows:
            item: dict[str, str] = {}
            for label, col in col_map.items():
                val = row.get(col)
                if val is not None:
                    item[label] = classify_fn(val)
            if len(item) >= 2:
                items.append(item)
        return items

    # ── Rainfall ─────────────────────────────────────────────────────────────
    rain_col_map = {
        "NASA POWER AG":        "nasa_power_rainfall_mm",
        "CHIRPS":               "chirps_rainfall_mm",
        "Open-Meteo ERA5-Land": "open_meteo_rainfall_mm",
        "GSMaP NRT":            "gsmap_nrt_rainfall_mm",
        "ERA5 (Full)":          "era5_rainfall_mm",
        "UKMO":                 "ukmo_rainfall_mm",
    }
    rain_items = _build_items(rain_rows, rain_col_map, classify_rain)
    rain_fk    = _fleiss_kappa(rain_items)
    rain_wci   = _wci(rain_rows, len(rain_col_map) - 1)  # n=5

    # ── Severe weather ────────────────────────────────────────────────────────
    severe_col_map = {
        "Open-Meteo ERA5-Land": "open_meteo_weathercode",
        "ERA5 (Full)":          "era5_weathercode",
        "ECMWF IFS":            "ecmwf_ifs_weathercode",
        "UKMO":                 "ukmo_weathercode",
    }
    severe_items = _build_items(rain_rows, severe_col_map, lambda c: classify_severe(int(c)) if c is not None else None)
    severe_fk    = _fleiss_kappa(severe_items)
    severe_wci   = _wci(rain_rows, 3, agreed_col="severe_validators_agreed")

    # ── Temperature ───────────────────────────────────────────────────────────
    temp_col_map = {
        "NASA POWER AG":        "nasa_power_temp_c",
        "Open-Meteo ERA5-Land": "open_meteo_temp_c",
        "ERA5 (Full)":          "era5_temp_c",
        "ECMWF IFS":            "ecmwf_ifs_temp_c",
        "UKMO":                 "ukmo_temp_c",
    }
    temp_items = _build_items(temp_rows, temp_col_map, classify_temp)
    temp_fk    = _fleiss_kappa(temp_items)
    temp_wci   = _wci(temp_rows, len(temp_col_map) - 1)  # n=4

    # ── Humidity ──────────────────────────────────────────────────────────────
    humidity_col_map = {
        "NASA POWER AG":        "nasa_power_rh_pct",
        "Open-Meteo ERA5-Land": "open_meteo_rh_pct",
        "ERA5 (Full)":          "era5_rh_pct",
    }
    humidity_items = _build_items(temp_rows, humidity_col_map, classify_humidity)
    humidity_fk    = _fleiss_kappa(humidity_items)
    humidity_wci   = _wci(temp_rows, 2, agreed_col="humidity_validators_agreed")

    # ── Wind ──────────────────────────────────────────────────────────────────
    wind_rows = wind_rows or []
    wind_col_map = {
        "NASA POWER AG":        "nasa_power_wind_ms",
        "Open-Meteo ERA5-Land": "open_meteo_wind_ms",
        "ERA5 (Full)":          "era5_wind_ms",
        "ECMWF IFS":            "ecmwf_ifs_wind_ms",
        "UKMO":                 "ukmo_wind_ms",
    }
    wind_items = _build_items(wind_rows, wind_col_map, classify_wind)
    wind_fk    = _fleiss_kappa(wind_items)
    wind_wci   = _wci(wind_rows, len(wind_col_map) - 1)  # n=4

    # ── Overall WCI (Option 2: primary×2, secondary×1) / 8 ───────────────────
    overall_wci = round(
        (rain_wci * 2 + severe_wci * 2 + temp_wci * 2 + wind_wci + humidity_wci) / 8, 2
    )
    fk_scores  = [k for k in [rain_fk, severe_fk, temp_fk, wind_fk, humidity_fk] if k is not None]
    overall_fk = round(sum(fk_scores) / len(fk_scores), 4) if fk_scores else None

    return {
        "overall_fleiss_kappa":    overall_fk,
        "overall_fleiss_strength": _fk_label(overall_fk),
        "overall_wci_pct":         overall_wci,
        "rainfall": {
            "total_rows":                    len(rain_rows),
            "n_items_for_kappa":             len(rain_items),
            "fleiss_kappa":                  rain_fk,
            "fleiss_strength":               _fk_label(rain_fk),
            "weighted_confidence_index_pct": rain_wci,
        },
        "severe_weather": {
            "total_rows":                    len(rain_rows),
            "n_items_for_kappa":             len(severe_items),
            "fleiss_kappa":                  severe_fk,
            "fleiss_strength":               _fk_label(severe_fk),
            "weighted_confidence_index_pct": severe_wci,
        },
        "temperature": {
            "total_rows":                    len(temp_rows),
            "n_items_for_kappa":             len(temp_items),
            "note": "Validation bins raw temp_c; classification uses Rothfusz heat index.",
            "fleiss_kappa":                  temp_fk,
            "fleiss_strength":               _fk_label(temp_fk),
            "weighted_confidence_index_pct": temp_wci,
        },
        "humidity": {
            "total_rows":                    len(temp_rows),
            "n_items_for_kappa":             len(humidity_items),
            "fleiss_kappa":                  humidity_fk,
            "fleiss_strength":               _fk_label(humidity_fk),
            "weighted_confidence_index_pct": humidity_wci,
        },
        "wind": {
            "total_rows":                    len(wind_rows),
            "n_items_for_kappa":             len(wind_items),
            "fleiss_kappa":                  wind_fk,
            "fleiss_strength":               _fk_label(wind_fk),
            "weighted_confidence_index_pct": wind_wci,
        },
    }
