"""
Ad-hoc diagnostic: re-run wind classification with the new SoT (ECMWF IFS)
vs. the old SoT (NASA POWER AG), on the same live reference.weather_wind_daily
data, to see what actually changes after the SoT reassignment.

Not part of the production pipeline — run directly with:
    python rerun_wind_confidence.py
"""
import sys
import time

sys.path.insert(0, ".")

from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import _validate_dimension, classify_wind, WIND_AGREE_TOLERANCE_MS


def fetch_all_wind_rows():
    rows = []
    page_size = 1000
    offset = 0
    cols = "date,municipality,nasa_power_wind_ms,open_meteo_wind_ms,era5_wind_ms,ecmwf_ifs_wind_ms,ukmo_wind_ms"
    while True:
        for attempt in range(3):
            try:
                resp = (
                    get_table("reference", "weather_wind_daily")
                    .select(cols)
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                break
            except Exception as e:
                print(f"  retry {attempt+1} after error: {e}")
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


def run_old_sot(row):
    """Pre-change behavior: NASA POWER AG is truth; Open-Meteo/ERA5/ECMWF/UKMO validate."""
    return _validate_dimension(
        row.get("nasa_power_wind_ms"),
        [
            ("Open-Meteo ERA5-Land", row.get("open_meteo_wind_ms")),
            ("ERA5 (Full)", row.get("era5_wind_ms")),
            ("ECMWF IFS", row.get("ecmwf_ifs_wind_ms")),
            ("UKMO", row.get("ukmo_wind_ms")),
        ],
        classify_wind,
        WIND_AGREE_TOLERANCE_MS,
        "m/s",
    )


def run_new_sot(row):
    """Post-change behavior: ECMWF IFS is truth; NASA/Open-Meteo/ERA5/UKMO validate."""
    return _validate_dimension(
        row.get("ecmwf_ifs_wind_ms"),
        [
            ("NASA POWER AG", row.get("nasa_power_wind_ms")),
            ("Open-Meteo ERA5-Land", row.get("open_meteo_wind_ms")),
            ("ERA5 (Full)", row.get("era5_wind_ms")),
            ("UKMO", row.get("ukmo_wind_ms")),
        ],
        classify_wind,
        WIND_AGREE_TOLERANCE_MS,
        "m/s",
        truth_name="ECMWF IFS",
    )


def summarize(label, rows, run_fn):
    total = 0
    agreed_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
    sources_agree_true = 0
    inconclusive = 0
    none_dimension = 0
    for row in rows:
        result = run_fn(row)
        if result is None:
            none_dimension += 1
            continue
        total += 1
        agreed_counts[result["validators_agreed"]] = agreed_counts.get(result["validators_agreed"], 0) + 1
        if result["sources_agree"]:
            sources_agree_true += 1
        if result["classification"] == "inconclusive":
            inconclusive += 1

    print(f"\n=== {label} ===")
    print(f"total scored rows: {total}  (no-data rows: {none_dimension})")
    print(f"sources_agree=True: {sources_agree_true} ({100*sources_agree_true/total:.1f}%)")
    print(f"inconclusive: {inconclusive} ({100*inconclusive/total:.1f}%)")
    print("validators_agreed distribution (out of 4):")
    for k in sorted(agreed_counts):
        c = agreed_counts[k]
        print(f"  {k}/4 agree: {c:6d}  ({100*c/total:.1f}%)")
    return {
        "total": total,
        "sources_agree_pct": 100 * sources_agree_true / total,
        "inconclusive_pct": 100 * inconclusive / total,
    }


if __name__ == "__main__":
    print("Fetching reference.weather_wind_daily ...")
    rows = fetch_all_wind_rows()
    print(f"Fetched {len(rows)} rows")

    old = summarize("OLD SoT = NASA POWER AG", rows, run_old_sot)
    new = summarize("NEW SoT = ECMWF IFS", rows, run_new_sot)

    print("\n=== Delta (new - old) ===")
    print(f"sources_agree%: {new['sources_agree_pct']:.1f} vs {old['sources_agree_pct']:.1f}  "
          f"({new['sources_agree_pct']-old['sources_agree_pct']:+.1f} pts)")
    print(f"inconclusive%:  {new['inconclusive_pct']:.1f} vs {old['inconclusive_pct']:.1f}  "
          f"({new['inconclusive_pct']-old['inconclusive_pct']:+.1f} pts)")


def per_validator_agreement(rows):
    """How often each individual validator's category/tolerance matches ECMWF IFS truth."""
    names = ["NASA POWER AG", "Open-Meteo ERA5-Land", "ERA5 (Full)", "UKMO"]
    cols = ["nasa_power_wind_ms", "open_meteo_wind_ms", "era5_wind_ms", "ukmo_wind_ms"]
    counts = {n: {"agree": 0, "total": 0} for n in names}
    for row in rows:
        truth = row.get("ecmwf_ifs_wind_ms")
        if truth is None:
            continue
        truth_cat = classify_wind(truth)
        for name, col in zip(names, cols):
            val = row.get(col)
            if val is None:
                continue
            cat = classify_wind(val)
            diff = abs(truth - val)
            counts[name]["total"] += 1
            if cat == truth_cat or diff <= WIND_AGREE_TOLERANCE_MS:
                counts[name]["agree"] += 1
    print("\n=== Per-validator agreement with ECMWF IFS (new SoT) ===")
    for n in names:
        c = counts[n]
        pct = 100 * c["agree"] / c["total"] if c["total"] else 0
        lineage = " [same ECMWF/ERA5 reanalysis lineage as truth]" if n in ("Open-Meteo ERA5-Land", "ERA5 (Full)") else " [genuinely independent org]"
        print(f"  {n:22s}: {c['agree']:6d}/{c['total']:6d}  ({pct:.1f}%){lineage}")


per_validator_agreement(rows)
