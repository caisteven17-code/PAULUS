"""
SARIMAX  (Seasonal ARIMA with Exogenous Variables)
===================================================
Tier  : Predictive Analytics
Uses  : Financial Forecast
        Pastoral Assignment Financial Trend Forecast (continuous)
        Seasonal Forecast
Target: Continuous
KPI   : WAPE, MASE

Exogenous variables: sacraments_rate, month_sin, month_cos, liturgical calendar counts
(add liturgical calendar flags here when available)

Run: python model_sarimax.py

INSTRUCTIONS
------------
Status  : [runs now] — exogenous columns are engineered automatically
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
          The following columns are created by engineer_features() and
          do NOT need to be in the raw CSV:
            sacraments_rate, month_sin, month_cos
Step 3  : python model_sarimax.py
Output  : models/sarimax.joblib  (best-parish SARIMAX fit + metadata)
KPI tip : WAPE <= 15%.  To improve accuracy, add liturgical calendar
          flags (e.g. is_holy_week, is_christmas) as extra columns in
          the CSV and include them in EXOG_COLS at the top of this file.
Note    : Parishes with fewer than 6 filled months are skipped.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.statespace.sarimax import SARIMAX

from utils import load_data, engineer_features, print_forecast_evaluation, print_metric_table, MODELS_DIR, wape

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

EXOG_COLS = [
    "sacraments_rate", "month_sin", "month_cos",
    "liturgical_major_days", "liturgical_penitential_days",
    "liturgical_advent_days", "liturgical_christmas_days",
    "liturgical_lent_days", "liturgical_easter_days",
    "liturgical_triduum_days",
]
ORDER          = (1, 1, 1)
SEASONAL_ORDER = (1, 1, 0, 12)


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    results = []
    best_wape = float("inf")
    best_artifact = None
    all_actuals = []
    all_preds = []
    all_groups = []

    for parish in parishes:
        p = df[df["parish_name"] == parish].sort_values(["year", "month_num"])
        endog = p[target].dropna()
        exog  = p[EXOG_COLS].fillna(0)

        if len(endog) < 6:
            continue

        train_endog = np.log1p(endog.iloc[:-2].clip(lower=0))
        test_endog  = endog.iloc[-2:]
        train_exog  = exog.iloc[:len(train_endog)]
        test_exog   = exog.iloc[len(train_endog):len(train_endog)+2]

        try:
            model = SARIMAX(
                train_endog,
                exog=train_exog,
                order=ORDER,
                seasonal_order=SEASONAL_ORDER,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fit = model.fit(disp=False)
            preds = np.expm1(fit.forecast(steps=2, exog=test_exog)).clip(lower=0)

            w    = wape(test_endog.values, preds.values)

            results.append({"parish": parish, "WAPE": round(w,2)})
            all_actuals.extend(test_endog.values)
            all_preds.extend(preds.values)
            all_groups.extend([parish] * len(test_endog))

            if w < best_wape:
                best_wape = w
                best_artifact = {
                    "fit": fit, "order": ORDER,
                    "seasonal_order": SEASONAL_ORDER,
                    "exog_cols": EXOG_COLS, "target": target,
                }
        except Exception as e:
            results.append({"parish": parish, "WAPE": None})

    if not results:
        print("[SKIP] Not enough data -- need at least 6 filled months per parish.")
        return

    print_metric_table(pd.DataFrame(results), percent_cols=["WAPE"])
    summary, per_parish = print_forecast_evaluation("SARIMAX holdout", all_actuals, all_preds, groups=all_groups)

    if best_artifact:
        out = os.path.join(MODELS_DIR, "sarimax.joblib")
        best_artifact["evaluation"] = summary
        best_artifact["per_parish_evaluation"] = per_parish.to_dict(orient="records")
        joblib.dump(best_artifact, out)
        print(f"\nSaved best SARIMAX -> {out}")

    if summary["overall_wape"] > 15:
        print("[!] WAPE > 15% -- add stronger exogenous regressors (liturgical calendar, events).")


if __name__ == "__main__":
    print("SARIMAX -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("SARIMAX", df)
