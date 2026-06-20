"""
Sanity check: does Open-Meteo's JMA model return usable weathercode data, and
does it use the same convention as ERA5/ECMWF IFS (so classify_severe() means
the same thing for both), or does it diverge like UKMO did?

Pulls 5 municipalities x 1 year for JMA + ECMWF IFS, compares weathercode
null-rate, category distribution, and day-by-day agreement.

Not part of the production pipeline — run directly with:
    python jma_weathercode_check.py
"""
import sys
import time
from collections import Counter
from datetime import date

sys.path.insert(0, ".")

from app.services.weather_collector import MUNICIPALITIES, fetch_open_meteo_jma, fetch_open_meteo_ecmwf_ifs
from app.services.weather_daily_classifier import classify_severe

SAMPLE_MUNIS = MUNICIPALITIES[:5]
START = date(2023, 1, 1)
END = date(2023, 12, 31)


def fetch_with_retry(fn, lat, lon, start, end, label):
    for attempt in range(3):
        try:
            return fn(lat, lon, start, end)
        except Exception as e:
            print(f"  {label} retry {attempt+1} after error: {e}")
            time.sleep(2)
    print(f"  {label} exhausted retries — treating as empty")
    return []


if __name__ == "__main__":
    jma_codes = []
    ecmwf_codes = []
    paired = []  # (date, muni, jma_code, ecmwf_code)

    for m in SAMPLE_MUNIS:
        print(f"Fetching {m['name']}...")
        jma_rows = fetch_with_retry(fetch_open_meteo_jma, m["lat"], m["lon"], START, END, "JMA")
        time.sleep(2)
        ecmwf_rows = fetch_with_retry(fetch_open_meteo_ecmwf_ifs, m["lat"], m["lon"], START, END, "ECMWF IFS")
        time.sleep(2)

        jma_by_date = {r["date"]: r.get("weathercode") for r in jma_rows}
        ecmwf_by_date = {r["date"]: r.get("weathercode") for r in ecmwf_rows}

        print(f"  JMA: {len(jma_rows)} days, {sum(1 for v in jma_by_date.values() if v is not None)} with weathercode")
        print(f"  ECMWF IFS: {len(ecmwf_rows)} days, {sum(1 for v in ecmwf_by_date.values() if v is not None)} with weathercode")

        for d, jc in jma_by_date.items():
            ec = ecmwf_by_date.get(d)
            jma_codes.append(jc)
            ecmwf_codes.append(ec)
            paired.append((d, m["name"], jc, ec))

    print(f"\n{'='*80}\nTotal paired days: {len(paired)}\n{'='*80}")

    jma_present = sum(1 for c in jma_codes if c is not None)
    ecmwf_present = sum(1 for c in ecmwf_codes if c is not None)
    print(f"JMA weathercode present: {jma_present}/{len(jma_codes)} ({100*jma_present/len(jma_codes):.1f}%)")
    print(f"ECMWF weathercode present: {ecmwf_present}/{len(ecmwf_codes)} ({100*ecmwf_present/len(ecmwf_codes):.1f}%)")

    print("\nRaw weathercode value distribution (top 10 each):")
    print("  JMA:   ", Counter(c for c in jma_codes if c is not None).most_common(10))
    print("  ECMWF: ", Counter(c for c in ecmwf_codes if c is not None).most_common(10))

    print("\nclassify_severe() category distribution:")
    jma_cats = Counter(classify_severe(c) for c in jma_codes if c is not None)
    ecmwf_cats = Counter(classify_severe(c) for c in ecmwf_codes if c is not None)
    print("  JMA:   ", dict(jma_cats))
    print("  ECMWF: ", dict(ecmwf_cats))

    # Day-by-day agreement (category match, same convention assumption)
    both = [(jc, ec) for _, _, jc, ec in paired if jc is not None and ec is not None]
    if both:
        cat_pairs = [(classify_severe(jc), classify_severe(ec)) for jc, ec in both]
        agree = sum(1 for a, b in cat_pairs if a == b)
        exact_code_agree = sum(1 for jc, ec in both if jc == ec)
        print(f"\nDay-by-day comparison (n={len(both)}):")
        print(f"  exact weathercode match: {exact_code_agree} ({100*exact_code_agree/len(both):.1f}%)")
        print(f"  classify_severe() category match: {agree} ({100*agree/len(both):.1f}%)")
        print("\nSample mismatches (JMA code, ECMWF code, JMA cat, ECMWF cat):")
        shown = 0
        for d, name, jc, ec in paired:
            if jc is not None and ec is not None and classify_severe(jc) != classify_severe(ec):
                print(f"  {d} {name}: JMA={jc} ({classify_severe(jc)})  ECMWF={ec} ({classify_severe(ec)})")
                shown += 1
                if shown >= 10:
                    break
    else:
        print("\nNo overlapping non-null days to compare.")

    from collections import Counter as _C
    cats_a = [classify_severe(jc) for jc, ec in both]
    cats_b = [classify_severe(ec) for jc, ec in both]
    n = len(cats_a)
    p_o = sum(1 for a, b in zip(cats_a, cats_b) if a == b) / n
    ra = _C(cats_a)
    rb = _C(cats_b)
    cats = set(ra) | set(rb)
    p_e = sum((ra.get(c, 0) / n) * (rb.get(c, 0) / n) for c in cats)
    kappa = (p_o - p_e) / (1 - p_e) if p_e != 1 else None
    print(f"\nChance-corrected Cohen's Kappa (JMA vs ECMWF IFS, classify_severe): {kappa:+.4f}" if kappa is not None else "kappa undefined")
