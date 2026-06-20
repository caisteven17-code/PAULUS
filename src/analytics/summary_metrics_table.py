import sys, time
sys.path.insert(0, ".")
from app.services.supabase_client import get_table
from app.services.weather_daily_classifier import classify_rain, classify_temp, classify_humidity, classify_wind, classify_severe
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
    if n == 0: return None, 0
    p_o = sum(1 for a,b in pairs if a==b)/n
    ra, rb = Counter(a for a,_ in pairs), Counter(b for _,b in pairs)
    cats = set(ra)|set(rb)
    p_e = sum((ra.get(c,0)/n)*(rb.get(c,0)/n) for c in cats)
    if p_e == 1: return (1.0 if p_o==1 else 0.0), n
    return round((p_o-p_e)/(1-p_e),4), n

def lins_ccc(vals_a, vals_b):
    pairs = [(a,b) for a,b in zip(vals_a,vals_b) if a is not None and b is not None]
    n = len(pairs)
    if n < 2: return None, n
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = sum(xs)/n, sum(ys)/n
    vx = sum((x-mx)**2 for x in xs)/n
    vy = sum((y-my)**2 for y in ys)/n
    cov = sum((x-mx)*(y-my) for x,y in pairs)/n
    denom = vx+vy+(mx-my)**2
    if denom == 0: return None, n
    return round(2*cov/denom,4), n

def fk_label(k):
    if k is None: return "n/a"
    if k < 0: return "poor"
    if k < 0.20: return "slight"
    if k < 0.40: return "fair"
    if k < 0.60: return "moderate"
    if k < 0.80: return "substantial"
    return "almost perfect"

def summarize(factor, rows, col_map, classify_fn):
    names = list(col_map.keys())
    cats = {n: [classify_fn(row.get(col_map[n])) for row in rows] for n in names}
    vals = {n: [row.get(col_map[n]) for row in rows] for n in names}
    kappas, cccs = [], []
    best_k = worst_k = best_c = worst_c = None
    for i,a in enumerate(names):
        for b in names[i+1:]:
            k,nk = cohens_kappa(cats[a], cats[b])
            c,nc = lins_ccc(vals[a], vals[b]) if classify_fn is not classify_severe else (None,0)
            if k is not None:
                kappas.append(k)
                if best_k is None or k > best_k[0]: best_k = (k,a,b)
                if worst_k is None or k < worst_k[0]: worst_k = (k,a,b)
            if c is not None:
                cccs.append(c)
                if best_c is None or c > best_c[0]: best_c = (c,a,b)
                if worst_c is None or c < worst_c[0]: worst_c = (c,a,b)
    mean_k = sum(kappas)/len(kappas) if kappas else None
    mean_c = sum(cccs)/len(cccs) if cccs else None
    print(f"\n{factor} (n_sources={len(names)}, n_rows={len(rows)})")
    print(f"  mean Cohen's Kappa = {mean_k:+.4f} ({fk_label(mean_k)})" if mean_k is not None else "  mean Cohen's Kappa = n/a")
    if best_k: print(f"    best pair:  {best_k[1]} <-> {best_k[2]}  kappa={best_k[0]:+.4f}")
    if worst_k: print(f"    worst pair: {worst_k[1]} <-> {worst_k[2]}  kappa={worst_k[0]:+.4f}")
    if mean_c is not None:
        print(f"  mean Lin's CCC     = {mean_c:+.4f}")
        print(f"    best pair:  {best_c[1]} <-> {best_c[2]}  CCC={best_c[0]:+.4f}")
        print(f"    worst pair: {worst_c[1]} <-> {worst_c[2]}  CCC={worst_c[0]:+.4f}")
    else:
        print("  mean Lin's CCC     = n/a (nominal weathercodes, not continuous)")
    return mean_k, mean_c

print("Fetching rainfall..."); rain_rows = fetch_all("reference","weather_rainfall_daily",
    ["nasa_power_rainfall_mm","chirps_rainfall_mm","open_meteo_rainfall_mm","gsmap_nrt_rainfall_mm","era5_rainfall_mm","ukmo_rainfall_mm",
     "open_meteo_weathercode","era5_weathercode","ecmwf_ifs_weathercode","jma_weathercode"])
print(f"  {len(rain_rows)} rows")
print("Fetching temperature..."); temp_rows = fetch_all("reference","weather_temperature_daily",
    ["nasa_power_temp_c","open_meteo_temp_c","era5_temp_c","ecmwf_ifs_temp_c","ukmo_temp_c","nasa_power_rh_pct","open_meteo_rh_pct","era5_rh_pct"])
print(f"  {len(temp_rows)} rows")
print("Fetching wind..."); wind_rows = fetch_all("reference","weather_wind_daily",
    ["nasa_power_wind_ms","open_meteo_wind_ms","era5_wind_ms","ecmwf_ifs_wind_ms","ukmo_wind_ms"])
print(f"  {len(wind_rows)} rows")

results = {}
results["Rainfall"] = summarize("RAINFALL", rain_rows, {
    "NASA POWER AG":"nasa_power_rainfall_mm","CHIRPS":"chirps_rainfall_mm","Open-Meteo ERA5-Land":"open_meteo_rainfall_mm",
    "GSMaP NRT":"gsmap_nrt_rainfall_mm","ERA5 (Full)":"era5_rainfall_mm","UKMO":"ukmo_rainfall_mm"}, classify_rain)

n_jma = sum(1 for r in rain_rows if r.get("jma_weathercode") is not None)
print(f"\n(jma_weathercode populated rows in live DB: {n_jma}/{len(rain_rows)})")
severe_cols = {"Open-Meteo ERA5-Land":"open_meteo_weathercode","ERA5 (Full)":"era5_weathercode","ECMWF IFS":"ecmwf_ifs_weathercode"}
if n_jma > 0:
    severe_cols["JMA"] = "jma_weathercode"
results["Severe weather"] = summarize("SEVERE WEATHER", rain_rows, severe_cols, classify_severe)

results["Temperature"] = summarize("TEMPERATURE", temp_rows, {
    "NASA POWER AG":"nasa_power_temp_c","Open-Meteo ERA5-Land":"open_meteo_temp_c","ERA5 (Full)":"era5_temp_c",
    "ECMWF IFS":"ecmwf_ifs_temp_c","UKMO":"ukmo_temp_c"}, classify_temp)

results["Humidity"] = summarize("HUMIDITY", temp_rows, {
    "NASA POWER AG":"nasa_power_rh_pct","Open-Meteo ERA5-Land":"open_meteo_rh_pct","ERA5 (Full)":"era5_rh_pct"}, classify_humidity)

results["Wind"] = summarize("WIND", wind_rows, {
    "NASA POWER AG":"nasa_power_wind_ms","Open-Meteo ERA5-Land":"open_meteo_wind_ms","ERA5 (Full)":"era5_wind_ms",
    "ECMWF IFS":"ecmwf_ifs_wind_ms","UKMO":"ukmo_wind_ms"}, classify_wind)

print("\n\n=== SUMMARY TABLE ===")
print(f"{'Factor':<18}{'Mean Kappa':<14}{'Mean CCC':<12}")
for factor, (k, c) in results.items():
    k_str = f"{k:+.4f}" if k is not None else "n/a"
    c_str = f"{c:+.4f}" if c is not None else "n/a"
    print(f"{factor:<18}{k_str:<14}{c_str:<12}")
