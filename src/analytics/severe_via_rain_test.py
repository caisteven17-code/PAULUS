"""
Test: does deriving severe-weather classification from RAINFALL AMOUNT
(which already has 6 validated sources) score better than the current
approach (trusting each model's own internal weathercode, which only has
3-4 sources, mostly non-independent)?
"""
import sys, time
sys.path.insert(0, ".")
from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import classify_severe, SOURCE_LINEAGE
from collections import Counter, defaultdict

def classify_severe_from_precip(mm):
    """PAGASA rainfall-intensity thresholds mapped onto the 5-category severe-weather scale."""
    if mm is None:
        return None
    v = float(mm)
    if v < 1.0: return "no_severe"
    if v < 25.0: return "light_weather"
    if v < 75.0: return "moderate_weather"
    if v < 150.0: return "severe_weather"
    return "extreme_weather"

def fetch_all(schema, table, cols):
    rows, page_size, offset = [], 1000, 0
    while True:
        for attempt in range(3):
            try:
                resp = get_table(schema, table).select(",".join(cols)).range(offset, offset+page_size-1).execute()
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

def cohens_kappa(cats_a, cats_b):
    pairs = [(a,b) for a,b in zip(cats_a,cats_b) if a is not None and b is not None]
    n = len(pairs)
    if n == 0: return None, 0
    p_o = sum(1 for a,b in pairs if a==b)/n
    ra, rb = Counter(a for a,_ in pairs), Counter(b for _,b in pairs)
    cats = set(ra)|set(rb)
    p_e = sum((ra.get(c,0)/n)*(rb.get(c,0)/n) for c in cats)
    if p_e == 1: return (1.0 if p_o==1 else 0.0), n
    return round((p_o-p_e)/(1-p_e),4), n

print("Fetching rainfall rows (rainfall_mm columns + weathercode columns)...")
rows = fetch_all("reference", "weather_rainfall_daily", [
    "nasa_power_rainfall_mm","chirps_rainfall_mm","open_meteo_rainfall_mm",
    "gsmap_nrt_rainfall_mm","era5_rainfall_mm","ukmo_rainfall_mm",
    "open_meteo_weathercode","era5_weathercode","ecmwf_ifs_weathercode",
])
print(f"  {len(rows)} rows")

rain_lineage = {
    "NASA POWER AG": "NASA", "CHIRPS": "CHIRPS", "Open-Meteo ERA5-Land": "ECMWF",
    "GSMaP NRT": "GSMaP", "ERA5 (Full)": "ECMWF", "UKMO": "UKMO",
}
rain_col_map = {
    "NASA POWER AG": "nasa_power_rainfall_mm", "CHIRPS": "chirps_rainfall_mm",
    "Open-Meteo ERA5-Land": "open_meteo_rainfall_mm", "GSMaP NRT": "gsmap_nrt_rainfall_mm",
    "ERA5 (Full)": "era5_rainfall_mm", "UKMO": "ukmo_rainfall_mm",
}

print("\n" + "="*90)
print("APPROACH A (current): severe weather classified from WEATHERCODE")
print("="*90)
wcode_col_map = {
    "Open-Meteo ERA5-Land": "open_meteo_weathercode", "ERA5 (Full)": "era5_weathercode",
    "ECMWF IFS": "ecmwf_ifs_weathercode",
}
wcode_cats = {n: [classify_severe(int(row[c])) if row.get(c) is not None else None for row in rows] for n,c in wcode_col_map.items()}
names = list(wcode_col_map.keys())
ks_all, ks_cross = [], []
for i,a in enumerate(names):
    for b in names[i+1:]:
        k,n = cohens_kappa(wcode_cats[a], wcode_cats[b])
        same = SOURCE_LINEAGE.get(a)==SOURCE_LINEAGE.get(b)
        print(f"  {a} <-> {b}: kappa={k:+.4f} (n={n}) [{'SAME lineage' if same else 'cross-lineage'}]")
        if k is not None:
            ks_all.append(k)
            if not same: ks_cross.append(k)
print(f"  mean (all pairs) = {sum(ks_all)/len(ks_all):+.4f}")
print(f"  mean (cross-lineage only) = {(sum(ks_cross)/len(ks_cross)) if ks_cross else 'N/A (no cross-lineage pair exists)'}")

print("\n" + "="*90)
print("APPROACH B (proposed): severe weather classified from RAINFALL AMOUNT")
print("="*90)
precip_cats = {n: [classify_severe_from_precip(row.get(c)) for row in rows] for n,c in rain_col_map.items()}
ks_all, ks_cross = [], []
for i,a in enumerate(names := list(rain_col_map.keys())):
    for b in names[i+1:]:
        k,n = cohens_kappa(precip_cats[a], precip_cats[b])
        same = rain_lineage.get(a)==rain_lineage.get(b)
        flag = 'SAME lineage' if same else 'cross-lineage'
        print(f"  {a} <-> {b}: kappa={k:+.4f} (n={n}) [{flag}]")
        if k is not None:
            ks_all.append(k)
            if not same: ks_cross.append(k)
print(f"  mean (all pairs) = {sum(ks_all)/len(ks_all):+.4f}")
print(f"  mean (cross-lineage only) = {sum(ks_cross)/len(ks_cross):+.4f}")

print("\n" + "="*90)
print("Category distribution check — does the rainfall-derived proxy actually fire all 5 categories?")
print("="*90)
for n in rain_col_map:
    print(f"  {n}: {dict(Counter(c for c in precip_cats[n] if c is not None))}")
