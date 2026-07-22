"""
Validates each weather-API source directly against real PAGASA station
observations (ground truth) for 2023-2024, across three PAGASA stations
near the Diocese of San Pablo service area:

  UPLB      (Los Baños, Laguna)    — reuses already-collected Supabase data
                                      for the "Los Baños" municipality, since
                                      UPLB sits inside that municipality; no
                                      fresh API calls needed.
  Ambulong  (Tanauan, Batangas)     — fetched fresh at the station's exact
                                      coordinates (not one of the 30 Laguna
                                      municipalities already collected).
  Tayabas   (Tayabas City, Quezon)  — fetched fresh, same reason as Ambulong.

GSMaP NRT is excluded from the comparison: every already-collected row has
NULL gsmap_nrt_rainfall_mm (the JAXA FTP fetch appears broken in this
environment), so there is nothing to compare it against.

PAGASA data use is governed by PAGASA's Terms and Conditions of Use for
Climatological Data (CADS-07 Rev.6) — condition 4 prohibits redistributing
any part of the data or publishing it anywhere, which includes committing
it to source control. This script reads the raw station CSVs from a
local-only directory (never copied into the repo) and prints/writes only
aggregate statistics, never the raw station values.

Usage:
  python pagasa_validation.py --data-dir "C:/path/to/folder/with/the/3/csvs"
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, ".")

from app.services.supabase_client import get_table  # noqa: E402
from app.services.weather_collector import (  # noqa: E402
    fetch_nasa_power_ag,
    fetch_open_meteo,
    fetch_open_meteo_ecmwf_ifs,
    fetch_open_meteo_era5,
    fetch_open_meteo_ukmo,
)
from app.services.weather_daily_classifier import (  # noqa: E402
    build_chirps_daily_cache,
    classify_humidity,
    classify_rain,
    classify_wind,
)

START = date(2023, 1, 1)
END = date(2024, 12, 31)
MISSING_SENTINEL = -999.0

# Philippine climate plausibility bounds (matches PH_TEMP_MIN/MAX in
# weather_collector.py) — guards against raw data-entry errors in the PAGASA
# export itself, e.g. UPLB 2023-02-07 has TMAX=308 (almost certainly a
# dropped decimal point for 30.8), which otherwise silently dominates any
# RMSE computed over that day.
PLAUSIBLE_TEMP_C = (15.0, 45.0)

STATIONS = {
    "UPLB": {"lat": 14.1798, "lon": 121.2234, "muni": "Los Baños", "has_rh": False, "fresh": False},
    "Ambulong": {"lat": 14.09008056, "lon": 121.0552444, "muni": None, "has_rh": True, "fresh": True},
    "Tayabas": {"lat": 14.018428, "lon": 121.596575, "muni": None, "has_rh": True, "fresh": True},
}


# ── PAGASA CSV parsing ────────────────────────────────────────────────────────


def _num(raw: str | None) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    v = float(raw)
    return None if v <= MISSING_SENTINEL else v


def load_pagasa_csv(path: Path, has_rh: bool) -> dict[str, dict]:
    """
    Parse a PAGASA daily CSV into {iso_date: {rainfall_mm, tmax_c, tmin_c, rh_pct, wind_ms}}.

    Column order is used positionally, not by header name — the UPLB export's
    header is corrupted (every 'T' was replaced with '-1': MON-1H, -1MAX,
    -1MIN, WIND_DIREC-1ION), so header-name lookup would silently break on
    that file. -999 = missing (per PAGASA's own README). -1 on RAINFALL
    specifically means "trace" (<0.1mm) and is treated as 0.0 here.
    """
    rows: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # header row (ignored — see docstring)
        for r in reader:
            if has_rh:
                year, month, day, rainfall, tmax, tmin, rh, wind, _wdir = r
            else:
                year, month, day, rainfall, tmax, tmin, wind, _wdir = r
                rh = None
            iso = f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
            rain_v = _num(rainfall)
            if rain_v is not None and rain_v == -1.0:
                rain_v = 0.0

            def _plausible_temp(v):
                if v is None:
                    return None
                lo, hi = PLAUSIBLE_TEMP_C
                if not (lo <= v <= hi):
                    print(f"    WARNING: implausible temp {v}°C at {path.name} {iso} — dropped (likely data-entry error)")
                    return None
                return v

            rows[iso] = {
                "rainfall_mm": rain_v,
                "tmax_c": _plausible_temp(_num(tmax)),
                "tmin_c": _plausible_temp(_num(tmin)),
                "rh_pct": _num(rh) if rh is not None else None,
                "wind_ms": _num(wind),
            }
    return rows


# ── Supabase pull (UPLB / Los Baños — already collected) ─────────────────────


def fetch_supabase_rows(schema: str, table: str, cols: list[str], municipality: str) -> list[dict]:
    rows: list[dict] = []
    page_size, offset = 1000, 0
    while True:
        for attempt in range(3):
            try:
                resp = (
                    get_table(schema, table)
                    .select(",".join(cols))
                    .eq("municipality", municipality)
                    .gte("date", START.isoformat())
                    .lte("date", END.isoformat())
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                break
            except Exception as e:  # noqa: BLE001
                print(f"    retry {attempt + 1}: {e}")
                time.sleep(2)
        else:
            raise RuntimeError("exhausted retries")
        batch = resp.data
        if not batch:
            break
        rows.extend(batch)
        offset += page_size
        if len(batch) < page_size:
            break
    return rows


def load_uplb_sources() -> dict[str, dict[str, dict]]:
    """Returns {'rainfall': {date: {src: val}}, 'temp': ..., 'humidity': ..., 'wind': ...}."""
    rain_rows = fetch_supabase_rows(
        "reference", "weather_rainfall_daily",
        ["date", "nasa_power_rainfall_mm", "chirps_rainfall_mm", "open_meteo_rainfall_mm",
         "era5_rainfall_mm", "ukmo_rainfall_mm"],
        "Los Baños",
    )
    temp_rows = fetch_supabase_rows(
        "reference", "weather_temperature_daily",
        ["date", "nasa_power_temp_c", "open_meteo_temp_c", "era5_temp_c",
         "ecmwf_ifs_temp_c", "ukmo_temp_c", "nasa_power_rh_pct", "open_meteo_rh_pct",
         "era5_rh_pct", "ukmo_rh_pct"],
        "Los Baños",
    )
    wind_rows = fetch_supabase_rows(
        "reference", "weather_wind_daily",
        ["date", "nasa_power_wind_ms", "open_meteo_wind_ms", "era5_wind_ms",
         "ecmwf_ifs_wind_ms", "ukmo_wind_ms"],
        "Los Baños",
    )

    rainfall = {r["date"]: {
        "nasa_power": r["nasa_power_rainfall_mm"], "chirps": r["chirps_rainfall_mm"],
        "open_meteo": r["open_meteo_rainfall_mm"], "era5": r["era5_rainfall_mm"],
        "ukmo": r["ukmo_rainfall_mm"],
    } for r in rain_rows}
    temp = {r["date"]: {
        "nasa_power": r["nasa_power_temp_c"], "open_meteo": r["open_meteo_temp_c"],
        "era5": r["era5_temp_c"], "ecmwf_ifs": r["ecmwf_ifs_temp_c"], "ukmo": r["ukmo_temp_c"],
    } for r in temp_rows}
    humidity = {r["date"]: {
        "nasa_power": r["nasa_power_rh_pct"], "open_meteo": r["open_meteo_rh_pct"],
        "era5": r["era5_rh_pct"], "ukmo": r["ukmo_rh_pct"],
    } for r in temp_rows}
    wind = {r["date"]: {
        "nasa_power": r["nasa_power_wind_ms"], "open_meteo": r["open_meteo_wind_ms"],
        "era5": r["era5_wind_ms"], "ecmwf_ifs": r["ecmwf_ifs_wind_ms"], "ukmo": r["ukmo_wind_ms"],
    } for r in wind_rows}
    return {"rainfall": rainfall, "temp": temp, "humidity": humidity, "wind": wind}


# ── Fresh fetch (Ambulong / Tayabas — not in the 30-municipality set) ────────


def load_fresh_sources(lat: float, lon: float, cache_path: Path, station_name: str) -> dict[str, dict[str, dict]]:
    cache: dict = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text())
    if station_name in cache:
        print(f"    (using cached fetch for {station_name})")
        return cache[station_name]

    print(f"    fetching NASA POWER AG for {station_name}...")
    nasa = fetch_nasa_power_ag(lat, lon, START, END)
    print(f"    fetching Open-Meteo ERA5-Land for {station_name}...")
    om = fetch_open_meteo(lat, lon, START, END)
    time.sleep(8.0)
    print(f"    fetching ERA5 (Full) for {station_name}...")
    era5 = fetch_open_meteo_era5(lat, lon, START, END)
    time.sleep(8.0)
    print(f"    fetching ECMWF IFS for {station_name}...")
    ecmwf = fetch_open_meteo_ecmwf_ifs(lat, lon, START, END)
    time.sleep(8.0)
    print(f"    fetching UKMO for {station_name}...")
    ukmo = fetch_open_meteo_ukmo(lat, lon, START, END)
    print(f"    fetching CHIRPS for {station_name}...")
    chirps = build_chirps_daily_cache(lat, lon, START, END)

    def _by_date(records):
        return {r["date"]: r for r in records}

    nasa_d, om_d, era5_d, ecmwf_d, ukmo_d = map(_by_date, (nasa, om, era5, ecmwf, ukmo))
    all_dates = set(nasa_d) | set(om_d) | set(era5_d) | set(ecmwf_d) | set(ukmo_d) | set(chirps)

    rainfall, temp, humidity, wind = {}, {}, {}, {}
    for d in all_dates:
        rainfall[d] = {
            "nasa_power": nasa_d.get(d, {}).get("rainfall_mm"),
            "chirps": chirps.get(d),
            "open_meteo": om_d.get(d, {}).get("rainfall_mm"),
            "era5": era5_d.get(d, {}).get("rainfall_mm"),
            "ukmo": ukmo_d.get(d, {}).get("rainfall_mm"),
        }
        temp[d] = {
            "nasa_power": nasa_d.get(d, {}).get("temp_max_c"),
            "open_meteo": om_d.get(d, {}).get("temp_max_c"),
            "era5": era5_d.get(d, {}).get("temp_max_c"),
            "ecmwf_ifs": ecmwf_d.get(d, {}).get("temp_max_c"),
            "ukmo": ukmo_d.get(d, {}).get("temp_max_c"),
        }
        humidity[d] = {
            "nasa_power": nasa_d.get(d, {}).get("rh_pct"),
            "open_meteo": om_d.get(d, {}).get("relativehumidity_pct"),
            "era5": era5_d.get(d, {}).get("relativehumidity_pct"),
            "ukmo": ukmo_d.get(d, {}).get("relativehumidity_pct"),
        }
        wind[d] = {
            "nasa_power": nasa_d.get(d, {}).get("wind_ms"),
            "open_meteo": om_d.get(d, {}).get("wind_ms"),
            "era5": era5_d.get(d, {}).get("wind_ms"),
            "ecmwf_ifs": ecmwf_d.get(d, {}).get("wind_ms"),
            "ukmo": ukmo_d.get(d, {}).get("wind_ms"),
        }

    result = {"rainfall": rainfall, "temp": temp, "humidity": humidity, "wind": wind}
    cache[station_name] = result
    cache_path.write_text(json.dumps(cache))
    return result


# ── Metrics ───────────────────────────────────────────────────────────────────


def mae_rmse_bias(pairs: list[tuple[float, float]]) -> tuple[float | None, float | None, float | None, int]:
    """pairs = [(ground_truth, source_value), ...]. Bias = mean(source - truth)."""
    n = len(pairs)
    if n == 0:
        return None, None, None, 0
    errors = [s - t for t, s in pairs]
    mae = sum(abs(e) for e in errors) / n
    rmse = (sum(e * e for e in errors) / n) ** 0.5
    bias = sum(errors) / n
    return round(mae, 3), round(rmse, 3), round(bias, 3), n


def cohens_kappa(cats_a: list, cats_b: list) -> tuple[float | None, int]:
    pairs = [(a, b) for a, b in zip(cats_a, cats_b) if a is not None and b is not None]
    n = len(pairs)
    if n == 0:
        return None, 0
    agree = sum(1 for a, b in pairs if a == b)
    p_o = agree / n
    ra, rb = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    cats = set(ra) | set(rb)
    p_e = sum((ra.get(c, 0) / n) * (rb.get(c, 0) / n) for c in cats)
    if p_e == 1:
        return (1.0 if p_o == 1 else 0.0), n
    return round((p_o - p_e) / (1 - p_e), 4), n


def evaluate_variable(
    title: str,
    ground_truth: dict[str, float | None],
    sources: dict[str, dict[str, dict]],
    classify_fn=None,
) -> list[dict]:
    """sources[date][source_name] = value. Returns per-source result rows, sorted best-first."""
    source_names = sorted({name for day in sources.values() for name in day})
    results = []
    for name in source_names:
        pairs = []
        for d, truth_v in ground_truth.items():
            if truth_v is None:
                continue
            src_v = sources.get(d, {}).get(name)
            if src_v is None:
                continue
            pairs.append((truth_v, src_v))
        mae, rmse, bias, n = mae_rmse_bias(pairs)

        kappa, agree_pct = None, None
        if classify_fn is not None and n > 0:
            truth_cats = [classify_fn(t) for t, _ in pairs]
            src_cats = [classify_fn(s) for _, s in pairs]
            kappa, _ = cohens_kappa(truth_cats, src_cats)
            agree_pct = round(
                100 * sum(1 for a, b in zip(truth_cats, src_cats) if a == b) / n, 1
            )

        results.append({
            "source": name, "n": n, "mae": mae, "rmse": rmse, "bias": bias,
            "kappa": kappa, "agree_pct": agree_pct,
        })

    results.sort(key=lambda r: (r["rmse"] is None, r["rmse"] if r["rmse"] is not None else 0))
    return results


def print_results(title: str, results: list[dict]) -> None:
    print(f"\n  {title}")
    print(f"  {'source':<14}{'n':>6}{'MAE':>10}{'RMSE':>10}{'bias':>10}{'kappa':>10}{'agree%':>9}")
    for r in results:
        def f(v):
            return f"{v:.3f}" if isinstance(v, float) else ("n/a" if v is None else str(v))
        print(
            f"  {r['source']:<14}{r['n']:>6}{f(r['mae']):>10}{f(r['rmse']):>10}"
            f"{f(r['bias']):>10}{f(r['kappa']):>10}{(f(r['agree_pct']) + '%' if r['agree_pct'] is not None else 'n/a'):>9}"
        )
    valid = [r for r in results if r["rmse"] is not None]
    if valid:
        print(f"  >>> closest to PAGASA (lowest RMSE): {valid[0]['source']}")


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    ap = argparse.ArgumentParser(description="Validate weather API sources against real PAGASA station data")
    ap.add_argument("--data-dir", required=True, help="Local folder containing the 3 PAGASA CSVs (never commit this path's contents)")
    args = ap.parse_args()
    data_dir = Path(args.data_dir)

    cache_path = data_dir / ".pagasa_fetch_cache.json"

    pagasa = {
        "UPLB": load_pagasa_csv(data_dir / "UPLB Daily Data.csv", has_rh=False),
        "Ambulong": load_pagasa_csv(data_dir / "Ambulong Daily Data.csv", has_rh=True),
        "Tayabas": load_pagasa_csv(data_dir / "Tayabas Daily Data.csv", has_rh=True),
    }

    api_sources: dict[str, dict] = {}
    for name, meta in STATIONS.items():
        print(f"Loading API sources for {name}...")
        if meta["fresh"]:
            api_sources[name] = load_fresh_sources(meta["lat"], meta["lon"], cache_path, name)
        else:
            api_sources[name] = load_uplb_sources()

    pooled = {"rainfall": {}, "temp": {}, "humidity": {}, "wind": {}}
    pooled_truth = {"rainfall": {}, "temp": {}, "humidity": {}, "wind": {}}

    for name in STATIONS:
        print(f"\n{'=' * 90}\nSTATION: {name}\n{'=' * 90}")
        truth = pagasa[name]
        srcs = api_sources[name]

        rain_truth = {d: v["rainfall_mm"] for d, v in truth.items()}
        temp_truth = {d: v["tmax_c"] for d, v in truth.items()}
        wind_truth = {d: v["wind_ms"] for d, v in truth.items()}
        rh_truth = {d: v["rh_pct"] for d, v in truth.items()}

        print_results("RAINFALL (mm/day)", evaluate_variable("rainfall", rain_truth, srcs["rainfall"], classify_rain))
        print_results("TEMPERATURE — TMAX (°C, raw)", evaluate_variable("temp", temp_truth, srcs["temp"], None))
        print_results("WIND (m/s)", evaluate_variable("wind", wind_truth, srcs["wind"], classify_wind))
        if any(v is not None for v in rh_truth.values()):
            print_results("HUMIDITY (RH %)", evaluate_variable("humidity", rh_truth, srcs["humidity"], classify_humidity))
        else:
            print("\n  HUMIDITY: no ground truth for this station (PAGASA export has no RH column)")

        for d, v in rain_truth.items():
            pooled_truth["rainfall"][f"{name}:{d}"] = v
        for d, v in temp_truth.items():
            pooled_truth["temp"][f"{name}:{d}"] = v
        for d, v in wind_truth.items():
            pooled_truth["wind"][f"{name}:{d}"] = v
        for d, v in rh_truth.items():
            pooled_truth["humidity"][f"{name}:{d}"] = v
        for d, s in srcs["rainfall"].items():
            pooled["rainfall"][f"{name}:{d}"] = s
        for d, s in srcs["temp"].items():
            pooled["temp"][f"{name}:{d}"] = s
        for d, s in srcs["wind"].items():
            pooled["wind"][f"{name}:{d}"] = s
        for d, s in srcs["humidity"].items():
            pooled["humidity"][f"{name}:{d}"] = s

    print(f"\n{'=' * 90}\nPOOLED ACROSS ALL 3 STATIONS\n{'=' * 90}")
    print_results("RAINFALL (mm/day)", evaluate_variable("rainfall", pooled_truth["rainfall"], pooled["rainfall"], classify_rain))
    print_results("TEMPERATURE — TMAX (°C, raw)", evaluate_variable("temp", pooled_truth["temp"], pooled["temp"], None))
    print_results("WIND (m/s)", evaluate_variable("wind", pooled_truth["wind"], pooled["wind"], classify_wind))
    print_results("HUMIDITY (RH %, Ambulong + Tayabas only)", evaluate_variable("humidity", pooled_truth["humidity"], pooled["humidity"], classify_humidity))


if __name__ == "__main__":
    main()
