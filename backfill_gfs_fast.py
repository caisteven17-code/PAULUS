"""
Fast backfill: fetch DWD ICON weathercode from Open-Meteo archive and
UPDATE reference.weather_rainfall_daily.gfs_weathercode in AWS RDS.

One API call per municipality, one SQL UPDATE per municipality.
Estimated runtime: 2-5 minutes for all 30 municipalities.

Run from CAPSTONE root:
    python backfill_gfs_fast.py
"""
import sys, os, time, urllib.parse, urllib.request, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src', 'analytics'))

from datetime import date
from app.services import analytics_db

MUNICIPALITIES = [
    {"name": "San Pablo City",  "lat": 14.0683, "lon": 121.3229},
    {"name": "Calamba City",    "lat": 14.2117, "lon": 121.1653},
    {"name": "Santa Rosa City", "lat": 14.3122, "lon": 121.1114},
    {"name": "Biñan City",      "lat": 14.3317, "lon": 121.0783},
    {"name": "Cabuyao City",    "lat": 14.2739, "lon": 121.1239},
    {"name": "San Pedro City",  "lat": 14.3583, "lon": 121.0472},
    {"name": "Los Baños",       "lat": 14.1667, "lon": 121.2436},
    {"name": "Santa Cruz",      "lat": 14.2778, "lon": 121.4133},
    {"name": "Pagsanjan",       "lat": 14.2686, "lon": 121.4578},
    {"name": "Nagcarlan",       "lat": 13.9206, "lon": 121.4156},
    {"name": "Liliw",           "lat": 14.1292, "lon": 121.4342},
    {"name": "Majayjay",        "lat": 14.0247, "lon": 121.4758},
    {"name": "Magdalena",       "lat": 14.2033, "lon": 121.4442},
    {"name": "Pila",            "lat": 14.2353, "lon": 121.3656},
    {"name": "Bay",             "lat": 14.1783, "lon": 121.2847},
    {"name": "Calauan",         "lat": 14.1425, "lon": 121.3203},
    {"name": "Luisiana",        "lat": 14.1719, "lon": 121.5058},
    {"name": "Cavinti",         "lat": 14.2458, "lon": 121.5133},
    {"name": "Lumban",          "lat": 14.2967, "lon": 121.4742},
    {"name": "Paete",           "lat": 14.3628, "lon": 121.5031},
    {"name": "Pakil",           "lat": 14.3772, "lon": 121.4742},
    {"name": "Pangil",          "lat": 14.4003, "lon": 121.4619},
    {"name": "Siniloan",        "lat": 14.4258, "lon": 121.4472},
    {"name": "Famy",            "lat": 14.4342, "lon": 121.4806},
    {"name": "Mabitac",         "lat": 14.4556, "lon": 121.4364},
    {"name": "Santa Maria",     "lat": 14.4903, "lon": 121.4275},
    {"name": "Rizal",           "lat": 14.1003, "lon": 121.3917},
    {"name": "Alaminos",        "lat": 14.0631, "lon": 121.2428},
    {"name": "Victoria",        "lat": 14.2136, "lon": 121.2853},
    {"name": "Kalayaan",        "lat": 14.3253, "lon": 121.5494},
]

START = date(2023, 1, 1)
END   = date(2026, 6, 11)


def fetch_icon_codes(lat, lon, start, end):
    params = urllib.parse.urlencode({
        "latitude":   lat,
        "longitude":  lon,
        "start_date": start.isoformat(),
        "end_date":   end.isoformat(),
        "daily":      "weather_code",
        "timezone":   "Asia/Manila",
        "model":      "icon_seamless",
    })
    url = f"https://archive-api.open-meteo.com/v1/archive?{params}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"    FETCH ERROR: {e}")
        return {}
    daily = data.get("daily", {})
    dates = daily.get("time", [])
    codes = daily.get("weather_code", [])
    return {d: int(c) for d, c in zip(dates, codes) if c is not None}


total_updated = 0
pool = analytics_db.get_etl_pool()

for muni in MUNICIPALITIES:
    name = muni["name"]
    print(f"\n[{name}] Fetching ICON codes...", flush=True)
    wcode_by_date = fetch_icon_codes(muni["lat"], muni["lon"], START, END)
    if not wcode_by_date:
        print(f"  No data — skipping", flush=True)
        continue
    print(f"  Got {len(wcode_by_date)} days from Open-Meteo", flush=True)

    # Build a VALUES list and run one UPDATE per municipality
    # UPDATE reference.weather_rainfall_daily AS t
    # SET gfs_weathercode = v.code
    # FROM (VALUES ('2023-01-01'::date, 1), ...) AS v(date, code)
    # WHERE t.municipality = %s AND t.date = v.date
    items = list(wcode_by_date.items())  # [(date_str, code), ...]

    # Build parameterised VALUES: (%s::date, %s), (%s::date, %s), ...
    placeholders = ", ".join(["(%s::date, %s)"] * len(items))
    flat_params = []
    for d, c in items:
        flat_params.extend([d, c])
    flat_params.append(name)  # for WHERE municipality = %s

    sql = f"""
UPDATE reference.weather_rainfall_daily AS t
SET gfs_weathercode = v.code
FROM (VALUES {placeholders}) AS v(date, code)
WHERE t.municipality = %s AND t.date = v.date
"""
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, flat_params)
                updated = cur.rowcount
            conn.commit()
        print(f"  Updated {updated} rows in AWS RDS", flush=True)
        total_updated += updated
    except Exception as e:
        print(f"  ERROR updating {name}: {e}", flush=True)

    time.sleep(0.5)  # gentle rate limit

analytics_db.close_etl_pool()
print(f"\nDone. Total rows updated: {total_updated}", flush=True)
