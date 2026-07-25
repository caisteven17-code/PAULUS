"""Old (NASA SoT) vs new (ECMWF IFS SoT) temperature validation, on live data."""
import sys, time
sys.path.insert(0, ".")
from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import _validate_dimension, classify_temp, TEMP_AGREE_TOLERANCE_C

def fetch_all_temp_rows():
    rows, page_size, offset = [], 1000, 0
    cols = "nasa_power_temp_c,open_meteo_temp_c,era5_temp_c,ecmwf_ifs_temp_c,ukmo_temp_c"
    while True:
        for attempt in range(3):
            try:
                resp = get_table("reference", "weather_temperature_daily").select(cols).range(offset, offset+page_size-1).execute()
                break
            except Exception as e:
                print(f"  retry {attempt+1}: {e}"); time.sleep(2)
        else:
            raise RuntimeError("exhausted retries")
        batch = resp.data
        if not batch: break
        rows.extend(batch); offset += page_size
        if len(batch) < page_size: break
    return rows

def run_old_sot(row):
    return _validate_dimension(row.get("nasa_power_temp_c"), [
        ("Open-Meteo ERA5-Land", row.get("open_meteo_temp_c")),
        ("ERA5 (Full)", row.get("era5_temp_c")),
        ("ECMWF IFS", row.get("ecmwf_ifs_temp_c")),
        ("UKMO", row.get("ukmo_temp_c")),
    ], classify_temp, TEMP_AGREE_TOLERANCE_C, "°C")

def run_new_sot(row):
    return _validate_dimension(row.get("ecmwf_ifs_temp_c"), [
        ("NASA POWER AG", row.get("nasa_power_temp_c")),
        ("Open-Meteo ERA5-Land", row.get("open_meteo_temp_c")),
        ("ERA5 (Full)", row.get("era5_temp_c")),
        ("UKMO", row.get("ukmo_temp_c")),
    ], classify_temp, TEMP_AGREE_TOLERANCE_C, "°C", truth_name="ECMWF IFS")

def summarize(label, rows, run_fn):
    total = 0
    agreed_counts = {0:0,1:0,2:0,3:0,4:0}
    sources_agree_true = 0
    inconclusive = 0
    for row in rows:
        result = run_fn(row)
        if result is None: continue
        total += 1
        agreed_counts[result["validators_agreed"]] = agreed_counts.get(result["validators_agreed"],0)+1
        if result["sources_agree"]: sources_agree_true += 1
        if result["classification"] == "inconclusive": inconclusive += 1
    print(f"\n=== {label} ===")
    print(f"total scored rows: {total}")
    print(f"sources_agree=True: {sources_agree_true} ({100*sources_agree_true/total:.1f}%)")
    print(f"inconclusive: {inconclusive} ({100*inconclusive/total:.1f}%)")
    for k in sorted(agreed_counts):
        c = agreed_counts[k]
        print(f"  {k}/4 agree: {c:6d}  ({100*c/total:.1f}%)")
    return {"sources_agree_pct": 100*sources_agree_true/total, "inconclusive_pct": 100*inconclusive/total}

print("Fetching reference.weather_temperature_daily ...")
rows = fetch_all_temp_rows()
print(f"Fetched {len(rows)} rows")
old = summarize("OLD SoT = NASA POWER AG", rows, run_old_sot)
new = summarize("NEW SoT = ECMWF IFS", rows, run_new_sot)
print("\n=== Delta (new - old) ===")
print(f"sources_agree%: {new['sources_agree_pct']:.1f} vs {old['sources_agree_pct']:.1f}  ({new['sources_agree_pct']-old['sources_agree_pct']:+.1f} pts)")
print(f"inconclusive%:  {new['inconclusive_pct']:.1f} vs {old['inconclusive_pct']:.1f}  ({new['inconclusive_pct']-old['inconclusive_pct']:+.1f} pts)")
