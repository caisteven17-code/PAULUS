"""
Dual Source-of-Truth Confidence Test  (Unbiased Edition)
=========================================================
Addresses the ECMWF in-group bias: ERA5-Land, ERA5 Full, and ECMWF IFS
all share the same ECMWF reanalysis infrastructure -- they are not
independent validators of each other.

Validator independence classification:
  INDEPENDENT (different data family):
    - NOAA GSOD      : surface station observations  (ground truth)
    - Open-Meteo UKMO: UK Met Office NWP             (separate NWP)
    - NASA POWER AG  : MERRA-2 reanalysis (NASA GMAO)(validator when OM is SoT)
    - Open-Meteo ERA5-Land: ECMWF ERA5               (validator when NASA is SoT)

  ECMWF FAMILY (share ERA5 infrastructure -- shown for reference only):
    - Open-Meteo ERA5 Full
    - Open-Meteo ECMWF IFS

Agreement metrics:
  Fleiss' Kappa   -> continuous factors (binned), INDEPENDENT validators only
  Krippendorff's Alpha -> severe weather WMO categories (nominal)

Period: 2025-01-01 to 2025-05-31  (where GSOD data is confirmed available)
Location: Laguna Province (14.2N, 121.1E)

GSOD stations used (averaged):
  98429099999  Ninoy Aquino Intl AP  (14.508N 121.020E)
  98433099999  Ambulong              (13.767N 121.050E)

References:
  Wind MAX    : WMO No.8 CIMO Guide; PAGASA typhoon signal criteria
  Humidity MEAN: FAO Irrigation Paper No.56 (Allen et al., 1998)
"""

import json
import math
import statistics
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date

# ── Config ────────────────────────────────────────────────────────────────────
LAT, LON = 14.2, 121.1
START    = date(2025, 1, 1)
END      = date(2025, 5, 31)

TOL_RAIN = 10.0   # mm
TOL_TEMP = 3.0    # degC
TOL_WIND = 3.0    # m/s
TOL_HUM  = 10.0   # %RH

GSOD_STATIONS = ["98429099999", "98433099999"]
GSOD_API      = "https://www.ncei.noaa.gov/access/services/data/v1"
KNOTS_TO_MS   = 0.514444

# ── Binning ───────────────────────────────────────────────────────────────────
def bin_rain(mm):
    if mm is None: return None
    if mm < 1:   return "none"
    if mm < 10:  return "light"
    if mm < 25:  return "moderate"
    if mm < 75:  return "heavy"
    return "very_heavy"

def bin_temp(c):
    if c is None: return None
    if c < 24: return "cool"
    if c < 28: return "warm"
    if c < 32: return "hot"
    return "very_hot"

def bin_wind(ms):
    if ms is None: return None
    if ms < 3:  return "calm"
    if ms < 7:  return "light"
    if ms < 12: return "moderate"
    return "strong"

def bin_hum(pct):
    if pct is None: return None
    if pct < 60: return "dry"
    if pct < 75: return "moderate"
    if pct < 87: return "humid"
    return "saturated"

def wmo_category(code):
    if code is None: return None
    code = int(code)
    if code <= 1:  return "clear"
    if code <= 48: return "cloudy_fog"
    if code <= 67: return "rain"
    if code <= 82: return "heavy_showers"
    return "thunderstorm"

def dewpoint_to_rh(t_c, td_c):
    """Magnus formula: mean RH from mean temp and mean dew point."""
    if t_c is None or td_c is None:
        return None
    num = math.exp(17.625 * td_c / (243.04 + td_c))
    den = math.exp(17.625 * t_c  / (243.04 + t_c))
    return round(100 * num / den, 1)

# ── Labels ────────────────────────────────────────────────────────────────────
def agree_label(v):
    if v is None: return "n/a"
    if v < 0.00:  return "Poor"
    if v < 0.20:  return "Slight"
    if v < 0.40:  return "Fair"
    if v < 0.60:  return "Moderate"
    if v < 0.80:  return "Substantial"
    return "Almost Perfect"

# ── Fleiss' Kappa ─────────────────────────────────────────────────────────────
def fleiss_kappa(items):
    """items: list of {rater: category|None}. Multi-rater categorical agreement."""
    all_cats = sorted({v for item in items for v in item.values() if v is not None})
    if len(all_cats) < 2:
        return None
    valid = [[r for r in item.values() if r is not None] for item in items]
    valid = [r for r in valid if len(r) >= 2]
    if not valid:
        return None

    P_bar = sum(
        sum(c * (c - 1) for c in Counter(row).values()) / (len(row) * (len(row) - 1))
        for row in valid
    ) / len(valid)

    all_r   = [r for row in valid for r in row]
    total   = len(all_r)
    cnt     = Counter(all_r)
    P_e_bar = sum((cnt[c] / total) ** 2 for c in all_cats)

    if P_e_bar >= 1:
        return 1.0
    return round((P_bar - P_e_bar) / (1 - P_e_bar), 3)

# ── Krippendorff's Alpha (nominal) ───────────────────────────────────────────
def krippendorff_alpha_nominal(items):
    """items: list of {rater: category|None}."""
    o_agree = o_total = 0
    for item in items:
        vals = [v for v in item.values() if v is not None]
        for i in range(len(vals)):
            for j in range(i + 1, len(vals)):
                o_agree += (vals[i] == vals[j])
                o_total += 1
    if o_total == 0:
        return None
    D_o = 1 - o_agree / o_total
    all_v = [v for item in items for v in item.values() if v is not None]
    n     = len(all_v)
    if n < 2:
        return None
    cnt = Counter(all_v)
    D_e = 1 - sum((c / n) ** 2 for c in cnt.values())
    return None if D_e == 0 else round(1 - D_o / D_e, 3)

# ── HTTP helper ───────────────────────────────────────────────────────────────
def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
            else:
                print(f"  [WARN] {url[:80]} -> {e}")
    return None

# ── Data fetchers ─────────────────────────────────────────────────────────────
def fetch_nasa_power():
    params = urllib.parse.urlencode({
        "parameters": "PRECTOTCORR,T2M_MAX,WS10M_MAX,RH2M",
        "community":  "AG",
        "longitude":  LON, "latitude": LAT,
        "start":      START.strftime("%Y%m%d"),
        "end":        END.strftime("%Y%m%d"),
        "format":     "JSON",
    })
    data = fetch(f"https://power.larc.nasa.gov/api/temporal/daily/point?{params}")
    if not data:
        return {}
    props = data.get("properties", {}).get("parameter", {})
    rain  = props.get("PRECTOTCORR", {})
    tmax  = props.get("T2M_MAX", {})
    wind  = props.get("WS10M_MAX", {})
    hum   = props.get("RH2M", {})

    def _v(d, k):
        try:
            f = float(d.get(k, -9999))
            return None if f <= -999 else f
        except:
            return None

    out = {}
    for k in rain:
        d = f"{k[:4]}-{k[4:6]}-{k[6:8]}"
        out[d] = {
            "rain": _v(rain, k), "temp": _v(tmax, k),
            "wind": _v(wind, k), "hum":  _v(hum, k),
        }
    return out


def fetch_open_meteo(model=None):
    p = {
        "latitude": LAT, "longitude": LON,
        "start_date": START.isoformat(), "end_date": END.isoformat(),
        "daily": (
            "precipitation_sum,temperature_2m_max,"
            "windspeed_10m_max,relative_humidity_2m_mean,weathercode"
        ),
        "timezone":        "Asia/Manila",
        "wind_speed_unit": "ms",
    }
    if model:
        p["models"] = model
    data = fetch(f"https://archive-api.open-meteo.com/v1/archive?{urllib.parse.urlencode(p)}")
    if not data or "daily" not in data:
        return {}
    d = data["daily"]
    dates = d.get("time", [])
    return {
        dates[i]: {
            "rain":  d.get("precipitation_sum",        [None]*len(dates))[i],
            "temp":  d.get("temperature_2m_max",        [None]*len(dates))[i],
            "wind":  d.get("windspeed_10m_max",         [None]*len(dates))[i],
            "hum":   d.get("relative_humidity_2m_mean", [None]*len(dates))[i],
            "wcode": d.get("weathercode",               [None]*len(dates))[i],
        }
        for i in range(len(dates))
    }


def fetch_gsod():
    """
    Returns {date: {temp, wind, hum}} averaged across both stations.
    temp  = T2M_MAX equivalent (MAX field, degC)
    wind  = max sustained wind  (MXSPD, converted knots -> m/s)
    hum   = mean RH derived from TEMP + DEWP via Magnus formula
    """
    stations_str = ",".join(GSOD_STATIONS)
    params = urllib.parse.urlencode({
        "dataset":           "global-summary-of-the-day",
        "stations":          stations_str,
        "startDate":         START.isoformat(),
        "endDate":           END.isoformat(),
        "format":            "json",
        "includeAttributes": "false",
        "units":             "metric",
    })
    records = fetch(f"{GSOD_API}?{params}")
    if not records:
        return {}

    # Aggregate by date, average across stations
    by_date = {}
    for rec in records:
        d = rec.get("DATE", "")[:10]
        if not d:
            continue

        def _f(key, missing=9999.9):
            raw = rec.get(key, "")
            if isinstance(raw, str):
                raw = raw.replace("*", "").strip()
            try:
                v = float(raw)
                return None if v >= missing else v
            except:
                return None

        tmax = _f("MAX")
        temp = _f("TEMP")
        dewp = _f("DEWP")
        mxsp = _f("MXSPD")   # max sustained wind speed (knots with metric units)
        wdsp = _f("WDSP")    # mean wind speed (knots)

        # convert knots -> m/s for wind
        wind_ms = (mxsp * KNOTS_TO_MS) if mxsp is not None else (
                   wdsp * KNOTS_TO_MS  if wdsp is not None else None)

        rh = dewpoint_to_rh(temp, dewp)

        if d not in by_date:
            by_date[d] = {"temp": [], "wind": [], "hum": []}
        if tmax  is not None: by_date[d]["temp"].append(tmax)
        if wind_ms is not None: by_date[d]["wind"].append(wind_ms)
        if rh    is not None: by_date[d]["hum"].append(rh)

    out = {}
    for d, vals in by_date.items():
        out[d] = {
            "temp": round(statistics.mean(vals["temp"]), 2) if vals["temp"] else None,
            "wind": round(statistics.mean(vals["wind"]), 2) if vals["wind"] else None,
            "hum":  round(statistics.mean(vals["hum"]),  2) if vals["hum"]  else None,
        }
    return out

# ── Scoring ───────────────────────────────────────────────────────────────────
def score_factor(sot_vals, validators, tol, bin_fn, independent_sources):
    """
    Confidence metrics (per user specification):
      Continuous -> Fleiss' Kappa  (multi-rater, binned, independent sources only)
    Per-validator shows % days within tolerance of SoT (informational).
    """
    dates = sorted(sot_vals)
    per_validator = {}

    for name, vdata in validators.items():
        pairs = [(sot_vals[d], vdata[d])
                 for d in dates
                 if sot_vals.get(d) is not None and vdata.get(d) is not None]
        n      = len(pairs)
        within = sum(1 for a, b in pairs if abs(a - b) <= tol)
        per_validator[name] = {
            "n":       n,
            "pct_tol": round(within / n * 100, 1) if n else None,
        }

    # Fleiss' Kappa — independent sources only
    fleiss_items = []
    for d in dates:
        item = {name: bin_fn(src.get(d)) for name, src in independent_sources.items()}
        item = {k: v for k, v in item.items() if v is not None}
        if len(item) >= 2:
            fleiss_items.append(item)

    return {
        "per_validator": per_validator,
        "fleiss_kappa":  fleiss_kappa(fleiss_items),
        "n_items":       len(fleiss_items),
    }


def score_severe(sot_vals, validators, all_sources):
    """
    Confidence metric (per user specification):
      Nominal -> Krippendorff's Alpha  (nominal distance)
    Per-validator shows % exact category match with SoT (informational).
    """
    per_validator = {}
    for name, vdata in validators.items():
        pairs = [(sot_vals[d], vdata[d])
                 for d in sorted(sot_vals)
                 if sot_vals.get(d) is not None and vdata.get(d) is not None]
        n    = len(pairs)
        same = sum(1 for a, b in pairs if a == b)
        per_validator[name] = {
            "n":       n,
            "pct_tol": round(same / n * 100, 1) if n else None,
        }

    alpha_items = []
    for d in sorted(sot_vals):
        item = {name: src.get(d) for name, src in all_sources.items()}
        item = {k: v for k, v in item.items() if v is not None}
        if len(item) >= 2:
            alpha_items.append(item)

    return {
        "per_validator":      per_validator,
        "krippendorff_alpha": krippendorff_alpha_nominal(alpha_items),
        "n_items":            len(alpha_items),
    }

# ── Print helpers ─────────────────────────────────────────────────────────────
def _s(val, w=8, fallback="n/a"):
    return f"{(str(val) if val is not None else fallback):>{w}}"

INDEP_MARK  = "[I]"
FAMILY_MARK = "[F]"

def print_factor(label, nasa_r, om_r, all_val_names, ecmwf_names):
    W = 26
    print(f"\n{'='*82}")
    print(f"  {label}")
    print(f"  [I] = Independent   [F] = ECMWF family (reference only)")
    print(f"{'='*82}")
    print(f"  {'Validator':<{W}} {'Tag':^5}  {'NASA POWER AG (SoT)':^22}  {'Open-Meteo ERA5-L (SoT)':^22}")
    print(f"  {'':<{W}} {'':^5}  {'% within tol':>12} {'n':>5}    {'% within tol':>12} {'n':>5}")
    sep = '-' * W
    print(f"  {sep} {'-'*5}  {'-'*22}  {'-'*22}")

    for v in all_val_names:
        tag = FAMILY_MARK if v in ecmwf_names else INDEP_MARK
        nr  = (nasa_r or {}).get("per_validator", {}).get(v, {})
        or_ = (om_r   or {}).get("per_validator", {}).get(v, {})
        print(f"  {v:<{W}} {tag:^5}  "
              f"{_s(nr.get('pct_tol'),12)} {_s(nr.get('n'),5)}  "
              f"  {_s(or_.get('pct_tol'),12)} {_s(or_.get('n'),5)}")

    print(f"  {sep} {'-'*5}  {'-'*22}  {'-'*22}")
    nfk = (nasa_r or {}).get("fleiss_kappa")
    ofk = (om_r   or {}).get("fleiss_kappa")
    print(f"  {'Fleiss Kappa [I]':<{W}} {'':^5}  "
          f"{_s(nfk,12)} {agree_label(nfk):<9}  "
          f"  {_s(ofk,12)} {agree_label(ofk)}")

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print(f"\nDual SoT Confidence Test (Unbiased) - Laguna ({LAT}N, {LON}E)")
    print(f"Period: {START} to {END}  ({(END-START).days+1} days)")
    print(f"Independent validators: NOAA GSOD stations + UKMO + cross-SoT")
    print(f"ECMWF family (shown for reference): ERA5 Full, ECMWF IFS")
    print(f"\nFetching data...")

    print("  [1/6] NASA POWER AG  (PRECTOTCORR, T2M_MAX, WS10M_MAX, RH2M)...")
    nasa = fetch_nasa_power()
    time.sleep(2)

    print("  [2/6] Open-Meteo ERA5-Land...")
    om_era5l = fetch_open_meteo()
    time.sleep(3)

    print("  [3/6] Open-Meteo ERA5 Full  [ECMWF family]...")
    om_era5  = fetch_open_meteo("era5")
    time.sleep(3)

    print("  [4/6] Open-Meteo ECMWF IFS  [ECMWF family]...")
    om_ecmwf = fetch_open_meteo("ecmwf_ifs")
    time.sleep(3)

    print("  [5/6] Open-Meteo UKMO  [independent]...")
    om_ukmo  = fetch_open_meteo("ukmo_seamless")
    time.sleep(3)

    print("  [6/6] NOAA GSOD  (surface stations - ground truth)...")
    gsod = fetch_gsod()
    time.sleep(1)

    n_gsod = sum(1 for v in gsod.values() if v.get("temp") is not None)
    print(f"         GSOD: {len(gsod)} dates, {n_gsod} with temperature data")

    if len(gsod) < 10:
        print("\n  [WARN] GSOD returned very little data — check date range or station IDs.")

    print(f"\nAll data fetched. Computing...\n")

    def ns(key):      return {d: v[key] for d, v in nasa.items()    if v.get(key) is not None}
    def os(src, key): return {d: v[key] for d, v in src.items()     if v.get(key) is not None}
    def gs(key):      return {d: v[key] for d, v in gsod.items()    if v.get(key) is not None}

    ECMWF_NAMES = {"Open-Meteo ERA5 Full", "Open-Meteo ECMWF IFS"}

    # ── 1a. RAINFALL ──────────────────────────────────────────────────────────
    # No GSOD precipitation (GSOD PRCP is unreliable for daily convective rain)
    all_rain = {
        "NASA POWER AG":        ns("rain"),
        "Open-Meteo ERA5-Land": os(om_era5l, "rain"),
        "Open-Meteo ERA5 Full": os(om_era5,  "rain"),
        "Open-Meteo ECMWF IFS": os(om_ecmwf, "rain"),
        "Open-Meteo UKMO":      os(om_ukmo,  "rain"),
    }
    indep_rain_nasa = {  # when NASA is SoT: independent = ERA5-Land + UKMO
        "Open-Meteo ERA5-Land": all_rain["Open-Meteo ERA5-Land"],
        "Open-Meteo UKMO":      all_rain["Open-Meteo UKMO"],
    }
    indep_rain_om = {    # when ERA5-Land is SoT: independent = NASA + UKMO
        "NASA POWER AG":   all_rain["NASA POWER AG"],
        "Open-Meteo UKMO": all_rain["Open-Meteo UKMO"],
    }
    nasa_rain = score_factor(
        ns("rain"),
        {k: v for k, v in all_rain.items() if k != "NASA POWER AG"},
        TOL_RAIN, bin_rain, indep_rain_nasa,
    )
    om_rain = score_factor(
        os(om_era5l, "rain"),
        {k: v for k, v in all_rain.items() if k != "Open-Meteo ERA5-Land"},
        TOL_RAIN, bin_rain, indep_rain_om,
    )

    # ── 2. TEMPERATURE ────────────────────────────────────────────────────────
    all_temp = {
        "NASA POWER AG":        ns("temp"),
        "Open-Meteo ERA5-Land": os(om_era5l, "temp"),
        "Open-Meteo ERA5 Full": os(om_era5,  "temp"),
        "Open-Meteo ECMWF IFS": os(om_ecmwf, "temp"),
        "Open-Meteo UKMO":      os(om_ukmo,  "temp"),
        "NOAA GSOD (2 stn)":    gs("temp"),
    }
    indep_temp_nasa = {
        "Open-Meteo ERA5-Land": all_temp["Open-Meteo ERA5-Land"],
        "Open-Meteo UKMO":      all_temp["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)":    all_temp["NOAA GSOD (2 stn)"],
    }
    indep_temp_om = {
        "NASA POWER AG":     all_temp["NASA POWER AG"],
        "Open-Meteo UKMO":   all_temp["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)": all_temp["NOAA GSOD (2 stn)"],
    }
    nasa_temp = score_factor(
        ns("temp"),
        {k: v for k, v in all_temp.items() if k != "NASA POWER AG"},
        TOL_TEMP, bin_temp, indep_temp_nasa,
    )
    om_temp = score_factor(
        os(om_era5l, "temp"),
        {k: v for k, v in all_temp.items() if k != "Open-Meteo ERA5-Land"},
        TOL_TEMP, bin_temp, indep_temp_om,
    )

    # ── 3. WIND (max) ─────────────────────────────────────────────────────────
    all_wind = {
        "NASA POWER AG":        ns("wind"),
        "Open-Meteo ERA5-Land": os(om_era5l, "wind"),
        "Open-Meteo ERA5 Full": os(om_era5,  "wind"),
        "Open-Meteo ECMWF IFS": os(om_ecmwf, "wind"),
        "Open-Meteo UKMO":      os(om_ukmo,  "wind"),
        "NOAA GSOD (2 stn)":    gs("wind"),
    }
    indep_wind_nasa = {
        "Open-Meteo ERA5-Land": all_wind["Open-Meteo ERA5-Land"],
        "Open-Meteo UKMO":      all_wind["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)":    all_wind["NOAA GSOD (2 stn)"],
    }
    indep_wind_om = {
        "NASA POWER AG":     all_wind["NASA POWER AG"],
        "Open-Meteo UKMO":   all_wind["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)": all_wind["NOAA GSOD (2 stn)"],
    }
    nasa_wind = score_factor(
        ns("wind"),
        {k: v for k, v in all_wind.items() if k != "NASA POWER AG"},
        TOL_WIND, bin_wind, indep_wind_nasa,
    )
    om_wind = score_factor(
        os(om_era5l, "wind"),
        {k: v for k, v in all_wind.items() if k != "Open-Meteo ERA5-Land"},
        TOL_WIND, bin_wind, indep_wind_om,
    )

    # ── 4. HUMIDITY (mean) ────────────────────────────────────────────────────
    all_hum = {
        "NASA POWER AG":        ns("hum"),
        "Open-Meteo ERA5-Land": os(om_era5l, "hum"),
        "Open-Meteo ERA5 Full": os(om_era5,  "hum"),
        "Open-Meteo ECMWF IFS": os(om_ecmwf, "hum"),
        "Open-Meteo UKMO":      os(om_ukmo,  "hum"),
        "NOAA GSOD (2 stn)":    gs("hum"),
    }
    indep_hum_nasa = {
        "Open-Meteo ERA5-Land": all_hum["Open-Meteo ERA5-Land"],
        "Open-Meteo UKMO":      all_hum["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)":    all_hum["NOAA GSOD (2 stn)"],
    }
    indep_hum_om = {
        "NASA POWER AG":     all_hum["NASA POWER AG"],
        "Open-Meteo UKMO":   all_hum["Open-Meteo UKMO"],
        "NOAA GSOD (2 stn)": all_hum["NOAA GSOD (2 stn)"],
    }
    nasa_hum = score_factor(
        ns("hum"),
        {k: v for k, v in all_hum.items() if k != "NASA POWER AG"},
        TOL_HUM, bin_hum, indep_hum_nasa,
    )
    om_hum = score_factor(
        os(om_era5l, "hum"),
        {k: v for k, v in all_hum.items() if k != "Open-Meteo ERA5-Land"},
        TOL_HUM, bin_hum, indep_hum_om,
    )

    # ── 1b. SEVERE WEATHER ────────────────────────────────────────────────────
    sev_sot = {d: wmo_category(v.get("wcode")) for d, v in om_era5l.items() if v.get("wcode") is not None}
    all_sev = {
        "Open-Meteo ERA5-Land": sev_sot,
        "Open-Meteo ERA5 Full": {d: wmo_category(v.get("wcode")) for d, v in om_era5.items()  if v.get("wcode") is not None},
        "Open-Meteo ECMWF IFS": {d: wmo_category(v.get("wcode")) for d, v in om_ecmwf.items() if v.get("wcode") is not None},
        "Open-Meteo UKMO":      {d: wmo_category(v.get("wcode")) for d, v in om_ukmo.items()  if v.get("wcode") is not None},
    }
    sev_result = score_severe(
        sev_sot,
        {k: v for k, v in all_sev.items() if k != "Open-Meteo ERA5-Land"},
        all_sev,
    )

    # ── Print ─────────────────────────────────────────────────────────────────
    all_val_order = [
        "NOAA GSOD (2 stn)",
        "Open-Meteo UKMO",
        "Open-Meteo ERA5-Land",
        "NASA POWER AG",
        "Open-Meteo ERA5 Full",
        "Open-Meteo ECMWF IFS",
    ]

    print_factor(
        "1a. RAINFALL  (+/-10.0 mm | bins: none/light/moderate/heavy/very_heavy)"
        "\n  Note: No GSOD for rainfall; Fleiss Kappa uses ERA5-Land + UKMO or NASA + UKMO",
        nasa_rain, om_rain,
        [v for v in all_val_order if v in
         {"Open-Meteo ERA5-Land","NASA POWER AG","Open-Meteo ERA5 Full",
          "Open-Meteo ECMWF IFS","Open-Meteo UKMO"}],
        ECMWF_NAMES,
    )

    print_factor(
        "2. TEMPERATURE MAX  (+/-3.0 degC | bins: cool/warm/hot/very_hot)"
        "\n  NASA: T2M_MAX (MERRA-2) | OM: temperature_2m_max | GSOD: MAX field",
        nasa_temp, om_temp,
        [v for v in all_val_order if v in all_temp],
        ECMWF_NAMES,
    )

    print_factor(
        "3. WIND MAX  (+/-3.0 m/s | bins: calm/light/moderate/strong)"
        "\n  NASA: WS10M_MAX (MERRA-2) | OM: windspeed_10m_max | GSOD: MXSPD (knots->m/s)",
        nasa_wind, om_wind,
        [v for v in all_val_order if v in all_wind],
        ECMWF_NAMES,
    )

    print_factor(
        "4. HUMIDITY MEAN  (+/-10.0 %RH | bins: dry/moderate/humid/saturated)"
        "\n  NASA: RH2M (MERRA-2 mean) | OM: relative_humidity_2m_mean | GSOD: Magnus(TEMP,DEWP)",
        nasa_hum, om_hum,
        [v for v in all_val_order if v in all_hum],
        ECMWF_NAMES,
    )

    # Severe weather
    print(f"\n{'='*82}")
    print(f"  1b. SEVERE WEATHER  WMO category (Open-Meteo ERA5-Land SoT only)")
    print(f"  Metric: Krippendorff's Alpha (nominal distance) | {sev_result['n_items']} days")
    print(f"{'='*82}")
    print(f"  {'Validator':<26} {'Tag':^5}  {'% exact match w/SoT':>19}  {'n':>5}")
    print(f"  {'-'*26} {'-'*5}  {'-'*19}  {'-'*5}")
    for name, vr in sev_result["per_validator"].items():
        tag = FAMILY_MARK if name in ECMWF_NAMES else INDEP_MARK
        print(f"  {name:<26} {tag:^5}  {_s(vr.get('pct_tol'),19)}  {_s(vr.get('n'),5)}")
    ka = sev_result["krippendorff_alpha"]
    print(f"  {'-'*26} {'-'*5}  {'-'*19}  {'-'*5}")
    print(f"  {'Krippendorff Alpha':<26} {'':^5}  {_s(ka,19)}  ({agree_label(ka)})")

    # Summary
    print(f"\n{'='*82}")
    print(f"  SUMMARY")
    print(f"  Confidence: Fleiss' Kappa [I] (continuous) | Krippendorff's Alpha (nominal)")
    print(f"{'='*82}")
    print(f"  {'Factor':<22}  {'NASA FK [I]':>11}  {'OM FK [I]':>9}  "
          f"{'Strength (NASA)':>15}  {'Strength (OM)':>13}  {'Better SoT'}")
    print(f"  {'-'*22}  {'-'*11}  {'-'*9}  {'-'*15}  {'-'*13}  {'-'*11}")
    rows = [
        ("1a. Rainfall",   nasa_rain, om_rain),
        ("2. Temperature", nasa_temp, om_temp),
        ("3. Wind Max",    nasa_wind, om_wind),
        ("4. Humidity",    nasa_hum,  om_hum),
    ]
    for lbl, nr, or_ in rows:
        nfk = nr.get("fleiss_kappa") if nr else None
        ofk = or_.get("fleiss_kappa") if or_ else None
        winner = ("NASA POWER" if nfk is not None and ofk is not None and nfk >= ofk
                  else "Open-Meteo" if nfk is not None and ofk is not None else "n/a")
        print(f"  {lbl:<22}  {_s(nfk,11)}  {_s(ofk,9)}  "
              f"{agree_label(nfk):>15}  {agree_label(ofk):>13}  {winner}")
    ka = sev_result.get("krippendorff_alpha")
    print(f"  {'1b. Severe Weather':<22}  {'N/A (Kripp)':>11}  {_s(ka,9)}  "
          f"{'N/A':>15}  {agree_label(ka):>13}  Open-Meteo")
    print()


if __name__ == "__main__":
    main()
