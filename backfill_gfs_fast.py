"""
Fast backfill: fetch DWD ICON weathercode from Open-Meteo archive
and BULK upsert into reference.weather_rainfall_daily.gfs_weathercode.

Uses one API call per municipality + one upsert per municipality (bulk).
Runs in parallel with the slow backfill if needed — safe to run twice.
"""
import sys, os, time, urllib.parse, urllib.request, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src', 'analytics'))

from datetime import date
from app.services.supabase_client import get_table

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

for muni in MUNICIPALITIES:
    name = muni["name"]
    print(f"\n[{name}] Fetching ICON codes...", flush=True)
    wcode_by_date = fetch_icon_codes(muni["lat"], muni["lon"], START, END)
    if not wcode_by_date:
        print(f"  No data — skipping", flush=True)
        continue
    print(f"  Got {len(wcode_by_date)} days", flush=True)

    # Fetch all rows for this municipality (id + date)
    table = get_table("reference", "weather_rainfall_daily")
    resp = table.select("id,date").eq("municipality", name).execute()
    rows = resp.data or []

    # Build upsert payload — only rows we have codes for
    payload = []
    for row in rows:
        d = row["date"][:10]
        if d in wcode_by_date:
            payload.append({"id": row["id"], "gfs_weathercode": wcode_by_date[d]})

    if not payload:
        print(f"  No matching rows", flush=True)
        continue

    # Bulk upsert in batches of 500 (well within Supabase limits)
    for i in range(0, len(payload), 500):
        batch = payload[i:i+500]
        table.upsert(batch, on_conflict="id").execute()
        print(f"  Upserted {min(i+500, len(payload))}/{len(payload)}", flush=True)

    total_updated += len(payload)
    time.sleep(1)   # gentle rate limit between municipalities

print(f"\nDone. Total rows upserted: {total_updated}", flush=True)
