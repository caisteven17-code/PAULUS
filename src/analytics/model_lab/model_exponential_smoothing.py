"""
Exponential Smoothing  (Simple / Double)
=========================================
Tier  : Predictive Analytics
Uses  : Pastoral Assignment Financial Trend Forecast (continuous)
Target: Continuous
KPI   : WAPE, MASE

Simple ES for stationary series, Double ES (Holt) for trended series.
For full seasonal decomposition use model_holt_winters.py instead.

Run: python model_exponential_smoothing.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
Step 3  : python model_exponential_smoothing.py
Output  : models/exponential_smoothing.joblib  (best ES variant + target)
KPI tip : If WAPE > 15% and the series has visible seasonality, switch to
          model_holt_winters.py instead — it handles full seasonal patterns.
          This model is best for short, relatively flat or trended series.
Note    : Parishes with fewer than 4 filled months are skipped.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.holtwinters import SimpleExpSmoothing, ExponentialSmoothing

from utils import load_data, engineer_features, print_forecast_evaluation, print_metric_table, MODELS_DIR, wape

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    results = []
    best_wape = float("inf")
    best_artifact = None
    all_actuals = []
    all_preds = []
    all_groups = []

    for parish in parishes:
        series = (
            df[df["parish_name"] == parish]
            .sort_values(["year", "month_num"])[target]
            .dropna()
        )
        if len(series) < 4:
            continue

        train_s = series.iloc[:-2]
        test_s  = series.iloc[-2:]

        candidates = {
            "simple": SimpleExpSmoothing(train_s, initialization_method="estimated").fit(),
            "double": ExponentialSmoothing(
                train_s, trend="add", seasonal=None,
                initialization_method="estimated"
            ).fit(),
        }

        best_w = float("inf")
        best_name = None
        best_model = None

        for name, fit in candidates.items():
            try:
                preds = fit.forecast(2).clip(lower=0)
                w = wape(test_s.values, preds.values)
                if w < best_w:
                    best_w = w
                    best_name = name
                    best_model = fit
            except Exception:
                continue

        if best_model:
            preds = best_model.forecast(2).clip(lower=0)
            results.append({
                "parish": parish,
                "variant": best_name,
                "WAPE": round(best_w, 2),
            })
            all_actuals.extend(test_s.values)
            all_preds.extend(preds.values)
            all_groups.extend([parish] * len(test_s))

            if best_w < best_wape:
                best_wape = best_w
                best_artifact = {"model": best_model, "variant": best_name, "target": target}

    if not results:
        print("[SKIP] Not enough data -- need at least 4 filled months per parish.")
        return

    print_metric_table(pd.DataFrame(results), percent_cols=["WAPE"])
    summary, per_parish = print_forecast_evaluation("Exponential Smoothing holdout", all_actuals, all_preds, groups=all_groups)

    if best_artifact:
        out = os.path.join(MODELS_DIR, "exponential_smoothing.joblib")
        best_artifact["evaluation"] = summary
        best_artifact["per_parish_evaluation"] = per_parish.to_dict(orient="records")
        joblib.dump(best_artifact, out)
        print(f"\nSaved best ES -> {out}")

    if summary["overall_wape"] > 15:
        print("[!] WAPE > 15% -- series likely has trend/seasonality; use Holt-Winters instead.")


if __name__ == "__main__":
    print("Exponential Smoothing -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Exponential Smoothing", df)
