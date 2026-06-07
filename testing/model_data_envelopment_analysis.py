"""
Data Envelopment Analysis (DEA)
================================
Tier  : Prescriptive Analytics
Uses  : Pastoral Assignment Financial Action
          (relative efficiency of priest assignments)
        Parish Upgrade Recommendation
          (identify inefficient parishes that are upgrade candidates)
KPI   : Performance Improvement Target (%), Insight Actionability Rate >= 70%

BCC (variable returns to scale) input-oriented DEA model solved with PuLP.
Inputs : total_expenses_final (resources used)
Outputs: total_receipts_final (collections generated), net_receipts_deficit

Run: python model_data_envelopment_analysis.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install pulp pandas numpy joblib
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, total_expenses_final, total_receipts_final
          (at least 3 parishes must have non-null values in both columns)
Step 3  : python model_data_envelopment_analysis.py
Output  : models/data_envelopment_analysis.joblib
          Contains: efficiency score and improvement target % per parish,
          plus the input/output column names used.
KPI tip : Insight Actionability Rate >= 70% (printed at the end).
          If it is below 70%, review the INPUT_COLS and OUTPUT_COLS
          at the top of the file — try adding net_receipts_deficit as a
          second output column for a more nuanced efficiency measure.
Interpreting scores:
    1.00  — fully efficient (best-practice benchmark)
    < 1.0 — inefficient; improvement_target_% shows how much input
             reduction would make them efficient
Note    : Needs at least 3 parishes with non-null financial data.
          Uses BCC (variable returns to scale) model — appropriate when
          parishes differ significantly in size.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
import pulp

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

INPUT_COLS  = ["total_expenses_final"]
OUTPUT_COLS = ["total_receipts_final"]


def run_dea_bcc(inputs: np.ndarray, outputs: np.ndarray) -> np.ndarray:
    """
    BCC input-oriented DEA.
    Returns efficiency score in [0, 1] for each DMU (parish).
    """
    n = inputs.shape[0]
    scores = np.zeros(n)

    for i in range(n):
        prob = pulp.LpProblem(f"DEA_{i}", pulp.LpMinimize)

        theta   = pulp.LpVariable("theta", lowBound=0)
        lambdas = [pulp.LpVariable(f"lam_{j}", lowBound=0) for j in range(n)]

        prob += theta

        # Input constraints: theta * x_i >= sum(lam_j * x_j)
        for k in range(inputs.shape[1]):
            prob += (
                pulp.lpSum(lambdas[j] * inputs[j, k] for j in range(n))
                <= theta * inputs[i, k]
            )

        # Output constraints: sum(lam_j * y_j) >= y_i
        for k in range(outputs.shape[1]):
            prob += (
                pulp.lpSum(lambdas[j] * outputs[j, k] for j in range(n))
                >= outputs[i, k]
            )

        # BCC convexity constraint
        prob += pulp.lpSum(lambdas) == 1

        prob.solve(pulp.PULP_CBC_CMD(msg=0))
        scores[i] = pulp.value(theta) if pulp.value(theta) is not None else 0.0

    return np.clip(scores, 0, 1)


def train(df: pd.DataFrame) -> None:
    agg = (
        df.groupby("parish_name")
        .agg(**{c: (c, "mean") for c in INPUT_COLS + OUTPUT_COLS})
        .dropna()
        .reset_index()
    )

    if len(agg) < 3:
        print("[SKIP] Not enough data -- need filled financial values for at least 3 parishes.")
        return

    # Ensure positive values (DEA requires > 0)
    agg[OUTPUT_COLS] = agg[OUTPUT_COLS].clip(lower=0.01)
    agg[INPUT_COLS]  = agg[INPUT_COLS].clip(lower=0.01)

    inputs  = agg[INPUT_COLS].values.astype(float)
    outputs = agg[OUTPUT_COLS].values.astype(float)

    print(f"Running DEA on {len(agg)} parishes...")
    scores = run_dea_bcc(inputs, outputs)

    agg["efficiency_score"] = scores
    agg["efficient"] = (scores >= 0.99).astype(int)
    agg["improvement_target_%"] = ((1 - scores) * 100).round(2)

    print(agg[["parish_name", "efficiency_score", "improvement_target_%"]].to_string(index=False))

    efficient_count = agg["efficient"].sum()
    actionability   = (agg["improvement_target_%"] > 5).sum() / len(agg) * 100
    print(f"\nEfficient parishes (score >= 0.99): {efficient_count}/{len(agg)}")
    print(f"Insight Actionability Rate:          {actionability:.1f}%")

    if actionability < 70:
        print("[!] Actionability < 70% -- review input/output variable selection.")

    out = os.path.join(MODELS_DIR, "data_envelopment_analysis.joblib")
    joblib.dump({
        "scores":       agg[["parish_name","efficiency_score","improvement_target_%"]].to_dict(orient="records"),
        "input_cols":   INPUT_COLS,
        "output_cols":  OUTPUT_COLS,
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Data Envelopment Analysis -- Running\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
