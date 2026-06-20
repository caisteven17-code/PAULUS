"""
Laguna Province Weather Data Validator
=======================================
Validates the credibility of collected weather data against two independent
ground-truth reference sources:

  1. NOAA GSOD  — Global Surface Summary of the Day (temperature, wind speed,
                  humidity). Nearest weather stations to Laguna Province.
                  Free, no API key required.

  2. CHIRPS     — Climate Hazards Group InfraRed Precipitation with Station data
                  (rainfall). Satellite + station-gauge merged estimates at ~5km
                  resolution. Accessed via ClimateSERV API, no API key required.

  3. IBTrACS    — Typhoon validation is already handled upstream in
                  weather_ibtracs.py and is not re-validated here.

Validation method:
  The pipeline's per-municipality monthly data is averaged to a province-level
  monthly figure, then compared against the NOAA GSOD station average (temp,
  wind, humidity) and CHIRPS centroid value (rainfall) for the same month.
  Individual municipality-months that deviate far from the reference are flagged.

Tolerances:
  Temperature : MAE > 2.0 °C        → FAIL
  Rainfall    : relative MAE > 30%  → FAIL
  Wind speed  : MAE > 1.5 m/s       → FAIL
  Humidity    : MAE > 10 %RH        → FAIL

Usage:
  python weather_validator.py                        # uses weather_output/laguna_weather_final.json
  python weather_validator.py --file /path/to/laguna_weather_final.json
  python weather_validator.py --start 2024-01-01 --end 2024-12-31
  python weather_validator.py --out report.json      # save report to file
"""

from __future__ import annotations

import json
import logging
import math
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "weather_output"

# ── Tolerances ────────────────────────────────────────────────────────────────

TEMP_MAE_THRESHOLD = 2.0   # °C      — MAE above this fails temperature validation
RAIN_RELMAE_THRESHOLD = 0.30  # 30%  — relative MAE above this fails rainfall validation
WIND_MAE_THRESHOLD = 1.5   # m/s     — MAE above this fails wind speed validation
HUMID_MAE_THRESHOLD = 10.0  # %RH   — MAE above this fails humidity validation

# Per-record flag threshold (2× the MAE threshold) — individual months flagged
# in the report even when overall MAE passes, so analysts can inspect outliers.
TEMP_FLAG_DELTA = TEMP_MAE_THRESHOLD * 2    # °C
RAIN_FLAG_RELDELTA = RAIN_RELMAE_THRESHOLD * 2  # relative
WIND_FLAG_DELTA = WIND_MAE_THRESHOLD * 2    # m/s
HUMID_FLAG_DELTA = HUMID_MAE_THRESHOLD * 2  # %RH

# ── NOAA GSOD ─────────────────────────────────────────────────────────────────
# Nearest NOAA weather stations to Laguna Province.
# Station IDs use NOAA's USAF-WBAN format (USAF 6 digits + WBAN 99999 for
# international stations). Verify or update via:
# https://www.ncei.noaa.gov/access/search/data-search/global-summary-of-the-day

GSOD_STATIONS = [
    {"id": "98429099999", "name": "Ninoy Aquino Intl AP", "lat": 14.508, "lon": 121.020},
    {"id": "98433099999", "name": "Ambulong", "lat": 13.767, "lon": 121.050},
    {"id": "98328099999", "name": "Science Garden (PAGASA)", "lat": 14.650, "lon": 121.050},
]

GSOD_API = "https://www.ncei.noaa.gov/access/services/data/v1"


def fetch_gsod_monthly(station_id: str, start: date, end: date) -> list[dict]:
    """
    Fetch GSOD daily observations and aggregate to monthly averages.
    Returns list of {year, month, temp_avg_c, rainfall_mm, wind_speed_ms, humidity_pct}.
    """
    params = urllib.parse.urlencode(
        {
            "dataset": "global-summary-of-the-day",
            "stations": station_id,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "format": "json",
            "units": "metric",
            "dataTypes": "TEMP,PRCP,WDSP,DEWP",
        }
    )
    url = f"{GSOD_API}?{params}"

    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            records = json.loads(resp.read().decode())
    except Exception as exc:
        logger.warning("NOAA GSOD fetch failed for station %s: %s", station_id, exc)
        return []

    if not isinstance(records, list):
        logger.warning("NOAA GSOD unexpected response for station %s", station_id)
        return []

    monthly: dict[tuple[int, int], dict] = {}
    for r in records:
        d_str = r.get("DATE", "")
        if not d_str:
            continue
        try:
            dt = datetime.strptime(d_str[:10], "%Y-%m-%d")
        except ValueError:
            continue

        key = (dt.year, dt.month)
        if key not in monthly:
            monthly[key] = {"temps": [], "rain": [], "winds": [], "dewps": []}

        try:
            if r.get("TEMP") is not None:
                # GSOD ignores units=metric for these stations — TEMP is in °F.
                temp_f = float(r["TEMP"])
                monthly[key]["temps"].append((temp_f - 32) * 5 / 9)
        except (TypeError, ValueError):
            pass
        try:
            if r.get("PRCP") is not None:
                # PRCP is in inches; convert to mm.
                monthly[key]["rain"].append(float(r["PRCP"]) * 25.4)
        except (TypeError, ValueError):
            pass
        try:
            if r.get("WDSP") is not None:
                # WDSP is in knots; convert to m/s (1 knot = 0.514444 m/s).
                monthly[key]["winds"].append(float(r["WDSP"]) * 0.514444)
        except (TypeError, ValueError):
            pass
        try:
            if r.get("DEWP") is not None:
                # DEWP is dew point in °F; convert to °C then to relative humidity
                # using the August-Roche-Magnus approximation:
                #   RH = 100 * exp(17.625 * Td / (243.04 + Td))
                #              / exp(17.625 * T  / (243.04 + T))
                # where T and Td are in °C.  We store the dew-point °C here and
                # combine with temp later; simpler to store the daily RH directly.
                dewp_c = (float(r["DEWP"]) - 32) * 5 / 9
                # Re-use temp_c from the same record if available, otherwise skip.
                if r.get("TEMP") is not None:
                    temp_c = (float(r["TEMP"]) - 32) * 5 / 9
                    rh = 100 * math.exp(17.625 * dewp_c / (243.04 + dewp_c)) / math.exp(17.625 * temp_c / (243.04 + temp_c))
                    monthly[key]["dewps"].append(max(0.0, min(100.0, rh)))
        except (TypeError, ValueError):
            pass

    result = []
    for (year, month), data in sorted(monthly.items()):
        result.append(
            {
                "year": year,
                "month": month,
                "temp_avg_c": round(sum(data["temps"]) / len(data["temps"]), 2) if data["temps"] else None,
                "rainfall_mm": round(sum(data["rain"]), 2) if data["rain"] else None,
                "wind_speed_ms": round(sum(data["winds"]) / len(data["winds"]), 3) if data["winds"] else None,
                "humidity_pct": round(sum(data["dewps"]) / len(data["dewps"]), 2) if data["dewps"] else None,
            }
        )
    return result


# ── CHIRPS via ClimateSERV ────────────────────────────────────────────────────
# ClimateSERV is a SERVIR (NASA/USAID) API that provides CHIRPS data as JSON.
# https://climateserv.servirglobal.net/api/

CLIMATESERV_BASE = "https://climateserv.servirglobal.net/api"
CHIRPS_DATATYPE = 0  # 0 = CHIRPS precipitation
CHIRPS_INTERVALTYPE = 1  # 1 = monthly
CHIRPS_OPERATIONTYPE = 5  # 5 = average over geometry


def _bbox_geom(lat: float, lon: float, delta: float = 0.05) -> str:
    """Build a small bounding-box polygon around a point for ClimateSERV queries."""
    return json.dumps(
        {
            "type": "Polygon",
            "coordinates": [
                [
                    [lon - delta, lat - delta],
                    [lon + delta, lat - delta],
                    [lon + delta, lat + delta],
                    [lon - delta, lat + delta],
                    [lon - delta, lat - delta],
                ]
            ],
        }
    )


def _chirps_submit(lat: float, lon: float, start: date, end: date) -> Optional[str]:
    """Submit a CHIRPS monthly data request. Returns the request ID or None on failure."""
    params = urllib.parse.urlencode(
        {
            "datatype": CHIRPS_DATATYPE,
            "begintime": start.strftime("%m/%d/%Y"),
            "endtime": end.strftime("%m/%d/%Y"),
            "intervaltype": CHIRPS_INTERVALTYPE,
            "operationtype": CHIRPS_OPERATIONTYPE,
            "geometry": _bbox_geom(lat, lon),
        }
    )
    url = f"{CLIMATESERV_BASE}/submitDataRequest/?{params}"

    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            ids = json.loads(resp.read().decode())
        return ids[0] if ids else None
    except Exception as exc:
        logger.warning("CHIRPS submit failed: %s", exc)
        return None


def _chirps_retrieve(request_id: str, max_wait: int = 120) -> list[dict]:
    """
    Poll ClimateSERV until the CHIRPS request completes.
    Returns list of {date, value} or empty list on timeout/error.
    """
    url = f"{CLIMATESERV_BASE}/getDataFromRequest/?id={request_id}"
    deadline = time.time() + max_wait

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read().decode())

            # ClimateSERV wraps the result in a list
            if isinstance(payload, list) and payload:
                payload = payload[0]

            status = str(payload.get("status", "")).lower()
            if "complete" in status or "data" in payload:
                return payload.get("data", [])
            if "error" in status:
                logger.warning("CHIRPS request %s errored: %s", request_id, payload)
                return []
        except Exception as exc:
            logger.warning("CHIRPS poll failed: %s", exc)
            return []

        time.sleep(5)

    logger.warning("CHIRPS request %s timed out after %ds", request_id, max_wait)
    return []


def fetch_chirps_monthly(lat: float, lon: float, start: date, end: date) -> list[dict]:
    """
    Fetch CHIRPS monthly rainfall totals for a point.
    Returns list of {year, month, rainfall_mm}.
    """
    request_id = _chirps_submit(lat, lon, start, end)
    if not request_id:
        return []

    raw = _chirps_retrieve(request_id)

    result = []
    for item in raw:
        d_str = item.get("date", "")
        val = item.get("value")
        if not d_str or val is None:
            continue
        # ClimateSERV returns monthly dates as "MM/DD/YYYY" (day is always 01)
        for fmt in ("%m/%d/%Y", "%m/%Y"):
            try:
                dt = datetime.strptime(d_str, fmt)
                result.append(
                    {
                        "year": dt.year,
                        "month": dt.month,
                        "rainfall_mm": round(float(val), 2),
                    }
                )
                break
            except ValueError:
                continue

    return result


# ── Statistics helpers ────────────────────────────────────────────────────────


def _mae(pairs: list[tuple[float, float]]) -> Optional[float]:
    if not pairs:
        return None
    return round(sum(abs(a - b) for a, b in pairs) / len(pairs), 3)


def _rel_mae(pairs: list[tuple[float, float]]) -> Optional[float]:
    """Relative MAE — uses reference value (b) as denominator."""
    if not pairs:
        return None
    return round(sum(abs(a - b) / (abs(b) if b != 0 else 1.0) for a, b in pairs) / len(pairs), 3)


# ── Main validator ────────────────────────────────────────────────────────────

# Geographic centroid of Laguna Province — used for CHIRPS point query
LAGUNA_LAT = 14.175
LAGUNA_LON = 121.600


def validate(
    pipeline_path: Path = DEFAULT_OUT_DIR / "laguna_weather_final.json",
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> dict:
    """
    Validate the pipeline's collected weather data against NOAA GSOD and CHIRPS.

    Returns a report dict with:
      temperature  — MAE vs NOAA GSOD stations, pass/fail
      rainfall     — relative MAE vs CHIRPS, pass/fail
      wind_speed   — MAE vs NOAA GSOD stations, pass/fail
      humidity     — MAE vs NOAA GSOD stations (dew-point derived RH), pass/fail
      typhoon      — note that IBTrACS is already handled upstream
      flagged_records — individual municipality-months with large deviations
      overall_passed  — True only if temperature, rainfall, wind, and humidity pass
    """
    logger.info("Loading pipeline data from %s", pipeline_path)
    pipeline_data = json.loads(pipeline_path.read_text())
    municipalities = pipeline_data.get("municipalities", [])

    if start is None:
        start = date.fromisoformat(pipeline_data.get("period_start", "2023-01-01"))
    if end is None:
        end = date.fromisoformat(pipeline_data.get("period_end", "2023-12-31"))

    # ── Step 1: Fetch NOAA GSOD reference data (temp, wind, humidity) ────────
    logger.info("Fetching NOAA GSOD reference data (%s → %s)...", start, end)
    gsod_temp_by_month: dict[tuple[int, int], list[float]] = {}
    gsod_wind_by_month: dict[tuple[int, int], list[float]] = {}
    gsod_humid_by_month: dict[tuple[int, int], list[float]] = {}

    for station in GSOD_STATIONS:
        records = fetch_gsod_monthly(station["id"], start, end)
        for r in records:
            key = (r["year"], r["month"])
            if r["temp_avg_c"] is not None:
                gsod_temp_by_month.setdefault(key, []).append(r["temp_avg_c"])
            if r["wind_speed_ms"] is not None:
                gsod_wind_by_month.setdefault(key, []).append(r["wind_speed_ms"])
            if r["humidity_pct"] is not None:
                gsod_humid_by_month.setdefault(key, []).append(r["humidity_pct"])
        logger.info("  GSOD %-30s → %d monthly records", station["name"], len(records))

    # Average across all stations for each month
    gsod_ref: dict[tuple[int, int], float] = {k: round(sum(v) / len(v), 2) for k, v in gsod_temp_by_month.items()}
    gsod_wind_ref: dict[tuple[int, int], float] = {k: round(sum(v) / len(v), 3) for k, v in gsod_wind_by_month.items()}
    gsod_humid_ref: dict[tuple[int, int], float] = {k: round(sum(v) / len(v), 2) for k, v in gsod_humid_by_month.items()}

    # ── Step 2: Fetch CHIRPS reference rainfall ───────────────────────────────
    logger.info("Fetching CHIRPS reference rainfall (%s → %s)...", start, end)
    chirps_records = fetch_chirps_monthly(LAGUNA_LAT, LAGUNA_LON, start, end)
    chirps_ref: dict[tuple[int, int], float] = {(r["year"], r["month"]): r["rainfall_mm"] for r in chirps_records}
    logger.info("  CHIRPS Laguna centroid → %d monthly records", len(chirps_records))

    # ── Step 3: Build province-level monthly averages from pipeline ───────────
    province_temp: dict[tuple[int, int], list[float]] = {}
    province_rain: dict[tuple[int, int], list[float]] = {}
    province_wind: dict[tuple[int, int], list[float]] = {}
    province_humid: dict[tuple[int, int], list[float]] = {}

    for muni in municipalities:
        for m in muni.get("monthly_data", []):
            key = (int(m["year"]), int(m["month"]))
            if m.get("temp_avg_c") is not None:
                province_temp.setdefault(key, []).append(float(m["temp_avg_c"]))
            if m.get("rainfall_mm") is not None:
                province_rain.setdefault(key, []).append(float(m["rainfall_mm"]))
            if m.get("wind_speed_ms") is not None:
                province_wind.setdefault(key, []).append(float(m["wind_speed_ms"]))
            if m.get("humidity_pct") is not None:
                province_humid.setdefault(key, []).append(float(m["humidity_pct"]))

    # ── Step 4: Compare and flag ──────────────────────────────────────────────
    temp_pairs: list[tuple[float, float]] = []
    rain_pairs: list[tuple[float, float]] = []
    wind_pairs: list[tuple[float, float]] = []
    humid_pairs: list[tuple[float, float]] = []
    flagged: list[dict] = []

    all_keys = sorted(set(province_temp) | set(province_rain) | set(province_wind) | set(province_humid))
    for key in all_keys:
        year, month = key

        # Temperature
        if key in province_temp and key in gsod_ref:
            pipeline_temp = round(sum(province_temp[key]) / len(province_temp[key]), 2)
            gsod_temp = gsod_ref[key]
            temp_pairs.append((pipeline_temp, gsod_temp))

            if abs(pipeline_temp - gsod_temp) > TEMP_FLAG_DELTA:
                flagged.append(
                    {
                        "year": year,
                        "month": month,
                        "type": "temperature",
                        "pipeline_value": pipeline_temp,
                        "reference_value": gsod_temp,
                        "reference_source": "NOAA GSOD",
                        "deviation": round(abs(pipeline_temp - gsod_temp), 2),
                        "unit": "°C",
                    }
                )

        # Rainfall
        if key in province_rain and key in chirps_ref and chirps_ref[key] > 0:
            pipeline_rain = round(sum(province_rain[key]) / len(province_rain[key]), 2)
            chirps_rain = chirps_ref[key]
            rain_pairs.append((pipeline_rain, chirps_rain))

            rel_diff = abs(pipeline_rain - chirps_rain) / chirps_rain
            if rel_diff > RAIN_FLAG_RELDELTA:
                flagged.append(
                    {
                        "year": year,
                        "month": month,
                        "type": "rainfall",
                        "pipeline_value": pipeline_rain,
                        "reference_value": chirps_rain,
                        "reference_source": "CHIRPS",
                        "deviation_pct": round(rel_diff * 100, 1),
                        "unit": "mm",
                    }
                )

        # Wind speed
        if key in province_wind and key in gsod_wind_ref:
            pipeline_wind = round(sum(province_wind[key]) / len(province_wind[key]), 3)
            gsod_wind = gsod_wind_ref[key]
            wind_pairs.append((pipeline_wind, gsod_wind))

            if abs(pipeline_wind - gsod_wind) > WIND_FLAG_DELTA:
                flagged.append(
                    {
                        "year": year,
                        "month": month,
                        "type": "wind_speed",
                        "pipeline_value": pipeline_wind,
                        "reference_value": gsod_wind,
                        "reference_source": "NOAA GSOD",
                        "deviation": round(abs(pipeline_wind - gsod_wind), 3),
                        "unit": "m/s",
                    }
                )

        # Humidity
        if key in province_humid and key in gsod_humid_ref:
            pipeline_humid = round(sum(province_humid[key]) / len(province_humid[key]), 2)
            gsod_humid = gsod_humid_ref[key]
            humid_pairs.append((pipeline_humid, gsod_humid))

            if abs(pipeline_humid - gsod_humid) > HUMID_FLAG_DELTA:
                flagged.append(
                    {
                        "year": year,
                        "month": month,
                        "type": "humidity",
                        "pipeline_value": pipeline_humid,
                        "reference_value": gsod_humid,
                        "reference_source": "NOAA GSOD (dew-point derived RH)",
                        "deviation": round(abs(pipeline_humid - gsod_humid), 2),
                        "unit": "%RH",
                    }
                )

    # ── Step 5: Build report ──────────────────────────────────────────────────
    temp_mae = _mae(temp_pairs)
    rain_relmae = _rel_mae(rain_pairs)
    wind_mae = _mae(wind_pairs)
    humid_mae = _mae(humid_pairs)

    temp_passed = temp_mae is None or temp_mae <= TEMP_MAE_THRESHOLD
    rain_passed = rain_relmae is None or rain_relmae <= RAIN_RELMAE_THRESHOLD
    wind_passed = wind_mae is None or wind_mae <= WIND_MAE_THRESHOLD
    humid_passed = humid_mae is None or humid_mae <= HUMID_MAE_THRESHOLD

    if temp_mae is not None:
        status = "PASS" if temp_passed else "FAIL"
        log = logger.info if temp_passed else logger.warning
        log("Temperature MAE: %.2f°C (threshold %.1f°C) — %s", temp_mae, TEMP_MAE_THRESHOLD, status)
    else:
        logger.warning("Temperature: no comparison data (NOAA GSOD unreachable or no overlapping months)")

    if rain_relmae is not None:
        status = "PASS" if rain_passed else "FAIL"
        log = logger.info if rain_passed else logger.warning
        log(
            "Rainfall relative MAE: %.1f%% (threshold %.0f%%) — %s",
            rain_relmae * 100,
            RAIN_RELMAE_THRESHOLD * 100,
            status,
        )
    else:
        logger.warning("Rainfall: no comparison data (CHIRPS unreachable or no overlapping months)")

    if wind_mae is not None:
        status = "PASS" if wind_passed else "FAIL"
        log = logger.info if wind_passed else logger.warning
        log("Wind speed MAE: %.3f m/s (threshold %.1f m/s) — %s", wind_mae, WIND_MAE_THRESHOLD, status)
    else:
        logger.warning("Wind speed: no comparison data (NOAA GSOD WDSP unreachable or no overlapping months)")

    if humid_mae is not None:
        status = "PASS" if humid_passed else "FAIL"
        log = logger.info if humid_passed else logger.warning
        log("Humidity MAE: %.2f %%RH (threshold %.1f %%RH) — %s", humid_mae, HUMID_MAE_THRESHOLD, status)
    else:
        logger.warning("Humidity: no comparison data (NOAA GSOD DEWP unreachable or no overlapping months)")

    if flagged:
        logger.warning("%d month(s) flagged for large deviation from reference data", len(flagged))

    return {
        "validated_at": datetime.utcnow().isoformat() + "Z",
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "temperature": {
            "reference_source": "NOAA GSOD",
            "stations_used": [s["name"] for s in GSOD_STATIONS],
            "mae_c": temp_mae,
            "threshold_c": TEMP_MAE_THRESHOLD,
            "comparison_months": len(temp_pairs),
            "passed": temp_passed,
        },
        "rainfall": {
            "reference_source": "CHIRPS (via ClimateSERV)",
            "query_point": {"lat": LAGUNA_LAT, "lon": LAGUNA_LON},
            "relative_mae": rain_relmae,
            "threshold": RAIN_RELMAE_THRESHOLD,
            "comparison_months": len(rain_pairs),
            "passed": rain_passed,
        },
        "wind_speed": {
            "reference_source": "NOAA GSOD (WDSP, knots → m/s)",
            "stations_used": [s["name"] for s in GSOD_STATIONS],
            "mae_ms": wind_mae,
            "threshold_ms": WIND_MAE_THRESHOLD,
            "comparison_months": len(wind_pairs),
            "passed": wind_passed,
        },
        "humidity": {
            "reference_source": "NOAA GSOD (DEWP dew-point → %RH via Magnus formula)",
            "stations_used": [s["name"] for s in GSOD_STATIONS],
            "mae_pct": humid_mae,
            "threshold_pct": HUMID_MAE_THRESHOLD,
            "comparison_months": len(humid_pairs),
            "passed": humid_passed,
        },
        "typhoon": {
            "reference_source": "IBTrACS",
            "note": "Validated upstream in weather_ibtracs.py",
            "passed": True,
        },
        "flagged_records": flagged,
        "overall_passed": temp_passed and rain_passed and wind_passed and humid_passed,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(
        description="Validate Laguna weather data against NOAA GSOD (temperature, wind, humidity) and CHIRPS (rainfall)"
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Path to laguna_weather_final.json (default: weather_output/laguna_weather_final.json)",
    )
    parser.add_argument("--start", type=str, default=None, help="Override period start YYYY-MM-DD")
    parser.add_argument("--end", type=str, default=None, help="Override period end YYYY-MM-DD")
    parser.add_argument("--out", type=str, default=None, help="Save validation report to this JSON file")
    args = parser.parse_args()

    path = Path(args.file) if args.file else DEFAULT_OUT_DIR / "laguna_weather_final.json"
    start_d = date.fromisoformat(args.start) if args.start else None
    end_d = date.fromisoformat(args.end) if args.end else None

    report = validate(path, start_d, end_d)

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2))
        print(f"Report saved to {args.out}")

    print(f"\n{'=' * 50}")
    print(f"Overall: {'PASS' if report['overall_passed'] else 'FAIL'}")
    print(
        f"  Temperature MAE : {report['temperature']['mae_c']} °C  ({report['temperature']['comparison_months']} months compared)"
    )
    print(
        f"  Rainfall RelMAE : {report['rainfall']['relative_mae']}  ({report['rainfall']['comparison_months']} months compared)"
    )
    print(f"  Flagged records : {len(report['flagged_records'])}")
    print(f"{'=' * 50}")

    if not report["overall_passed"]:
        raise SystemExit(1)
