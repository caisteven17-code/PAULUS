"""Quick test: which Open-Meteo archive models support weather_code?"""
import urllib.parse, urllib.request, json

LAT, LON = 14.1667, 121.2436  # Los Baños
START, END = "2023-01-01", "2023-01-10"

MODELS = [
    "ncep_gfs_seamless",
    "icon_seamless",
    "gem_seamless",
    "bom_access_global",
    "jma_seamless",
    "era5",           # known working — baseline
    "ecmwf_ifs",      # known working — baseline
]

for model in MODELS:
    params = urllib.parse.urlencode({
        "latitude":   LAT,
        "longitude":  LON,
        "start_date": START,
        "end_date":   END,
        "daily":      "weather_code",
        "timezone":   "Asia/Manila",
        "model":      model,
    })
    url = f"https://archive-api.open-meteo.com/v1/archive?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        codes = data.get("daily", {}).get("weather_code", [])
        non_null = [c for c in codes if c is not None]
        print(f"{model:30s}  → {len(non_null)}/{len(codes)} days with weather_code  sample={codes[:3]}")
    except Exception as e:
        print(f"{model:30s}  → ERROR: {e}")
