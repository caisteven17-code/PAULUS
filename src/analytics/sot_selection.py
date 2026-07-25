"""
SoT selection method: for each factor, rank every candidate source by its
mean Cohen's Kappa against ONLY the sources outside its own lineage group.
This is the fix for the trap we kept hitting all session: picking SoT by raw
average kappa rewards whichever source has the most same-lineage duplicates
inflating its score. Cross-lineage-only mean kappa can't be inflated that way.
"""
import sys, time
sys.path.insert(0, ".")
from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import (
    classify_rain, classify_temp, classify_humidity, classify_wind, classify_severe, SOURCE_LINEAGE,
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
    if n == 0: return None, 0
    p_o = sum(1 for a,b in pairs if a==b)/n
    ra, rb = Counter(a for a,_ in pairs), Counter(b for _,b in pairs)
    cats = set(ra)|set(rb)
    p_e = sum((ra.get(c,0)/n)*(rb.get(c,0)/n) for c in cats)
    if p_e == 1: return (1.0 if p_o==1 else 0.0), n
    return round((p_o-p_e)/(1-p_e),4), n

def rank_sot_candidates(factor, rows, col_map, classify_fn):
    names = list(col_map.keys())
    cats = {n: [classify_fn(row.get(col_map[n])) for row in rows] for n in names}
    print(f"\n{'='*90}\n{factor}\n{'='*90}")
    scores = []
    for s in names:
        cross = [other for other in names if other != s and SOURCE_LINEAGE.get(other) != SOURCE_LINEAGE.get(s)]
        if not cross:
            print(f"  {s:22s} ({SOURCE_LINEAGE.get(s,'?'):8s}): NO cross-lineage comparison possible (everything else shares its lineage)")
            continue
        ks = []
        for other in cross:
            k, n = cohens_kappa(cats[s], cats[other])
            if k is not None:
                ks.append(k)
        mean_k = sum(ks)/len(ks) if ks else None
        scores.append((mean_k, s, cross))
        mk_str = f"{mean_k:+.4f}" if mean_k is not None else "n/a"
        print(f"  {s:22s} ({SOURCE_LINEAGE.get(s,'?'):8s}): mean kappa vs {len(cross)} cross-lineage source(s) = {mk_str}  [{', '.join(cross)}]")

    scores = [s for s in scores if s[0] is not None]
    if scores:
        scores.sort(key=lambda t: -t[0])
        best = scores[0]
        print(f"\n  >>> RECOMMENDED SoT: {best[1]}  (mean cross-lineage kappa = {best[0]:+.4f})")
    else:
        print("\n  >>> NO valid SoT candidate — no cross-lineage comparisons exist for any source.")

print("Fetching rainfall..."); rain_rows = fetch_all("reference","weather_rainfall_daily",
    ["nasa_power_rainfall_mm","chirps_rainfall_mm","open_meteo_rainfall_mm","gsmap_nrt_rainfall_mm","era5_rainfall_mm","ukmo_rainfall_mm",
     "open_meteo_weathercode","era5_weathercode","ecmwf_ifs_weathercode"])
print("Fetching temperature..."); temp_rows = fetch_all("reference","weather_temperature_daily",
    ["nasa_power_temp_c","open_meteo_temp_c","era5_temp_c","ecmwf_ifs_temp_c","ukmo_temp_c","nasa_power_rh_pct","open_meteo_rh_pct","era5_rh_pct"])
print("Fetching wind..."); wind_rows = fetch_all("reference","weather_wind_daily",
    ["nasa_power_wind_ms","open_meteo_wind_ms","era5_wind_ms","ecmwf_ifs_wind_ms","ukmo_wind_ms"])

rank_sot_candidates("RAINFALL", rain_rows, {
    "NASA POWER AG":"nasa_power_rainfall_mm","CHIRPS":"chirps_rainfall_mm","Open-Meteo ERA5-Land":"open_meteo_rainfall_mm",
    "GSMaP NRT":"gsmap_nrt_rainfall_mm","ERA5 (Full)":"era5_rainfall_mm","UKMO":"ukmo_rainfall_mm"}, classify_rain)

rank_sot_candidates("SEVERE WEATHER", rain_rows, {
    "Open-Meteo ERA5-Land":"open_meteo_weathercode","ERA5 (Full)":"era5_weathercode","ECMWF IFS":"ecmwf_ifs_weathercode"}, classify_severe)

rank_sot_candidates("TEMPERATURE", temp_rows, {
    "NASA POWER AG":"nasa_power_temp_c","Open-Meteo ERA5-Land":"open_meteo_temp_c","ERA5 (Full)":"era5_temp_c",
    "ECMWF IFS":"ecmwf_ifs_temp_c","UKMO":"ukmo_temp_c"}, classify_temp)

rank_sot_candidates("HUMIDITY", temp_rows, {
    "NASA POWER AG":"nasa_power_rh_pct","Open-Meteo ERA5-Land":"open_meteo_rh_pct","ERA5 (Full)":"era5_rh_pct"}, classify_humidity)

rank_sot_candidates("WIND", wind_rows, {
    "NASA POWER AG":"nasa_power_wind_ms","Open-Meteo ERA5-Land":"open_meteo_wind_ms","ERA5 (Full)":"era5_wind_ms",
    "ECMWF IFS":"ecmwf_ifs_wind_ms","UKMO":"ukmo_wind_ms"}, classify_wind)
