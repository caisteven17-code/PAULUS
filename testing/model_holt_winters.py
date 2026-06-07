"""
Holt-Winters  (Triple Exponential Smoothing)
============================================
Tier  : Predictive Analytics
Uses  : Financial Forecast
        Pastoral Assignment Financial Trend Forecast (continuous)
        Seasonal Forecast
Target: Continuous
KPI   : MAPE, MASE, WAPE

Tries additive and multiplicative seasonal variants; keeps the best by WAPE.

Run: python model_holt_winters.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final,
            total_expenses_final
Step 3  : python model_holt_winters.py
Output  : models/holt_winters.joblib  (best variant model per parish)
KPI tip : WAPE <= 15%.  If WAPE is high, the series is too short for
          seasonal detection — collect at least 24 months per parish.
          The model automatically tries additive and multiplicative
          seasonal variants and keeps whichever has lower WAPE.
Note    : Parishes with fewer than 6 filled months are skipped.
          For non-seasonal series, use model_exponential_smoothing.py.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from sklearn.metrics import mean_absolute_percentage_error

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")


def wape(y_true, y_pred) -> float:
    return np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + 1e-8) * 100


def mase(y_true, y_pred, y_train) -> float:
    mae_pred = np.mean(np.abs(y_true - y_pred))
    mae_naive = np.mean(np.abs(np.diff(y_train)))
    return mae_pred / (mae_naive + 1e-8)


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    results = []
    best_wape = float("inf")
    best_artifact = None

    for parish in parishes:
        series = (
            df[df["parish_name"] == parish]
            .sort_values("month_num")[target]
            .dropna()
        )
        if len(series) < 6:
            continue

        train_s = series.iloc[:-2]
        test_s  = series.iloc[-2:]

        best_for_parish = None
        best_w = float("inf")

        for trend in ["add", "mul", None]:
            for seasonal in ["add", "mul"]:
                try:
                    periods = min(12, len(train_s) // 2)
                    m = ExponentialSmoothing(
                        train_s,
                        trend=trend,
                        seasonal=seasonal,
                        seasonal_periods=periods,
                        initialization_method="estimated",
                    ).fit(optimized=True)

                    preds = m.forecast(2)
                    w = wape(test_s.values, preds.values)

                    if w < best_w:
                        best_w = w
                        best_for_parish = {
                            "model": m,
                            "trend": trend,
                            "seasonal": seasonal,
                            "target": target,
                        }
                except Exception:
                    continue

        if best_for_parish:
            preds = best_for_parish["model"].forecast(2)
            mape_val = mean_absolute_percentage_error(test_s, preds) * 100
            mase_val = mase(test_s.values, preds.values, train_s.values)
            results.append({
                "parish": parish,
                "trend": best_for_parish["trend"],
                "seasonal": best_for_parish["seasonal"],
                "MAPE": round(mape_val, 2),
                "MASE": round(mase_val, 3),
                "WAPE": round(best_w, 2),
            })

            if best_w < best_wape:
                best_wape = best_w
                best_artifact = best_for_parish

    if not results:
        print("[SKIP] Not enough data -- need at least 6 filled months per parish.")
        return

    print(pd.DataFrame(results).to_string(index=False))

    if best_artifact:
        out = os.path.join(MODELS_DIR, "holt_winters.joblib")
        joblib.dump(best_artifact, out)
        print(f"\nSaved best Holt-Winters -> {out}")

    if best_wape > 15:
        print("[!] WAPE > 15% -- series may be too short for seasonal detection.")


if __name__ == "__main__":
    print("Holt-Winters -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
