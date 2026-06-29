"""
Isolation Forest
================
Tier  : Descriptive Analytics
Uses  : Financial Trend (anomaly detection on collections / disbursements)
        Seasonality Trend (event-period anomaly detection)
KPI   : Net Receipt Deficit Rate <= 46.83%, anomaly flags per parish-month

Contamination = 0.05 (5% of parish-months expected to be anomalous).
Flags outliers in collection patterns for review.

Run: python model_isolation_forest.py

INSTRUCTIONS
------------
Status  : [runs now] — all feature columns are engineered automatically
Step 1  : pip install scikit-learn pandas numpy joblib
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month, year,
            total_receipts_final, total_expenses_final
          The following feature columns are computed by engineer_features():
            collections_zscore, collections_mom_growth, sacraments_rate,
            net_margin, month_sin, month_cos
Step 3  : python model_isolation_forest.py
Output  : models/isolation_forest.joblib  (model + scaler + feature list)
KPI tip : Net Receipt Deficit Rate should be <= 46.83%.  Flagged rows are
          printed — review them to confirm they are genuine anomalies
          (e.g. data entry errors, one-off events) rather than real patterns.
Note    : CONTAMINATION = 0.05 means the model expects ~5% of rows to be
          anomalous.  Adjust this constant at the top of the file if the
          flagged percentage seems too high or too low for your dataset.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

FEATURES = [
    "collections_zscore",
    "collections_mom_growth",
    "sacraments_rate",
    "net_margin",
    "month_sin",
    "month_cos",
]

CONTAMINATION = 0.05


def train(df: pd.DataFrame) -> None:
    X_raw = df[FEATURES].fillna(0)

    scaler = StandardScaler()
    X = scaler.fit_transform(X_raw)

    model = IsolationForest(
        n_estimators=300,
        contamination=CONTAMINATION,
        random_state=42,
    )
    model.fit(X)

    flags  = model.predict(X)           # -1 = anomaly, 1 = normal
    scores = model.decision_function(X) # lower = more anomalous

    df = df.copy()
    df["anomaly_flag"]  = (flags == -1).astype(int)
    df["anomaly_score"] = scores

    n_anomalies = df["anomaly_flag"].sum()
    print(f"Trained on {len(df)} rows")
    print(f"Anomalies flagged: {n_anomalies} ({n_anomalies/len(df)*100:.1f}%)")

    if n_anomalies > 0:
        flagged = df[df["anomaly_flag"] == 1][
            ["parish_name", "month", "year"] + FEATURES + ["anomaly_score"]
        ].sort_values("anomaly_score")
        print("\nFlagged rows (most anomalous first):")
        print(flagged.to_string(index=False))

    out = os.path.join(MODELS_DIR, "isolation_forest.joblib")
    joblib.dump({
        "model":        model,
        "scaler":       scaler,
        "features":     FEATURES,
        "contamination": CONTAMINATION,
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Isolation Forest -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Isolation Forest", df)
