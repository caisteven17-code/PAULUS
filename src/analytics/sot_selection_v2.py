"""
Corrected SoT selection: for each candidate source S, compute kappa against
EACH OTHER LINEAGE GROUP (averaging within that group first, so a 3-member
group doesn't get triple-counted vs a singleton group), then average those
per-group numbers. This is the fix for the asymmetry in the first version.
"""
import sys, time
sys.path.insert(0, ".")
from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import (
    classify_rain, classify_temp, classify_humidity, classify_wind, classify_severe, SOURCE_LINEAGE,
)
from collections import Counter, defaultdict

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
    by_group = defaultdict(list)
    for n in names:
        by_group[SOURCE_LINEAGE.get(n, n)].append(n)

    print(f"\n{'='*90}\n{factor}\n{'='*90}")
    scores = []
    for s in names:
        own_group = SOURCE_LINEAGE.get(s, s)
        other_groups = [g for g in by_group if g != own_group]
        if not other_groups:
            print(f"  {s:22s} ({own_group:8s}): NO other lineage group to compare against")
            continue
        group_means = []
        detail = []
        for g in other_groups:
            ks = []
            for other in by_group[g]:
                k, n = cohens_kappa(cats[s], cats[other])
                if k is not None:
                    ks.append(k)
            if ks:
                gm = sum(ks)/len(ks)
                group_means.append(gm)
                detail.append(f"{g}={gm:+.3f}")
        overall = sum(group_means)/len(group_means) if group_means else None
        scores.append((overall, s))
        ov_str = f"{overall:+.4f}" if overall is not None else "n/a"
        print(f"  {s:22s} ({own_group:8s}): mean-of-group-means = {ov_str}   [{', '.join(detail)}]")

    scores = [s for s in scores if s[0] is not None]
    if scores:
        scores.sort(key=lambda t: -t[0])
        best = scores[0]
        print(f"\n  >>> RECOMMENDED SoT: {best[1]}  (mean-of-group-means kappa = {best[0]:+.4f})")
    else:
        print("\n  >>> NO valid SoT candidate.")

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
