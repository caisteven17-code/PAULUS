"""
Prophet
=======
Tier  : Predictive Analytics
Uses  : Financial Forecast (collection amount, disbursement, net balance)
        Seasonal Forecast (expected collection per event / liturgical period)
Target: Continuous
KPI   : MAPE, MASE, WAPE, MPE

Run: python model_prophet.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install prophet pandas numpy joblib scikit-learn
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
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
from sklearn.metrics import mean_absolute_percentage_error

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

MONTH_ORDER = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]


def make_prophet_df(df: pd.DataFrame, parish_name: str, target: str) -> pd.DataFrame:
    """Convert parish rows to Prophet ds/y format."""
    p = df[df["parish_name"] == parish_name].copy()
    p["ds"] = pd.to_datetime(
        p["year"].astype(str) + "-" + p["month_num"].astype(str) + "-01"
    )
    p = p.sort_values("ds").rename(columns={target: "y"})[["ds", "y"]].dropna()
    return p


def wape(y_true, y_pred) -> float:
    return np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + 1e-8) * 100


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

    for parish, pdata in valid:
        train_df = pdata.iloc[:-2]
        test_df  = pdata.iloc[-2:]

        m = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            seasonality_mode="additive",
        )
        m.fit(train_df)

        future = m.make_future_dataframe(periods=2, freq="MS")
        forecast = m.predict(future)
        preds = forecast.set_index("ds")["yhat"].reindex(test_df["ds"]).values
        actuals = test_df["y"].values

        mape = mean_absolute_percentage_error(actuals, preds) * 100
        w = wape(actuals, preds)
        results.append({"parish": parish, "MAPE": round(mape,2), "WAPE": round(w,2)})

        if w < best_score:
            best_score = w
            best_model = m
            best_parish = parish

    results_df = pd.DataFrame(results)
    print(results_df.to_string(index=False))
    print(f"\nBest parish model: {best_parish} (WAPE {best_score:.2f}%)")

    if best_model:
        out = os.path.join(MODELS_DIR, "prophet.joblib")
        joblib.dump({"model": best_model, "target": target}, out)
        print(f"Saved -> {out}")

    if best_score > 15:
        print("[!] WAPE > 15% -- consider more historical data or seasonal regressors.")


if __name__ == "__main__":
    print("Prophet -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
