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
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
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
from sklearn.compose import TransformedTargetRegressor
from sklearn.metrics import make_scorer
from sklearn.preprocessing import RobustScaler, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, TimeSeriesSplit, StratifiedKFold

from utils import load_data, engineer_features, MODELS_DIR, print_forecast_evaluation, wape

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

REGRESSION_FEATURES = [
    "month_num", "month_sin", "month_cos",
    "sacraments_rate",
    "collections_lag1", "collections_lag2",
    "collections_roll3", "collections_mom_growth",
    "net_margin",
    "liturgical_major_days", "liturgical_penitential_days",
    "liturgical_advent_days", "liturgical_christmas_days",
    "liturgical_lent_days", "liturgical_easter_days",
    "liturgical_triduum_days",
]

CLASSIFICATION_FEATURES = [
    "parish_id", "month_num",
    "sacraments_rate", "collections_zscore",
    "net_margin", "collections_roll3",
    "parish_mean_collections", "parish_std_collections",
    "liturgical_major_days", "liturgical_penitential_days",
]


def train_regression(df: pd.DataFrame,
                     target: str = "total_receipts_final") -> None:
    print(f"\n[MLP Regression] target={target}")
    data = df[["parish_name"] + REGRESSION_FEATURES + [target]].dropna(subset=[target])
    X = pd.get_dummies(data[["parish_name"] + REGRESSION_FEATURES], columns=["parish_name"], drop_first=True).fillna(0)
    y = data[target].clip(lower=0)

    if len(X) < 10:
        print("  [SKIP] Not enough data.")
        return

    model = TransformedTargetRegressor(
        regressor=Pipeline([
            ("scaler", RobustScaler()),
            ("mlp",    MLPRegressor(
                hidden_layer_sizes=(64, 32),
                activation="relu",
                alpha=0.001,
                max_iter=500,
                early_stopping=True,
                validation_fraction=0.1,
                random_state=42,
            )),
        ]),
        func=np.log1p,
        inverse_func=np.expm1,
    )

    tscv   = TimeSeriesSplit(n_splits=3)
    scores = cross_val_score(model, X, y, cv=tscv,
                             scoring=make_scorer(wape, greater_is_better=False))
    model.fit(X, y)
    preds = np.maximum(model.predict(X), 0)
    print(f"  WAPE (cv):    {-scores.mean():.2f}%")
    summary, per_parish = print_forecast_evaluation("  MLP train", y.values, preds, groups=data["parish_name"])

    out = os.path.join(MODELS_DIR, "mlp_regression.joblib")
    joblib.dump({
        "model": model,
        "features": list(X.columns),
        "target": target,
        "evaluation": summary,
        "per_parish_evaluation": per_parish.to_dict(orient="records"),
    }, out)
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
    df = load_data()
    df = engineer_features(df)

    train_regression(df, target="total_receipts_final")
    # train_classification(df, target_col="project_success")  # enable when project data is added
    export_model_dashboard_preview("MLP", df)
