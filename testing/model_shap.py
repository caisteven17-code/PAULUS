"""
SHAP  (SHapley Additive exPlanations)
======================================
Tier  : Diagnostic Analytics
Uses  : Priest and Financial Diagnostic (root-cause attribution)
        Cluster and Seasonal Diagnostic (parish root-cause attribution)
        Project Risk Diagnostic
KPI   : Root-Cause Attribution Precision >= 85%

Requires a trained XGBoost or Random Forest model artifact from model_xgboost.py.
Produces per-parish SHAP feature importance and root-cause ranking.

Run: python model_shap.py

INSTRUCTIONS
------------
Status  : [needs model first] — run model_xgboost.py before this one
Step 1  : pip install shap pandas numpy joblib xgboost
Step 2  : Run model_xgboost.py first to generate the required artifact:
            python model_xgboost.py
          This creates models/xgboost_regression.joblib which SHAP reads.
Step 3  : python model_shap.py
Output  : models/shap_values.joblib
          Contains: SHAP values array, feature list, global importance
          table, and parish names.
KPI tip : Root-Cause Attribution Precision >= 85%.  The top root-cause
          driver is printed per parish — cross-check with domain experts
          to validate that the top SHAP feature makes financial sense.
Note    : If you see "[SKIP] Train XGBoost first", run model_xgboost.py
          and try again.  SHAP uses TreeExplainer which is exact (not
          approximate) for XGBoost models.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
import shap

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH     = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")
MODEL_PATH   = os.path.join(MODELS_DIR, "xgboost_regression.joblib")


def explain(df: pd.DataFrame) -> None:
    if not os.path.exists(MODEL_PATH):
        print(f"[SKIP] Train XGBoost first: python model_xgboost.py")
        return

    artifact = joblib.load(MODEL_PATH)
    model    = artifact["model"]
    features = artifact["features"]

    data = df[features + ["parish_name", "month"]].fillna(0)
    X    = data[features]

    if len(X) == 0:
        print("[SKIP] No rows to explain.")
        return

    # TreeExplainer is exact for XGBoost / RF
    explainer   = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)

    shap_df = pd.DataFrame(shap_values, columns=features)
    shap_df["parish_name"] = data["parish_name"].values
    shap_df["month"]       = data["month"].values

    # Global feature importance (mean |SHAP|)
    importance = pd.DataFrame({
        "feature":    features,
        "mean_abs_shap": np.abs(shap_values).mean(axis=0),
    }).sort_values("mean_abs_shap", ascending=False)

    print("Global Feature Importance (mean |SHAP|):")
    print(importance.to_string(index=False))

    # Per-parish top root-cause driver
    print("\nTop root-cause driver per parish:")
    for parish in data["parish_name"].unique():
        idx = data[data["parish_name"] == parish].index.tolist()
        if not idx:
            continue
        parish_shap = np.abs(shap_values[idx]).mean(axis=0)
        top_feature = features[int(np.argmax(parish_shap))]
        top_impact  = parish_shap.max()
        print(f"  {parish:<55} -> {top_feature} (|SHAP| = {top_impact:.4f})")

    out = os.path.join(MODELS_DIR, "shap_values.joblib")
    joblib.dump({
        "shap_values":  shap_values,
        "features":     features,
        "importance":   importance.to_dict(orient="records"),
        "parish_names": data["parish_name"].tolist(),
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("SHAP Analysis -- Explaining XGBoost model\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    explain(df)
