"""
Change Point Detection
======================
Tier  : Diagnostic Analytics
Uses  : Cluster and Seasonal Diagnostic (seasonal regime shifts)
        Project Risk Diagnostic (budget / schedule deviation onset)
KPI   : Change Point Detection Rate (%)
        Seasonal-Impact Detection Rate (%)

Uses the `ruptures` library with Pelt algorithm (penalised exact search).
Detects structural breaks in collection/expense time series per parish.

Run: python model_change_point_detection.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install ruptures pandas numpy joblib
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, month_num, month, total_receipts_final
Step 3  : python model_change_point_detection.py
Output  : models/change_point_detection.joblib
          Contains: per-parish change point lists (by month name),
          penalty and min_size settings, and target column used.
KPI tip : Change Point Detection Rate is printed.  If it is too high
          (many breaks detected), increase PEN (penalty) at the top of
          this file — higher penalty = fewer change points.  If no breaks
          are found, lower PEN.
Note    : Parishes with fewer than 4 filled months are skipped.
          Compare results with model_bocpd.py — both detect regime shifts
          but use different algorithms (PELT vs. Bayesian online).
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
import ruptures as rpt

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

PEN        = 3    # penalty parameter -- lower = more change points detected
MIN_SIZE   = 2    # minimum segment length in months
MODEL_TYPE = "rbf"  # kernel: "rbf", "l1", "l2", "normal"


def detect_change_points(series: np.ndarray) -> list:
    """Return list of change point indices (0-based month positions)."""
    if len(series) < MIN_SIZE * 2 + 1:
        return []
    try:
        algo = rpt.Pelt(model=MODEL_TYPE, min_size=MIN_SIZE, jump=1).fit(series)
        bkps = algo.predict(pen=PEN)
        return [b - 1 for b in bkps[:-1]]  # drop the final end-of-series point
    except Exception:
        return []


def train(df: pd.DataFrame,
          target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    results  = []

    for parish in parishes:
        p = df[df["parish_name"] == parish].sort_values("month_num")
        series = p[target].fillna(0).values

        if len(series) < 4:
            continue

        cps = detect_change_points(series)
        months = p["month"].tolist()
        cp_months = [months[i] for i in cps if i < len(months)]

        results.append({
            "parish":          parish,
            "n_months":        len(series),
            "change_points":   cp_months,
            "n_change_points": len(cps),
        })

    if not results:
        print("[SKIP] Not enough data -- need filled financial values.")
        return

    results_df = pd.DataFrame(results)
    print(results_df[["parish", "n_months", "n_change_points", "change_points"]].to_string(index=False))

    total_cps   = results_df["n_change_points"].sum()
    total_months = results_df["n_months"].sum()
    rate = total_cps / total_months * 100 if total_months > 0 else 0
    print(f"\nChange Point Detection Rate: {rate:.1f}%")

    out = os.path.join(MODELS_DIR, "change_point_detection.joblib")
    joblib.dump({
        "results":    results,
        "pen":        PEN,
        "min_size":   MIN_SIZE,
        "model_type": MODEL_TYPE,
        "target":     target,
    }, out)
    print(f"Saved -> {out}")


if __name__ == "__main__":
    print("Change Point Detection -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
