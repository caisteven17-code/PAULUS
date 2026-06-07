"""
MLP  (Multi-Layer Perceptron)
==============================
Tier  : Prescriptive Analytics
Uses  : Pastoral Assignment Financial Action
          (performance improvement prediction)
        Project Portfolio & Resource Recommendation
          (project completion rate, resource utilization)
KPI   : Performance Improvement Target (%)
        Project Completion Rate (%), Delayed Project Rate (%),
        Resource Utilization Rate (%), Project Success Rate (%)

Two variants trained:
  - mlp_regression   : predict performance improvement target per parish
  - mlp_classification: predict project success/completion probability

Run: python model_mlp.py

INSTRUCTIONS
------------
Status (regression)     : [runs now]
Status (classification) : [needs data] — project_success column not yet in CSV

Step 1  : pip install scikit-learn pandas numpy joblib
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final,
            total_expenses_final
          The following are computed by engineer_features():
            parish_id, month_sin, month_cos, sacraments_rate,
            collections_lag1/2, collections_roll3, collections_mom_growth,
            parish_mean_collections, parish_std_collections,
            collections_zscore, net_margin
Step 3  : python model_mlp.py
          Regression runs by default.  To enable classification, add
          project_success (1/0) to the CSV and uncomment the last line:
            train_classification(df, target_col="project_success")
Output  : models/mlp_regression.joblib       (regression variant)
          models/mlp_classification.joblib   (when classification enabled)
KPI tip : Regression WAPE <= 15%.  Classification F1-macro >= 0.70.
          MLP is sensitive to data scale — the Pipeline handles
          StandardScaler automatically, so no manual scaling is needed.
Note    : early_stopping=True means training stops when the validation
          loss stops improving — safe to increase max_iter to 1000 for
          larger datasets without risk of overfitting.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from sklearn.neural_network import MLPRegressor, MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, TimeSeriesSplit, StratifiedKFold
from sklearn.metrics import mean_absolute_percentage_error

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

REGRESSION_FEATURES = [
    "parish_id", "month_num", "month_sin", "month_cos",
    "sacraments_rate",
    "collections_lag1", "collections_lag2",
    "collections_roll3", "collections_mom_growth",
    "parish_mean_collections", "net_margin",
]

CLASSIFICATION_FEATURES = [
    "parish_id", "month_num",
    "sacraments_rate", "collections_zscore",
    "net_margin", "collections_roll3",
    "parish_mean_collections", "parish_std_collections",
]


def wape(y_true, y_pred) -> float:
    return np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + 1e-8) * 100


def train_regression(df: pd.DataFrame,
                     target: str = "total_receipts_final") -> None:
    print(f"\n[MLP Regression] target={target}")
    data = df[REGRESSION_FEATURES + [target]].dropna(subset=[target])
    X = data[REGRESSION_FEATURES].fillna(0)
    y = data[target]

    if len(X) < 10:
        print("  [SKIP] Not enough data.")
        return

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp",    MLPRegressor(
            hidden_layer_sizes=(128, 64, 32),
            activation="relu",
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.1,
            random_state=42,
        )),
    ])

    tscv   = TimeSeriesSplit(n_splits=3)
    scores = cross_val_score(model, X, y, cv=tscv,
                             scoring="neg_mean_absolute_percentage_error")
    model.fit(X, y)
    w = wape(y.values, model.predict(X))

    print(f"  MAPE (cv):    {-scores.mean()*100:.2f}%")
    print(f"  WAPE (train): {w:.2f}%")

    out = os.path.join(MODELS_DIR, "mlp_regression.joblib")
    joblib.dump({"model": model, "features": REGRESSION_FEATURES, "target": target}, out)
    print(f"  Saved -> {out}")


def train_classification(df: pd.DataFrame,
                          target_col: str = "project_success") -> None:
    print(f"\n[MLP Classification] target={target_col}")
    if target_col not in df.columns:
        print(f"  [SKIP] Column '{target_col}' not in dataset -- add from projects table.")
        return

    data = df[CLASSIFICATION_FEATURES + [target_col]].dropna(subset=[target_col])
    X = data[CLASSIFICATION_FEATURES].fillna(0)
    y = data[target_col].astype(int)

    if len(X) < 10 or y.nunique() < 2:
        print("  [SKIP] Not enough labeled data.")
        return

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp",    MLPClassifier(
            hidden_layer_sizes=(64, 32),
            activation="relu",
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.1,
            random_state=42,
        )),
    ])

    cv     = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring="f1_macro")
    print(f"  F1 macro (cv): {scores.mean():.3f} +/- {scores.std():.3f}")

    model.fit(X, y)
    out = os.path.join(MODELS_DIR, "mlp_classification.joblib")
    joblib.dump({"model": model, "features": CLASSIFICATION_FEATURES, "target": target_col}, out)
    print(f"  Saved -> {out}")


if __name__ == "__main__":
    print("MLP -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)

    train_regression(df, target="total_receipts_final")
    # train_classification(df, target_col="project_success")  # enable when project data is added
