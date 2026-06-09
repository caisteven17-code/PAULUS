"""
Weather Validation Module
==========================
Validates NASA POWER AG monthly values against NOAA GSOD (temperature) and
CHIRPS (rainfall) for individual Laguna municipalities.

Bulk approach (fast):
  - Fetch GSOD once for the full date range (3 station calls total)
  - Fetch CHIRPS once per municipality for the full date range (30 calls total)
  - Then do per-record comparison from the cached data

This replaces the naive per-record API call approach (1,080+ calls) with
3 + 30 = 33 calls total for a full 3-year run.
"""

from __future__ import annotations

import calendar
import json
import logging
import time
import urllib.parse
import urllib.request
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ── Tolerances ────────────────────────────────────────────────────────────────

TEMP_MAE_THRESHOLD = 2.0        # °C
RAIN_RELMAE_THRESHOLD = 0.30    # 30% relative MAE

# ── Meteostat (temperature reference) ─────────────────────────────────────────
# Uses Ninoy Aquino International Airport (WMO 98429) — nearest station to
# Laguna Province with reliable long-term actual ground station data.

METEOSTAT_STATION_ID = "98429"
METEOSTAT_STATION_NAME = "Ninoy Aquino Intl AP"


def build_meteostat_cache(start: date, end: date) -> dict[tuple[int, int], float]:
    """
    Fetch monthly temperature reference data from Meteostat (actual station observations).
    Uses Ninoy Aquino International Airport (WMO 98429), nearest reliable station to Laguna.
    Returns {(year, month): temp_avg_c}.
    """
    try:
        from meteostat import Station, monthly as meteostat_monthly
        from datetime import datetime as dt_class
        import math
    except ImportError:
        logger.warning("meteostat not installed -- run: pip install meteostat")
        return {}

    logger.info("Fetching Meteostat temperature from %s (%s to %s)...", METEOSTAT_STATION_NAME, start, end)

    try:
        station = Station(METEOSTAT_STATION_ID)
        start_dt = dt_class(start.year, start.month, 1)
        end_dt = dt_class(end.year, end.month, 1)
        data = meteostat_monthly(station, start_dt, end_dt).fetch()

        if data is None or len(data) == 0:
            logger.warning("Meteostat returned no data for station %s", METEOSTAT_STATION_ID)
            return {}

        cache: dict[tuple[int, int], float] = {}
        for idx, row in data.iterrows():
            temp = row.get("temp")
            if temp is not None:
                try:
                    val = float(temp)
                    if not math.isnan(val):
                        cache[(idx.year, idx.month)] = round(val, 2)
                except (TypeError, ValueError):
                    pass

        logger.info("Meteostat cache built: %d months (%s)", len(cache), METEOSTAT_STATION_NAME)
        return cache

    except Exception as exc:
        logger.warning("Meteostat fetch failed: %s", exc)
        return {}


# ── CHIRPS via ClimateSERV ────────────────────────────────────────────────────

CLIMATESERV_BASE = "https://climateserv.servirglobal.net/api"
CHIRPS_DATATYPE = 0     # CHIRPS precipitation
CHIRPS_INTERVALTYPE = 1  # monthly
CHIRPS_OPERATIONTYPE = 5  # average over geometry


def _bbox_geom(lat: float, lon: float, delta: float = 0.05) -> str:
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


def _chirps_submit_range(lat: float, lon: float, start: date, end: date) -> Optional[str]:
    """Submit a CHIRPS request for a full date range. Returns request ID or None."""
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


def _chirps_retrieve_range(request_id: str, max_wait: int = 120) -> dict[tuple[int, int], float]:
    """
    Poll ClimateSERV until CHIRPS request completes.
    Returns {(year, month): rainfall_mm}.
    """
    url = f"{CLIMATESERV_BASE}/getDataFromRequest/?id={request_id}"
    deadline = time.time() + max_wait

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                payload = json.loads(resp.read().decode())

            if isinstance(payload, list) and payload:
                payload = payload[0]

            status = str(payload.get("status", "")).lower()
            if "complete" in status or "data" in payload:
                # ClimateSERV returns daily records even for monthly interval type.
                # Each item has year/month/day and a raw_value for that day.
                # Sum daily raw_values per month to get monthly total rainfall.
                monthly_totals: dict[tuple[int, int], float] = {}
                for item in payload.get("data", []):
                    yr = item.get("year")
                    mo = item.get("month")
                    raw_val = item.get("raw_value")
                    # Fallback: parse from date string if year/month missing
                    if (yr is None or mo is None) and item.get("date"):
                        try:
                            from datetime import datetime as dt_class
                            dt = dt_class.strptime(item["date"], "%m/%d/%Y")
                            yr, mo = dt.year, dt.month
                        except ValueError:
                            continue
                    if yr is None or mo is None or raw_val is None:
                        continue
                    try:
                        monthly_totals[(int(yr), int(mo))] = (
                            monthly_totals.get((int(yr), int(mo)), 0.0) + float(raw_val)
                        )
                    except (TypeError, ValueError):
                        continue
                return {k: round(v, 2) for k, v in monthly_totals.items()}

            if "error" in status or "failed" in status:
                logger.warning("CHIRPS request %s errored", request_id)
                return {}

        except Exception as exc:
            logger.warning("CHIRPS poll error: %s", exc)
            return {}

        time.sleep(5)

    logger.warning("CHIRPS request %s timed out after %ds", request_id, max_wait)
    return {}


def build_chirps_cache(lat: float, lon: float, start: date, end: date) -> dict[tuple[int, int], float]:
    """
    Fetch CHIRPS monthly rainfall for a point over the full date range.
    Returns {(year, month): rainfall_mm}.
    Single request for the full date range.
    """
    request_id = _chirps_submit_range(lat, lon, start, end)
    if not request_id:
        return {}
    return _chirps_retrieve_range(request_id)


# ── Per-record validation using pre-fetched caches ────────────────────────────


def validate_month(
    muni_name: str,
    year: int,
    month: int,
    nasa_power_temp: Optional[float],
    nasa_power_rainfall: Optional[float],
    meteostat_cache: dict[tuple[int, int], float],
    chirps_cache: dict[tuple[int, int], float],
) -> dict:
    """
    Validate a municipality's monthly NASA POWER AG values against pre-fetched validator data.

    Returns a dict with:
      - comparison_result: "matched" or "mismatched" (None if no validators available)
      - mismatch_reason: human-readable explanation
      - validation_payload: JSONB with all comparison details
      - source_truth: "nasa_power_ag"
      - validator_sources: list of validators used
    """
    today = date.today()
    key = (year, month)

    payload: dict = {
        "municipality": muni_name,
        "year": year,
        "month": month,
        "nasa_power_ag": {
            "temp_avg_c": nasa_power_temp,
            "rainfall_mm": nasa_power_rainfall,
        },
        "validators": {},
        "comparisons": {},
    }

    # Skip future months — no reference data available yet
    if year > today.year or (year == today.year and month >= today.month):
        payload["note"] = "Future date — validation skipped"
        return {
            "comparison_result": None,
            "mismatch_reason": None,
            "validation_payload": payload,
            "source_truth": "nasa_power_ag",
            "validator_sources": [],
        }

    validator_sources = []
    mismatches = []

    # ── Temperature validation via Meteostat (Ninoy Aquino station) ──────────
    if nasa_power_temp is not None:
        meteostat_temp = meteostat_cache.get(key)
        if meteostat_temp is not None:
            validator_sources.append("meteostat")
            temp_diff = abs(nasa_power_temp - meteostat_temp)
            payload["validators"]["meteostat_temp_c"] = meteostat_temp
            payload["comparisons"]["temperature"] = {
                "nasa_power_ag_c": nasa_power_temp,
                "meteostat_c": meteostat_temp,
                "meteostat_station": METEOSTAT_STATION_NAME,
                "difference_c": round(temp_diff, 2),
                "threshold_c": TEMP_MAE_THRESHOLD,
                "passed": temp_diff <= TEMP_MAE_THRESHOLD,
            }
            if temp_diff > TEMP_MAE_THRESHOLD:
                mismatches.append(
                    f"Temperature mismatch: NASA POWER AG {nasa_power_temp}C vs Meteostat {meteostat_temp}C "
                    f"(diff {temp_diff:.1f}C, threshold {TEMP_MAE_THRESHOLD}C)."
                )

    # ── Rainfall validation via CHIRPS ────────────────────────────────────────
    if nasa_power_rainfall is not None:
        chirps_rain = chirps_cache.get(key)
        if chirps_rain is not None and chirps_rain > 0:
            validator_sources.append("chirps")
            rel_diff = abs(nasa_power_rainfall - chirps_rain) / chirps_rain
            payload["validators"]["chirps_rainfall_mm"] = chirps_rain
            payload["comparisons"]["rainfall"] = {
                "nasa_power_ag_mm": nasa_power_rainfall,
                "chirps_mm": chirps_rain,
                "difference_mm": round(abs(nasa_power_rainfall - chirps_rain), 2),
                "relative_difference": round(rel_diff, 3),
                "threshold_relative": RAIN_RELMAE_THRESHOLD,
                "passed": rel_diff <= RAIN_RELMAE_THRESHOLD,
            }
            if rel_diff > RAIN_RELMAE_THRESHOLD:
                mismatches.append(
                    f"Rainfall mismatch: NASA POWER AG {nasa_power_rainfall}mm vs CHIRPS {chirps_rain}mm "
                    f"(relative diff {rel_diff*100:.1f}%, threshold {RAIN_RELMAE_THRESHOLD*100:.0f}%)."
                )

    # ── Result ────────────────────────────────────────────────────────────────
    if not validator_sources:
        comparison_result = None
        mismatch_reason = None
        payload["note"] = "No validator data available for this month."
    elif mismatches:
        comparison_result = "mismatched"
        mismatch_reason = " ".join(mismatches)
    else:
        comparison_result = "matched"
        mismatch_reason = "Matched validator values within tolerance."

    payload["result"] = {
        "comparison_result": comparison_result,
        "mismatch_reason": mismatch_reason,
    }

    return {
        "comparison_result": comparison_result,
        "mismatch_reason": mismatch_reason,
        "validation_payload": payload,
        "source_truth": "nasa_power_ag",
        "validator_sources": validator_sources,
    }
