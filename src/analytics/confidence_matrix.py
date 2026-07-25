"""
Ad-hoc diagnostic: pairwise Cohen's Kappa confidence matrix for every weather
factor (rainfall, temperature, humidity, wind, severe weather), computed
directly against live reference.* data.

Not part of the production pipeline — run directly with:
    python confidence_matrix.py
"""
import sys
import time
from collections import Counter

sys.path.insert(0, ".")

from app.services.weather_repository import get_table
from app.services.weather_daily_classifier import (
    classify_rain, classify_temp, classify_humidity, classify_wind, classify_severe,
)


def classify_severe_from_precip(mm: object) -> object:
    """
    Proxy severe-weather classifier based on daily precipitation (mm).
    Maps PAGASA rainfall intensity thresholds to the same 5-category scale
    used by classify_severe() on WMO weathercodes.  Used when a source
    (e.g. NASA POWER AG / MERRA-2) provides rainfall but not a weathercode,
    giving a genuinely independent cross-lineage severe-weather signal.

    Thresholds (PAGASA operational criteria, mm/day):
      no_severe        < 1     trace / no rain
      light_weather    1–25    light to moderate rain
      moderate_weather 25–75   heavy rain
      severe_weather   75–150  intense rain (PAGASA warning level 1–2)
      extreme_weather  ≥ 150   torrential / typhoon-level
    """
    if mm is None:
        return None
    v = float(mm)
    if v < 1.0:
        return "no_severe"
    if v < 25.0:
        return "light_weather"
    if v < 75.0:
        return "moderate_weather"
    if v < 150.0:
        return "severe_weather"
    return "extreme_weather"


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
    """Pairwise Cohen's Kappa over rows where both categories are non-null."""
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
    kappa = (p_o - p_e) / (1 - p_e)
    return round(kappa, 4), n


def lins_ccc(vals_a, vals_b):
    """Lin's Concordance Correlation Coefficient over rows where both are non-null."""
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


def ccc_strength(c):
    if c is None:
        return "n/a"
    if c < 0.90:
        return "poor"
    if c < 0.95:
        return "moderate"
    if c < 0.99:
        return "substantial"
    return "almost perfect"


def strength(k):
    if k is None:
        return "n/a"
    if k < 0:
        return "poor"
    if k < 0.20:
        return "slight"
    if k < 0.40:
        return "fair"
    if k < 0.60:
        return "moderate"
    if k < 0.80:
        return "substantial"
    return "almost perfect"


def print_matrix(title, col_map, raw_rows, classify_fn):
    """col_map: {display_name: column_name}. Builds an NxN kappa matrix."""
    names = list(col_map.keys())
    cats = {name: [classify_fn(row.get(col_map[name])) for row in raw_rows] for name in names}

    print(f"\n{'='*100}\n{title}\n{'='*100}")
    header = " " * 24 + "".join(f"{n[:20]:>22s}" for n in names)
    print(header)
    for a in names:
        line = f"{a[:22]:24s}"
        for b in names:
            if a == b:
                line += f"{'—':>22s}"
            else:
                k, n = cohens_kappa(cats[a], cats[b])
                line += f"{(f'{k:+.3f} (n={n})' if k is not None else 'n/a'):>22s}"
        print(line)

    print("\nBest pair (highest kappa):")
    best = None
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            k, n = cohens_kappa(cats[a], cats[b])
            if k is not None and (best is None or k > best[0]):
                best = (k, a, b, n)
    if best:
        k, a, b, n = best
        print(f"  {a} <-> {b}: kappa={k:+.3f} ({strength(k)}), n={n}")

    print("\nWorst pair (lowest kappa):")
    worst = None
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            k, n = cohens_kappa(cats[a], cats[b])
            if k is not None and (worst is None or k < worst[0]):
                worst = (k, a, b, n)
    if worst:
        k, a, b, n = worst
        print(f"  {a} <-> {b}: kappa={k:+.3f} ({strength(k)}), n={n}")


def print_ccc_matrix(title, col_map, raw_rows):
    """col_map: {display_name: column_name}. Builds an NxN Lin's CCC matrix on raw values."""
    names = list(col_map.keys())
    vals = {name: [row.get(col_map[name]) for row in raw_rows] for name in names}

    print(f"\n{'='*100}\n{title}\n{'='*100}")
    header = " " * 24 + "".join(f"{n[:20]:>22s}" for n in names)
    print(header)
    for a in names:
        line = f"{a[:22]:24s}"
        for b in names:
            if a == b:
                line += f"{'—':>22s}"
            else:
                c, n = lins_ccc(vals[a], vals[b])
                line += f"{(f'{c:+.3f} (n={n})' if c is not None else 'n/a'):>22s}"
        print(line)

    print("\nBest pair (highest CCC):")
    best = None
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            c, n = lins_ccc(vals[a], vals[b])
            if c is not None and (best is None or c > best[0]):
                best = (c, a, b, n)
    if best:
        c, a, b, n = best
        print(f"  {a} <-> {b}: CCC={c:+.3f} ({ccc_strength(c)}), n={n}")

    print("\nWorst pair (lowest CCC):")
    worst = None
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            c, n = lins_ccc(vals[a], vals[b])
            if c is not None and (worst is None or c < worst[0]):
                worst = (c, a, b, n)
    if worst:
        c, a, b, n = worst
        print(f"  {a} <-> {b}: CCC={c:+.3f} ({ccc_strength(c)}), n={n}")


if __name__ == "__main__":
    print("Fetching rainfall rows...")
    rain_rows = fetch_all(
        "reference", "weather_rainfall_daily",
        ["nasa_power_rainfall_mm", "chirps_rainfall_mm", "open_meteo_rainfall_mm",
         "gsmap_nrt_rainfall_mm", "era5_rainfall_mm", "ukmo_rainfall_mm",
         "open_meteo_weathercode", "era5_weathercode", "ecmwf_ifs_weathercode",
         "jma_weathercode", "gfs_weathercode"],
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

    # ── Rainfall (6 sources) ────────────────────────────────────────────────
    print_matrix(
        "RAINFALL — pairwise Cohen's Kappa (classify_rain)",
        {
            "NASA POWER AG": "nasa_power_rainfall_mm",
            "CHIRPS": "chirps_rainfall_mm",
            "Open-Meteo ERA5-Land": "open_meteo_rainfall_mm",
            "GSMaP NRT": "gsmap_nrt_rainfall_mm",
            "ERA5 (Full)": "era5_rainfall_mm",
            "UKMO": "ukmo_rainfall_mm",
        },
        rain_rows,
        classify_rain,
    )
    print_ccc_matrix(
        "RAINFALL — pairwise Lin's CCC (raw mm)",
        {
            "NASA POWER AG": "nasa_power_rainfall_mm",
            "CHIRPS": "chirps_rainfall_mm",
            "Open-Meteo ERA5-Land": "open_meteo_rainfall_mm",
            "GSMaP NRT": "gsmap_nrt_rainfall_mm",
            "ERA5 (Full)": "era5_rainfall_mm",
            "UKMO": "ukmo_rainfall_mm",
        },
        rain_rows,
    )

    # ── Severe weather (4 sources, weathercode) ─────────────────────────────
    # No CCC here — weathercodes are nominal categories, not a continuous scale.
    # NOAA GFS (ncep_gfs_seamless) via Open-Meteo archive is the independent
    # cross-lineage source — fully independent of ECMWF/ERA5 lineage and uses
    # the same WMO weathercode table.
    # UKMO excluded — 62.7% mismatch rate from a different WMO weathercode
    # convention that cannot be trivially remapped.
    print_matrix(
        "SEVERE WEATHER — pairwise Cohen's Kappa (classify_severe; NOAA GFS as independent source; UKMO excluded)",
        {
            "Open-Meteo ERA5-Land": "open_meteo_weathercode",
            "ERA5 (Full)":          "era5_weathercode",
            "ECMWF IFS":            "ecmwf_ifs_weathercode",
            "NOAA GFS":             "gfs_weathercode",
        },
        rain_rows,
        lambda c: classify_severe(int(c)) if c is not None else None,
    )

    # ── Temperature (5 sources, raw °C — matches production classify_temp use) ─
    print_matrix(
        "TEMPERATURE — pairwise Cohen's Kappa (classify_temp on raw °C, as production does)",
        {
            "NASA POWER AG": "nasa_power_temp_c",
            "Open-Meteo ERA5-Land": "open_meteo_temp_c",
            "ERA5 (Full)": "era5_temp_c",
            "ECMWF IFS": "ecmwf_ifs_temp_c",
            "UKMO": "ukmo_temp_c",
        },
        temp_rows,
        classify_temp,
    )
    print_ccc_matrix(
        "TEMPERATURE — pairwise Lin's CCC (raw °C)",
        {
            "NASA POWER AG": "nasa_power_temp_c",
            "Open-Meteo ERA5-Land": "open_meteo_temp_c",
            "ERA5 (Full)": "era5_temp_c",
            "ECMWF IFS": "ecmwf_ifs_temp_c",
            "UKMO": "ukmo_temp_c",
        },
        temp_rows,
    )

    # ── Humidity (3 sources) ─────────────────────────────────────────────────
    print_matrix(
        "HUMIDITY — pairwise Cohen's Kappa (classify_humidity)",
        {
            "NASA POWER AG": "nasa_power_rh_pct",
            "Open-Meteo ERA5-Land": "open_meteo_rh_pct",
            "ERA5 (Full)": "era5_rh_pct",
        },
        temp_rows,
        classify_humidity,
    )
    print_ccc_matrix(
        "HUMIDITY — pairwise Lin's CCC (raw %)",
        {
            "NASA POWER AG": "nasa_power_rh_pct",
            "Open-Meteo ERA5-Land": "open_meteo_rh_pct",
            "ERA5 (Full)": "era5_rh_pct",
        },
        temp_rows,
    )

    # ── Wind (5 sources) ─────────────────────────────────────────────────────
    print_matrix(
        "WIND — pairwise Cohen's Kappa (classify_wind)",
        {
            "NASA POWER AG": "nasa_power_wind_ms",
            "Open-Meteo ERA5-Land": "open_meteo_wind_ms",
            "ERA5 (Full)": "era5_wind_ms",
            "ECMWF IFS": "ecmwf_ifs_wind_ms",
            "UKMO": "ukmo_wind_ms",
        },
        wind_rows,
        classify_wind,
    )
    print_ccc_matrix(
        "WIND — pairwise Lin's CCC (raw m/s)",
        {
            "NASA POWER AG": "nasa_power_wind_ms",
            "Open-Meteo ERA5-Land": "open_meteo_wind_ms",
            "ERA5 (Full)": "era5_wind_ms",
            "ECMWF IFS": "ecmwf_ifs_wind_ms",
            "UKMO": "ukmo_wind_ms",
        },
        wind_rows,
    )
