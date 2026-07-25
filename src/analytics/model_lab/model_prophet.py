"""
Prophet
=======
Tier  : Predictive Analytics
Uses  : Financial Forecast (collection amount, disbursement, net balance)
        Seasonal Forecast (expected collection per event / liturgical period)
Target: Continuous
KPI   : WAPE, MASE, MPE

Run: python model_prophet.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install prophet pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder as this file and has these columns filled in:
            parish_name, year, month_num, total_receipts_final
Step 3  : python model_prophet.py
Output  : models/prophet.joblib  (best-parish Prophet model + target)
KPI tip : WAPE should be <= 15%.  If it prints "[!] WAPE > 15%", you need
          more months of data (aim for 12+ per parish) or add seasonal
          regressors (e.g. liturgical calendar flags).
Note    : Parishes with fewer than 6 filled months are silently skipped.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from prophet import Prophet

from utils import (
    load_data,
    engineer_features,
    print_metric_table,
    print_forecast_evaluation,
    MODELS_DIR,
    wape,
    add_liturgical_calendar_features,
)

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

MONTH_ORDER = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]

LITURGICAL_REGRESSORS = [
    "liturgical_major_days",
    "liturgical_penitential_days",
    "liturgical_advent_days",
    "liturgical_christmas_days",
    "liturgical_lent_days",
    "liturgical_easter_days",
    "liturgical_triduum_days",
]


def make_prophet_df(df: pd.DataFrame, parish_name: str, target: str) -> pd.DataFrame:
    """Convert parish rows to Prophet ds/y format."""
    p = df[df["parish_name"] == parish_name].copy()
    p["ds"] = pd.to_datetime(
        p["year"].astype(str) + "-" + p["month_num"].astype(str) + "-01"
    )
    columns = ["ds", "y"] + [col for col in LITURGICAL_REGRESSORS if col in p.columns]
    p = p.sort_values("ds").rename(columns={target: "y"})[columns].dropna(subset=["y"])
    return p


def add_future_regressors(future: pd.DataFrame) -> pd.DataFrame:
    future = future.copy()
    future["year"] = future["ds"].dt.year
    future["month_num"] = future["ds"].dt.month
    future = add_liturgical_calendar_features(future)
    return future.drop(columns=["year", "month_num"], errors="ignore")


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    valid = []

    for parish in parishes:
        pdata = make_prophet_df(df, parish, target)
        if len(pdata) >= 6:
            valid.append((parish, pdata))

    if not valid:
        print("[SKIP] Not enough data -- need at least 6 filled months per parish.")
        return

    results = []
    best_score = float("inf")
    best_model = None
    best_parish = None
    all_actuals = []
    all_preds = []
    all_groups = []

    for parish, pdata in valid:
        train_df = pdata.iloc[:-2]
        test_df  = pdata.iloc[-2:]

        m = Prophet(
            growth="logistic",
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            seasonality_mode="multiplicative",
        )
        for regressor in LITURGICAL_REGRESSORS:
            m.add_regressor(regressor)

        cap = max(float(pdata["y"].max()) * 1.2, 1.0)
        train_df = train_df.copy()
        train_df["floor"] = 0.0
        train_df["cap"] = cap
        for regressor in LITURGICAL_REGRESSORS:
            if regressor not in train_df.columns:
                train_df[regressor] = 0
        m.fit(train_df)

        future = m.make_future_dataframe(periods=2, freq="MS")
        future = add_future_regressors(future)
        future["floor"] = 0.0
        future["cap"] = cap
        for regressor in LITURGICAL_REGRESSORS:
            if regressor not in future.columns:
                future[regressor] = 0
        forecast = m.predict(future)
        preds = np.maximum(forecast.set_index("ds")["yhat"].reindex(test_df["ds"]).values, 0)
        actuals = test_df["y"].values

        w = wape(actuals, preds)
        results.append({"parish": parish, "WAPE": round(w,2)})
        all_actuals.extend(actuals)
        all_preds.extend(preds)
        all_groups.extend([parish] * len(actuals))

        if w < best_score:
            best_score = w
            best_model = m
            best_parish = parish

    results_df = pd.DataFrame(results)
    print_metric_table(results_df, percent_cols=["WAPE"])
    summary, per_parish = print_forecast_evaluation("Prophet holdout", all_actuals, all_preds, groups=all_groups)
    print(f"\nBest individual parish fit: {best_parish} (WAPE {best_score:.2f}%)")

    if best_model:
        out = os.path.join(MODELS_DIR, "prophet.joblib")
        joblib.dump({
            "model": best_model,
            "target": target,
            "evaluation": summary,
            "per_parish_evaluation": per_parish.to_dict(orient="records"),
        }, out)
        print(f"Saved -> {out}")

    if summary["overall_wape"] > 15:
        print("[!] WAPE > 15% -- consider more historical data or seasonal regressors.")


if __name__ == "__main__":
    print("Prophet -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Prophet", df)
