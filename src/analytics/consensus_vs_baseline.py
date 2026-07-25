"""
Does the lineage-aware pairwise consensus actually raise Cohen's Kappa /
Lin's CCC, or does it just look better because the consensus is literally
derived from two of the sources it's then compared against?

For each factor: build the consensus value, classify it, then measure
agreement (kappa + CCC) between the consensus and EVERY individual source —
splitting the results into:
  - "inside the pair" (primary/validator) — agreement here is partly circular,
    since consensus = mean(primary, validator). Expect inflated numbers.
  - "dropped as outlier" — the real test. If kappa/CCC against these is NOT
    higher than the old all-pairs average, the consensus isn't actually
    better, it's just self-similar to the two sources that built it.

Also reports the OLD baseline: mean pairwise kappa/CCC across ALL source
pairs for the same factor (from confidence_matrix.py), for direct comparison.

Not part of the production pipeline — run directly with:
    python consensus_vs_baseline.py
"""
import sys
import time

sys.path.insert(0, ".")

from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import (
    resolve_lineage_aware_consensus, classify_rain, classify_temp,
    classify_humidity, classify_wind, classify_severe,
)
from collections import Counter


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


def cohens_kappa(cats_a, cats_b):
    pairs = [(a, b) for a, b in zip(cats_a, cats_b) if a is not None and b is not None]
    n = len(pairs)
    if n == 0:
        return None, 0
    agree = sum(1 for a, b in pairs if a == b)
    p_o = agree / n
    row_counts = Counter(a for a, _ in pairs)
    col_counts = Counter(b for _, b in pairs)
    cats = set(row_counts) | set(col_counts)
    p_e = sum((row_counts.get(c, 0) / n) * (col_counts.get(c, 0) / n) for c in cats)
    if p_e == 1:
        return (1.0 if p_o == 1 else 0.0), n
    return round((p_o - p_e) / (1 - p_e), 4), n


def lins_ccc(vals_a, vals_b):
    pairs = [(a, b) for a, b in zip(vals_a, vals_b) if a is not None and b is not None]
    n = len(pairs)
    if n < 2:
        return None, n
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    mx = sum(xs) / n
    my = sum(ys) / n
    var_x = sum((x - mx) ** 2 for x in xs) / n
    var_y = sum((y - my) ** 2 for y in ys) / n
    cov_xy = sum((x - mx) * (y - my) for x, y in pairs) / n
    denom = var_x + var_y + (mx - my) ** 2
    if denom == 0:
        return None, n
    return round(2 * cov_xy / denom, 4), n


def mean_pairwise_baseline(rows, col_map, classify_fn):
    """Old baseline: mean kappa/CCC across ALL pairs of original sources."""
    names = list(col_map.keys())
    cats = {n: [classify_fn(row.get(col_map[n])) for row in rows] for n in names}
    vals = {n: [row.get(col_map[n]) for row in rows] for n in names}
    kappas, cccs = [], []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            k, _ = cohens_kappa(cats[a], cats[b])
            c, _ = lins_ccc(vals[a], vals[b])
            if k is not None:
                kappas.append(k)
            if c is not None:
                cccs.append(c)
    return sum(kappas) / len(kappas), sum(cccs) / len(cccs)


def analyze(title, rows, col_map, classify_fn):
    print(f"\n{'='*100}\n{title}\n{'='*100}")

    result = resolve_lineage_aware_consensus(rows, col_map)
    if result["selected_pair"] is None:
        print("No eligible pair — consensus cannot be computed for this factor (skipping).")
        return

    sp = result["selected_pair"]
    consensus_vals = result["consensus_values"]
    consensus_cats = [classify_fn(v) for v in consensus_vals]

    old_mean_kappa, old_mean_ccc = mean_pairwise_baseline(rows, col_map, classify_fn)
    print(f"\nOLD baseline (mean across ALL {len(col_map)} sources' pairwise scores):")
    print(f"  mean Cohen's Kappa = {old_mean_kappa:+.4f}")
    print(f"  mean Lin's CCC     = {old_mean_ccc:+.4f}")

    print(f"\nNEW consensus = mean({sp['primary']}, {sp['validator']})")
    print(f"\n  Consensus vs. INSIDE-THE-PAIR sources (expect inflated — circular by construction):")
    for name in (sp["primary"], sp["validator"]):
        cats = [classify_fn(row.get(col_map[name])) for row in rows]
        vals = [row.get(col_map[name]) for row in rows]
        k, nk = cohens_kappa(consensus_cats, cats)
        c, nc = lins_ccc(consensus_vals, vals)
        print(f"    {name:22s}: kappa={k:+.4f} (n={nk})   CCC={c:+.4f} (n={nc})")

    print(f"\n  Consensus vs. DROPPED outlier sources (the real test):")
    dropped_kappas, dropped_cccs = [], []
    for name in result["dropped_as_outliers"]:
        cats = [classify_fn(row.get(col_map[name])) for row in rows]
        vals = [row.get(col_map[name]) for row in rows]
        k, nk = cohens_kappa(consensus_cats, cats)
        c, nc = lins_ccc(consensus_vals, vals)
        if k is not None:
            dropped_kappas.append(k)
        if c is not None:
            dropped_cccs.append(c)
        print(f"    {name:22s}: kappa={k:+.4f} (n={nk})   CCC={c:+.4f} (n={nc})")

    if dropped_kappas:
        new_mean_kappa = sum(dropped_kappas) / len(dropped_kappas)
        new_mean_ccc = sum(dropped_cccs) / len(dropped_cccs)
        print(f"\n  mean kappa vs dropped sources = {new_mean_kappa:+.4f}  "
              f"(old all-pairs baseline was {old_mean_kappa:+.4f}, "
              f"delta {new_mean_kappa - old_mean_kappa:+.4f})")
        print(f"  mean CCC   vs dropped sources = {new_mean_ccc:+.4f}  "
              f"(old all-pairs baseline was {old_mean_ccc:+.4f}, "
              f"delta {new_mean_ccc - old_mean_ccc:+.4f})")
    else:
        print("\n  (no dropped sources to compare — pair used all available sources)")


if __name__ == "__main__":
    print("Fetching rainfall rows...")
    rain_rows = fetch_all(
        "reference", "weather_rainfall_daily",
        ["nasa_power_rainfall_mm", "chirps_rainfall_mm", "open_meteo_rainfall_mm",
         "gsmap_nrt_rainfall_mm", "era5_rainfall_mm", "ukmo_rainfall_mm"],
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

    analyze(
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
        classify_rain,
    )

    analyze(
        "TEMPERATURE",
        temp_rows,
        {
            "NASA POWER AG": "nasa_power_temp_c",
            "Open-Meteo ERA5-Land": "open_meteo_temp_c",
            "ERA5 (Full)": "era5_temp_c",
            "ECMWF IFS": "ecmwf_ifs_temp_c",
            "UKMO": "ukmo_temp_c",
        },
        classify_temp,
    )

    analyze(
        "HUMIDITY",
        temp_rows,
        {
            "NASA POWER AG": "nasa_power_rh_pct",
            "Open-Meteo ERA5-Land": "open_meteo_rh_pct",
            "ERA5 (Full)": "era5_rh_pct",
        },
        classify_humidity,
    )

    analyze(
        "WIND",
        wind_rows,
        {
            "NASA POWER AG": "nasa_power_wind_ms",
            "Open-Meteo ERA5-Land": "open_meteo_wind_ms",
            "ERA5 (Full)": "era5_wind_ms",
            "ECMWF IFS": "ecmwf_ifs_wind_ms",
            "UKMO": "ukmo_wind_ms",
        },
        classify_wind,
    )
