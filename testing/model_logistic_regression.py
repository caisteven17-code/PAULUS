"""
Logistic Regression
===================
Tier  : Predictive Analytics
Uses  : Project Success Rate Forecast (binary: success / failure)
Target: Categorical -- binary project success/failure
KPI   : F1 Score, Precision, Recall, Balanced Accuracy, Brier Score

Features are derived from project financial metrics:
budget_variance, progress_gap, fund_raising_progress, etc.
(these columns come from the projects table; add them to the CSV when available)

Run: python model_logistic_regression.py

INSTRUCTIONS
------------
Status  : [needs data] — project columns are not yet in the CSV

Step 1  : pip install scikit-learn pandas numpy joblib
Step 2  : Add the following columns to the CSV from the diocese.projects
          table (one row per project):
            budget_vs_target_pct       — (amount_raised / target) * 100
            fund_raising_progress_pct  — % of fundraising goal reached
            schedule_variance_days     — days behind (positive) or ahead
                                         (negative) of deadline
            donor_count                — number of unique donors
            project_success            — 1 = success, 0 = failure
          The following are already in the CSV or engineered:
            parish_mean_collections, month_num
Step 3  : python model_logistic_regression.py
Output  : models/logistic_regression.joblib  (Pipeline: scaler + classifier)
KPI tip : F1 >= 0.70 and Brier Score <= 0.25 are the targets.
          If F1 is low, check that project_success has both 0 and 1 values
          and that you have at least 10 labeled project rows.
Note    : Running now will print "[SKIP] Missing columns" until the project
          data is added — that is expected and safe.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import (
    f1_score, precision_score, recall_score,
    balanced_accuracy_score, brier_score_loss, classification_report,
)

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

# These columns must exist in the dataset (add from projects table)
PROJECT_FEATURES = [
    "budget_vs_target_pct",      # (amount_raised / target) * 100
    "fund_raising_progress_pct", # % of goal reached
    "schedule_variance_days",    # days behind/ahead of deadline
    "donor_count",               # number of unique donors
    "parish_mean_collections",   # financial capacity proxy
    "month_num",                 # submission month
]
TARGET_COL = "project_success"   # 1 = success, 0 = failure


def train(df: pd.DataFrame) -> None:
    missing_cols = [c for c in PROJECT_FEATURES + [TARGET_COL] if c not in df.columns]
    if missing_cols:
        print(f"[SKIP] Missing columns: {missing_cols}")
        print("  Add project data to the CSV from the diocese.projects table.")
        return

    data = df[PROJECT_FEATURES + [TARGET_COL]].dropna(subset=[TARGET_COL])
    X = data[PROJECT_FEATURES].fillna(0)
    y = data[TARGET_COL].astype(int)

    if len(X) < 10 or y.nunique() < 2:
        print("[SKIP] Not enough labeled project records.")
        return

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf",    LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=42,
        )),
    ])

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    f1_scores  = cross_val_score(model, X, y, cv=cv, scoring="f1")
    brier_vals = cross_val_score(model, X, y, cv=cv, scoring="neg_brier_score")

    print(f"F1 (cv):     {f1_scores.mean():.3f} +/- {f1_scores.std():.3f}")
    print(f"Brier (cv):  {-brier_vals.mean():.3f}")

    model.fit(X, y)
    y_pred  = model.predict(X)
    y_proba = model.predict_proba(X)[:, 1]

    print(f"\nPrecision:         {precision_score(y, y_pred):.3f}")
    print(f"Recall:            {recall_score(y, y_pred):.3f}")
    print(f"Balanced Accuracy: {balanced_accuracy_score(y, y_pred):.3f}")
    print(f"Brier Score:       {brier_score_loss(y, y_proba):.3f}")
    print("\n" + classification_report(y, y_pred, target_names=["Failure","Success"]))

    out = os.path.join(MODELS_DIR, "logistic_regression.joblib")
    joblib.dump({"model": model, "features": PROJECT_FEATURES}, out)
    print(f"Saved -> {out}")


if __name__ == "__main__":
    print("Logistic Regression -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
