"""
SARIMA  (Seasonal ARIMA)
========================
Tier  : Predictive Analytics
Uses  : Financial Forecast (collection amount, disbursement, net balance)
        Seasonal Forecast (expected collection per event / liturgical period)
Target: Continuous
KPI   : WAPE, MASE, MPE

Auto-selects (p,d,q)(P,D,Q,m) via AIC grid search per parish.

Run: python model_sarima.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
Step 3  : python model_sarima.py
Output  : models/sarima.joblib  (best-parish SARIMA fit + order info)
KPI tip : WAPE <= 15% is the target.  The grid search tries all (p,d,q)
          combinations 0–1; expand P_RANGE / Q_RANGE at the top of this
          file once you have multi-year data.
Note    : Parishes with fewer than 6 filled months are skipped.
          SARIMA is slow on large grids — keep ranges small until you
          have enough data to justify wider searches.
"""

import os
import warnings
import itertools
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.statespace.sarimax import SARIMAX

from utils import load_data, engineer_features, print_forecast_evaluation, print_metric_table, MODELS_DIR, wape

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

# Search space (kept small for speed; expand once you have multi-year data)
P_RANGE = range(0, 2)
D_RANGE = range(0, 2)
Q_RANGE = range(0, 2)
SEASONAL_M = 12  # monthly data


def best_sarima_order(series: pd.Series):
    """Grid search over (p,d,q)(P,D,Q,12) and return best by AIC."""
    best_aic = float("inf")
    best_order = (1, 1, 1)
    best_seasonal = (1, 1, 0, SEASONAL_M)

    for p, d, q in itertools.product(P_RANGE, D_RANGE, Q_RANGE):
        for P, D, Q in itertools.product(range(0, 2), range(0, 2), range(0, 2)):
            try:
                m = SARIMAX(series, order=(p,d,q),
                            seasonal_order=(P,D,Q,SEASONAL_M),
                            enforce_stationarity=False,
                            enforce_invertibility=False)
                fit = m.fit(disp=False)
                if fit.aic < best_aic:
                    best_aic = fit.aic
                    best_order = (p, d, q)
                    best_seasonal = (P, D, Q, SEASONAL_M)
            except Exception:
                continue
    return best_order, best_seasonal


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    valid_parishes = []

    for parish in parishes:
        p = df[df["parish_name"] == parish].sort_values(["year", "month_num"])[target].dropna()
        if len(p) >= 6:
            valid_parishes.append((parish, p))

    if not valid_parishes:
        print("[SKIP] Not enough data -- need at least 6 filled months per parish.")
        return

    results = []
    best_wape = float("inf")
    best_artifact = None
    all_actuals = []
    all_preds = []
    all_groups = []

    for parish, series in valid_parishes:
        train_s = series.iloc[:-2]
        test_s  = series.iloc[-2:]

        train_log = np.log1p(train_s.clip(lower=0))
        order, seasonal = best_sarima_order(train_log)
        model = SARIMAX(train_log, order=order, seasonal_order=seasonal,
                        enforce_stationarity=False, enforce_invertibility=False)
        fit = model.fit(disp=False)

        preds = np.expm1(fit.forecast(steps=2)).clip(lower=0)
        w = wape(test_s.values, preds.values)

        results.append({
            "parish": parish,
            "order": order,
            "seasonal": seasonal,
            "WAPE": round(w, 2),
        })
        all_actuals.extend(test_s.values)
        all_preds.extend(preds.values)
        all_groups.extend([parish] * len(test_s))

        if w < best_wape:
            best_wape = w
            best_artifact = {"fit": fit, "order": order,
                             "seasonal": seasonal, "target": target}

    results_df = pd.DataFrame(results)
    print_metric_table(
        results_df,
        columns=["parish", "order", "WAPE"],
        percent_cols=["WAPE"],
    )
    summary, per_parish = print_forecast_evaluation("SARIMA holdout", all_actuals, all_preds, groups=all_groups)

    if best_artifact:
        out = os.path.join(MODELS_DIR, "sarima.joblib")
        best_artifact["evaluation"] = summary
        best_artifact["per_parish_evaluation"] = per_parish.to_dict(orient="records")
        joblib.dump(best_artifact, out)
        print(f"\nSaved best SARIMA -> {out}")

    if summary["overall_wape"] > 15:
        print("[!] WAPE > 15% -- consider expanding grid or adding more data.")


if __name__ == "__main__":
    print("SARIMA -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("SARIMA", df)
