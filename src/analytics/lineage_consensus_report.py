"""
Runs resolve_lineage_aware_consensus() against live reference.* data for
every weather factor and prints, per factor:
  1. sample raw values from each source
  2. the pairwise distance matrix (with same-lineage pairs flagged ineligible)
  3. the selected primary + validator pair
  4. the resulting consensus value (sample + summary stats)

Not part of the production pipeline — run directly with:
    python lineage_consensus_report.py
"""
import sys
import time

sys.path.insert(0, ".")

from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import resolve_lineage_aware_consensus, SOURCE_LINEAGE


def fetch_all(schema, table, cols):
    rows = []
    page_size = 1000
    offset = 0
    while True:
        for attempt in range(3):
            try:
                resp = (
                    get_table(schema, table)
                    .select(",".join(cols))
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


def report(title, rows, col_map, sample_n=5):
    print(f"\n{'='*100}\n{title}\n{'='*100}")

    print(f"\n1. Sample raw values (first {sample_n} rows):")
    for name, col in col_map.items():
        sample = [row.get(col) for row in rows[:sample_n]]
        print(f"   {name:22s} ({SOURCE_LINEAGE.get(name, '?'):8s} lineage): {sample}")

    result = resolve_lineage_aware_consensus(rows, col_map)

    print("\n2. Pairwise distance matrix (mean absolute difference):")
    for (a, b), d in result["distance_matrix"].items():
        if d is None:
            print(f"   {a} <-> {b}: no overlapping data")
        else:
            flag = "EXCLUDED (same lineage)" if d["same_lineage"] else "eligible"
            print(f"   {a:22s} <-> {b:22s}: distance={d['distance']:.4f}  n={d['n']:6d}  [{flag}]")

    print("\n3. Selected pair:")
    if result["selected_pair"] is None:
        print(f"   NONE — {result.get('note')}")
        print(f"   Dropped as outliers: {result['dropped_as_outliers']}")
        return
    sp = result["selected_pair"]
    print(f"   Primary API:   {sp['primary']}")
    print(f"   Validator API: {sp['validator']}")
    print(f"   Distance: {sp['distance']:.4f}  (n={sp['n']})")
    print(f"   Dropped as outliers: {result['dropped_as_outliers']}")

    cvals = [v for v in result["consensus_values"] if v is not None]
    print("\n4. Final consensus value:")
    print(f"   Sample (first {sample_n} rows): {result['consensus_values'][:sample_n]}")
    if cvals:
        print(f"   Resolved for {len(cvals)}/{len(rows)} rows; mean={sum(cvals)/len(cvals):.3f}, "
              f"min={min(cvals):.3f}, max={max(cvals):.3f}")


if __name__ == "__main__":
    print("Fetching rainfall rows...")
    rain_rows = fetch_all(
        "reference", "weather_rainfall_daily",
        ["nasa_power_rainfall_mm", "chirps_rainfall_mm", "open_meteo_rainfall_mm",
         "gsmap_nrt_rainfall_mm", "era5_rainfall_mm", "ukmo_rainfall_mm",
         "open_meteo_weathercode", "era5_weathercode", "ecmwf_ifs_weathercode"],
    )
    print(f"  {len(rain_rows)} rows")

    print("Fetching temperature rows...")
    temp_rows = fetch_all(
        "reference", "weather_temperature_daily",
        ["nasa_power_temp_c", "open_meteo_temp_c", "era5_temp_c", "ecmwf_ifs_temp_c", "ukmo_temp_c",
         "nasa_power_rh_pct", "open_meteo_rh_pct", "era5_rh_pct"],
    )
    print(f"  {len(temp_rows)} rows")

    print("Fetching wind rows...")
    wind_rows = fetch_all(
        "reference", "weather_wind_daily",
        ["nasa_power_wind_ms", "open_meteo_wind_ms", "era5_wind_ms", "ecmwf_ifs_wind_ms", "ukmo_wind_ms"],
    )
    print(f"  {len(wind_rows)} rows")

    report(
        "RAINFALL",
        rain_rows,
        {
            "NASA POWER AG": "nasa_power_rainfall_mm",
            "CHIRPS": "chirps_rainfall_mm",
            "Open-Meteo ERA5-Land": "open_meteo_rainfall_mm",
            "GSMaP NRT": "gsmap_nrt_rainfall_mm",
            "ERA5 (Full)": "era5_rainfall_mm",
            "UKMO": "ukmo_rainfall_mm",
        },
    )

    report(
        "SEVERE WEATHER (weathercode)",
        rain_rows,
        {
            "Open-Meteo ERA5-Land": "open_meteo_weathercode",
            "ERA5 (Full)": "era5_weathercode",
            "ECMWF IFS": "ecmwf_ifs_weathercode",
        },
    )

    report(
        "TEMPERATURE",
        temp_rows,
        {
            "NASA POWER AG": "nasa_power_temp_c",
            "Open-Meteo ERA5-Land": "open_meteo_temp_c",
            "ERA5 (Full)": "era5_temp_c",
            "ECMWF IFS": "ecmwf_ifs_temp_c",
            "UKMO": "ukmo_temp_c",
        },
    )

    report(
        "HUMIDITY",
        temp_rows,
        {
            "NASA POWER AG": "nasa_power_rh_pct",
            "Open-Meteo ERA5-Land": "open_meteo_rh_pct",
            "ERA5 (Full)": "era5_rh_pct",
        },
    )

    report(
        "WIND",
        wind_rows,
        {
            "NASA POWER AG": "nasa_power_wind_ms",
            "Open-Meteo ERA5-Land": "open_meteo_wind_ms",
            "ERA5 (Full)": "era5_wind_ms",
            "ECMWF IFS": "ecmwf_ifs_wind_ms",
            "UKMO": "ukmo_wind_ms",
        },
    )
