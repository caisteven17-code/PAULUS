"""
XGBoost
=======
Tier  : Predictive Analytics
Uses  : Financial Forecast (regression -- collection, disbursement, net balance)
        Pastoral Assignment Financial Trend Forecast (categorical financial state)
        Parish Cluster Forecast (categorical -- next cluster label)
        Seasonal Forecast (regression)
        Project Success Rate Forecast (binary classification)
Target: Continuous (regression) or Categorical (classification)
KPI   : Regression -- MAPE, WAPE; Classification -- Macro-F1, Balanced Accuracy, Brier Score

Run: python model_xgboost.py

INSTRUCTIONS
------------
Status (regression)      : [runs now]
Status (classification)  : [needs data] — label columns not yet in CSV

Step 1  : pip install xgboost pandas numpy joblib scikit-learn
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder.  Regression uses these engineered columns (all created
          automatically by engineer_features()):
            parish_id, month_num, month_sin, month_cos, sacraments_rate,
            collections_lag1/2/3, collections_roll3, collections_mom_growth,
            parish_mean_collections, parish_std_collections
Step 3  : python model_xgboost.py
          This runs regression by default.  To enable classification,
          uncomment the train_classification() calls at the bottom of the
          file and add the required label columns to the CSV:
            parish_cluster   — cluster label per row
            financial_state  — categorical financial state per row
            project_success  — 1 (success) / 0 (failure) per project row
Output  : models/xgboost_regression.joblib
          models/xgboost_classifier_<label_name>.joblib  (when enabled)
KPI tip : Regression WAPE <= 15%.  Classification F1 >= 0.70.
Note    : Run this before model_shap.py — SHAP requires this model artifact.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from xgboost import XGBRegressor, XGBClassifier
from sklearn.model_selection import cross_val_score, TimeSeriesSplit
from sklearn.metrics import mean_absolute_percentage_error
from sklearn.preprocessing import LabelEncoder

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

REGRESSION_FEATURES = [
    "parish_id", "month_num", "month_sin", "month_cos",
    "sacraments_rate",
    "collections_lag1", "collections_lag2", "collections_lag3",
    "collections_roll3", "collections_mom_growth",
    "parish_mean_collections", "parish_std_collections",
]

CLASSIFICATION_FEATURES = [
    "parish_id", "month_num", "month_sin", "month_cos",
    "sacraments_rate", "collections_zscore",
    "net_margin", "collections_roll3", "collections_mom_growth",
]


def wape(y_true, y_pred) -> float:
    return np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + 1e-8) * 100


# ---- Regression (Financial Forecast / Seasonal Forecast) -------------------

def train_regression(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    print(f"\n[Regression] target={target}")
    data = df[REGRESSION_FEATURES + [target]].dropna(subset=[target])
    X = data[REGRESSION_FEATURES].fillna(0)
    y = data[target]

    if len(X) < 10:
        print("  [SKIP] Not enough data.")
        return

    tscv = TimeSeriesSplit(n_splits=3)
    model = XGBRegressor(
        n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, n_jobs=-1, verbosity=0,
    )
    scores = cross_val_score(model, X, y, cv=tscv,
                             scoring="neg_mean_absolute_percentage_error")
    wape_cv = wape(y.values, model.fit(X, y).predict(X))
    print(f"  WAPE (train):  {wape_cv:.2f}%")
    print(f"  MAPE (cv):     {-scores.mean()*100:.2f}%")

    model.fit(X, y)
    out = os.path.join(MODELS_DIR, "xgboost_regression.joblib")
    joblib.dump({"model": model, "features": REGRESSION_FEATURES, "target": target}, out)
    print(f"  Saved -> {out}")


# ---- Classification (Parish Cluster / Pastoral Assignment State) -----------

def train_classification(df: pd.DataFrame, target_col: str,
                          label_name: str = "cluster") -> None:
    print(f"\n[Classification] target={target_col}")
    data = df[CLASSIFICATION_FEATURES + [target_col]].dropna(subset=[target_col])

    if len(data) < 10 or data[target_col].nunique() < 2:
        print("  [SKIP] Not enough labeled data.")
        return

    le = LabelEncoder()
    y = le.fit_transform(data[target_col])
    X = data[CLASSIFICATION_FEATURES].fillna(0)

    model = XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        use_label_encoder=False, eval_metric="mlogloss",
        random_state=42, n_jobs=-1, verbosity=0,
    )
    scores = cross_val_score(model, X, y, cv=3, scoring="f1_macro")
    print(f"  F1 macro (cv): {scores.mean():.3f} +/- {scores.std():.3f}")

    model.fit(X, y)
    out = os.path.join(MODELS_DIR, f"xgboost_classifier_{label_name}.joblib")
    joblib.dump({
        "model": model, "label_encoder": le,
        "features": CLASSIFICATION_FEATURES, "target": target_col,
    }, out)
    print(f"  Saved -> {out}")


if __name__ == "__main__":
    print("XGBoost -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)

    # Regression targets
    train_regression(df, target="total_receipts_final")

    # Classification targets (uncomment when label columns exist)
    # train_classification(df, target_col="parish_cluster", label_name="parish_cluster")
    # train_classification(df, target_col="financial_state", label_name="financial_state")
    # train_classification(df, target_col="project_success", label_name="project_success")
