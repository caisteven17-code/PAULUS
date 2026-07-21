"""
Does trimming each factor down to SoT + 2 validators (instead of the full
4-6 source set) raise or lower the mean Cohen's Kappa / Lin's CCC?
Trim choice: SoT + the 2 most genuinely distinct (non-duplicate-lineage)
remaining sources, since that's the only defensible way to pick 2 — picking
the 2 highest-scoring individual sources would just re-pick the ECMWF
duplicates and reinflate the number artificially.
"""
import sys, time
sys.path.insert(0, ".")
from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import (
    classify_rain, classify_temp, classify_humidity, classify_wind, SOURCE_LINEAGE,
)
from collections import Counter

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
    if n == 0: return None
    p_o = sum(1 for a,b in pairs if a==b)/n
    ra, rb = Counter(a for a,_ in pairs), Counter(b for _,b in pairs)
    cats = set(ra)|set(rb)
    p_e = sum((ra.get(c,0)/n)*(rb.get(c,0)/n) for c in cats)
    if p_e == 1: return 1.0 if p_o==1 else 0.0
    return round((p_o-p_e)/(1-p_e),4)

def lins_ccc(vals_a, vals_b):
    pairs = [(a,b) for a,b in zip(vals_a,vals_b) if a is not None and b is not None]
    n = len(pairs)
    if n < 2: return None
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = sum(xs)/n, sum(ys)/n
    vx = sum((x-mx)**2 for x in xs)/n
    vy = sum((y-my)**2 for y in ys)/n
    cov = sum((x-mx)*(y-my) for x,y in pairs)/n
    denom = vx+vy+(mx-my)**2
    return round(2*cov/denom,4) if denom else None

def report(factor, rows, col_map, classify_fn, sot, validators_full, validators_trim):
    names_full = [sot] + validators_full
    names_trim = [sot] + validators_trim
    cats = {n: [classify_fn(row.get(col_map[n])) for row in rows] for n in names_full} if classify_fn else None
    vals = {n: [row.get(col_map[n]) for row in rows] for n in names_full}

    def mean_metric(names, use_kappa):
        scores = []
        for i,a in enumerate(names):
            for b in names[i+1:]:
                v = cohens_kappa(cats[a],cats[b]) if use_kappa else lins_ccc(vals[a],vals[b])
                if v is not None: scores.append(v)
        return round(sum(scores)/len(scores),4) if scores else None

    full_k = mean_metric(names_full, True)
    trim_k = mean_metric(names_trim, True)
    full_c = mean_metric(names_full, False) if classify_fn else None
    trim_c = mean_metric(names_trim, False) if classify_fn else None

    print(f"\n{factor}")
    print(f"  Full set ({len(names_full)} sources: {', '.join(names_full)})")
    print(f"    mean kappa = {full_k:+.4f}" + (f"   mean CCC = {full_c:+.4f}" if full_c is not None else ""))
    print(f"  Trimmed (SoT + 2: {', '.join(names_trim)})")
    print(f"    mean kappa = {trim_k:+.4f}" + (f"   mean CCC = {trim_c:+.4f}" if trim_c is not None else ""))
    print(f"  Delta kappa: {trim_k-full_k:+.4f}" + (f"   Delta CCC: {trim_c-full_c:+.4f}" if full_c is not None else ""))

print("Fetching rainfall..."); rain_rows = fetch_all("reference","weather_rainfall_daily",
    ["nasa_power_rainfall_mm","chirps_rainfall_mm","open_meteo_rainfall_mm","gsmap_nrt_rainfall_mm","era5_rainfall_mm","ukmo_rainfall_mm"])
print("Fetching temperature..."); temp_rows = fetch_all("reference","weather_temperature_daily",
    ["nasa_power_temp_c","open_meteo_temp_c","era5_temp_c","ecmwf_ifs_temp_c","ukmo_temp_c"])
print("Fetching wind..."); wind_rows = fetch_all("reference","weather_wind_daily",
    ["nasa_power_wind_ms","open_meteo_wind_ms","era5_wind_ms","ecmwf_ifs_wind_ms","ukmo_wind_ms"])

report("RAINFALL (SoT=NASA POWER AG)", rain_rows, {
    "NASA POWER AG":"nasa_power_rainfall_mm","CHIRPS":"chirps_rainfall_mm","Open-Meteo ERA5-Land":"open_meteo_rainfall_mm",
    "GSMaP NRT":"gsmap_nrt_rainfall_mm","ERA5 (Full)":"era5_rainfall_mm","UKMO":"ukmo_rainfall_mm"}, classify_rain,
    "NASA POWER AG", ["CHIRPS","Open-Meteo ERA5-Land","GSMaP NRT","ERA5 (Full)","UKMO"], ["CHIRPS","UKMO"])

report("TEMPERATURE (SoT=ECMWF IFS)", temp_rows, {
    "NASA POWER AG":"nasa_power_temp_c","Open-Meteo ERA5-Land":"open_meteo_temp_c","ERA5 (Full)":"era5_temp_c",
    "ECMWF IFS":"ecmwf_ifs_temp_c","UKMO":"ukmo_temp_c"}, classify_temp,
    "ECMWF IFS", ["NASA POWER AG","Open-Meteo ERA5-Land","ERA5 (Full)","UKMO"], ["NASA POWER AG","UKMO"])

report("WIND (SoT=ECMWF IFS)", wind_rows, {
    "NASA POWER AG":"nasa_power_wind_ms","Open-Meteo ERA5-Land":"open_meteo_wind_ms","ERA5 (Full)":"era5_wind_ms",
    "ECMWF IFS":"ecmwf_ifs_wind_ms","UKMO":"ukmo_wind_ms"}, classify_wind,
    "ECMWF IFS", ["NASA POWER AG","Open-Meteo ERA5-Land","ERA5 (Full)","UKMO"], ["NASA POWER AG","UKMO"])
