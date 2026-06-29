"""
Multiple Linear Regression (with Control Variables)
====================================================
Tier  : Diagnostic Analytics
Uses  : Priest and Financial Diagnostic
        (root-cause indicator, gauge score, financial-priest association)
KPI   : Diagnostic Precision >= 85% (expert-validated)
        Root-Cause Attribution Precision >= 85%

Uses statsmodels OLS so we get full p-values, confidence intervals,
VIF, and partial correlations -- required for causal inference layer.

Target: total_receipts_final (or net_margin)
Key predictors: sacraments_rate, month_num, parish_id, assignment duration proxy

Run: python model_multiple_linear_regression.py

INSTRUCTIONS
------------
Status  : [runs now] — all predictor columns are engineered automatically
Step 1  : pip install statsmodels pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
          The following are computed by engineer_features():
            sacraments_rate, month_sin, month_cos, parish_id,
            collections_lag1, parish_mean_collections
Step 3  : python model_multiple_linear_regression.py
Output  : models/multiple_linear_regression.joblib
          Contains: fitted OLS model, predictor list, params, p-values,
          and R-squared.
KPI tip : R-squared should be >= 0.60 for useful diagnostic inference.
          VIF > 10 means multicollinearity — the "[!] High VIF" warning
          will tell you which predictors to remove.
          p-values > 0.05 on a predictor mean it is not statistically
          significant — consider dropping it from PREDICTORS list.
Note    : This model uses statsmodels (not sklearn) to provide full
          coefficient tables, p-values, and confidence intervals needed
          for causal interpretation.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

from utils import load_data, engineer_features, MODELS_DIR, print_forecast_evaluation

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

PREDICTORS = [
    "month_num",
    "month_sin",
    "month_cos",
    "collections_lag1",
]
TARGET = "total_receipts_final"


def compute_vif(X: pd.DataFrame) -> pd.DataFrame:
    vif_data = pd.DataFrame()
    vif_data["feature"] = X.columns
    vif_data["VIF"] = [
        variance_inflation_factor(X.values, i) for i in range(X.shape[1])
    ]
    return vif_data


def train(df: pd.DataFrame) -> None:
    data = df[["parish_name"] + PREDICTORS + [TARGET]].dropna(subset=[TARGET])
    X = pd.get_dummies(data[["parish_name"] + PREDICTORS], columns=["parish_name"], drop_first=True).fillna(0)
    X = X.astype(float)
    y = data[TARGET]

    if len(X) < 10:
        print("[SKIP] Not enough data -- need filled financial values.")
        return

    X_const = sm.add_constant(X)
    model   = sm.OLS(y, X_const).fit()

    print(model.summary())

    # VIF check
    vif = compute_vif(X)
    print("\nVIF (multicollinearity check):")
    print(vif.to_string(index=False))
    high_vif = vif[vif["VIF"] > 10]
    if not high_vif.empty:
        print(f"\n[!] High VIF detected: {high_vif['feature'].tolist()} -- consider removing.")

    # Partial correlations
    print("\nPartial correlations with target:")
    for col in X.columns:
        partial_r = np.corrcoef(X[col], y)[0, 1]
        print(f"  {col:<30} r = {partial_r:.3f}")

    # In-sample WAPE is stable when monthly receipts include zero values.
    preds = model.predict(X_const)
    summary, per_parish = print_forecast_evaluation("OLS in-sample", y, preds, groups=data["parish_name"])
    print(f"R-squared:      {model.rsquared:.3f}")
    print(f"Adj R-squared:  {model.rsquared_adj:.3f}")

    out = os.path.join(MODELS_DIR, "multiple_linear_regression.joblib")
    joblib.dump({
        "model":      model,
        "predictors": list(X.columns),
        "target":     TARGET,
        "params":     model.params.to_dict(),
        "pvalues":    model.pvalues.to_dict(),
        "rsquared":   model.rsquared,
        "evaluation": summary,
        "per_parish_evaluation": per_parish.to_dict(orient="records"),
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Multiple Linear Regression -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Multiple Linear Regression", df)
