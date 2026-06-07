"""
BSTS  (Bayesian Structural Time Series)
========================================
Tier  : Predictive Analytics
Uses  : Financial Forecast (collection amount, disbursement, net balance)
Target: Continuous
KPI   : MAPE, MASE, WAPE, MPE, Holdout MAPE Accuracy

Implemented via statsmodels UnobservedComponents (state-space form of BSTS):
  - Local level + local linear trend
  - Stochastic seasonal component (12-month period)
Posterior inference via Kalman filter/smoother.

Run: python model_bsts.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
Step 3  : python model_bsts.py
Output  : models/bsts.joblib  (best-parish UnobservedComponents fit)
KPI tip : WAPE <= 15%.  BSTS needs at least 8 months per parish to fit a
          seasonal component — "[!] WAPE > 15%" usually means the series
          is too short.  Collect more data or fall back to model_sarima.py.
Note    : Parishes with fewer than 8 filled months are skipped (more
          than other models because of the stochastic seasonal component).
          This is the slowest model — expect a few minutes on large datasets.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.statespace.structural import UnobservedComponents
from sklearn.metrics import mean_absolute_percentage_error

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")


def wape(y_true, y_pred) -> float:
    return np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + 1e-8) * 100


def mpe(y_true, y_pred) -> float:
    return np.mean((y_true - y_pred) / (np.abs(y_true) + 1e-8)) * 100


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
        if len(series) < 8:
            continue

        train_s = series.iloc[:-2]
        test_s  = series.iloc[-2:]

        try:
            model = UnobservedComponents(
                train_s,
                level="local linear trend",
                seasonal=12,          # 12-month stochastic seasonal
                stochastic_seasonal=True,
            )
            fit = model.fit(disp=False, maxiter=200)

            forecast = fit.get_forecast(steps=2)
            preds    = forecast.predicted_mean.values

            mape_val = mean_absolute_percentage_error(test_s, preds) * 100
            w        = wape(test_s.values, preds)
            mpe_val  = mpe(test_s.values, preds)

            results.append({
                "parish": parish,
                "MAPE": round(mape_val, 2),
                "WAPE": round(w, 2),
                "MPE":  round(mpe_val, 2),
                "AIC":  round(fit.aic, 1),
            })

            if w < best_wape:
                best_wape = w
                best_artifact = {"fit": fit, "target": target}

        except Exception as e:
            results.append({"parish": parish, "MAPE": None, "WAPE": None,
                             "MPE": None, "AIC": None})

    if not results:
        print("[SKIP] Not enough data -- need at least 8 filled months per parish.")
        return

    print(pd.DataFrame(results).to_string(index=False))

    if best_artifact:
        out = os.path.join(MODELS_DIR, "bsts.joblib")
        joblib.dump(best_artifact, out)
        print(f"\nSaved best BSTS -> {out}")

    if best_wape > 15:
        print("[!] WAPE > 15% -- short series limits Bayesian seasonal estimation.")


if __name__ == "__main__":
    print("BSTS -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
