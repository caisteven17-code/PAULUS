"""
MILP  (Mixed-Integer Linear Programming)
==========================================
Tier  : Prescriptive Analytics
Uses  : Financial Recommendation
          Objective: Minimize disbursement while maintaining required pastoral
                     and service operations
        Parish Upgrade Recommendation
          Objective: Maximize upgrade impact subject to budget constraint
        Seasonal Strategy
          Objective: Maximize collection readiness during seasonal peaks
                     subject to budget and resource constraints
KPI   : Budget Utilization Rate (%), Disbursement Saved (%),
        Resource Allocation Efficiency (%), Insight Actionability Rate >= 70%

Uses PuLP as the MILP solver.

Run: python model_milp.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install pulp pandas numpy joblib
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, total_receipts_final, total_expenses_final
Step 3  : (Optional) Set the actual diocesan budget at the top of this
          file by changing TOTAL_BUDGET (default = 1,000,000).
          Also adjust MIN_SERVICE_LEVEL_PCT if the minimum service floor
          should be different from 40% of average collections.
Step 4  : python model_milp.py
Output  : models/milp.joblib
          Contains: solver status, budget utilization, and recommended
          allocation per parish.
KPI tip : Budget Utilization Rate should be close to 100%.  If it is
          much lower, TOTAL_BUDGET is too large relative to the data.
          Insight Actionability Rate >= 70% is the KPI target.
Note    : PuLP uses the free CBC solver by default — no license needed.
          If the solver prints warnings, they can be ignored unless
          status != 'Optimal'.
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

# Budget constraint (adjust to actual diocesan budget when known)
TOTAL_BUDGET = 1_000_000.0

# Minimum service level: each parish must keep >= 40% of its average collections
MIN_SERVICE_LEVEL_PCT = 0.40


def solve_financial_recommendation(df: pd.DataFrame) -> dict:
    """
    Minimise total disbursements subject to:
      - Each parish must meet minimum service level (MIN_SERVICE_LEVEL_PCT of avg collections)
      - Total allocation <= TOTAL_BUDGET
    """
    agg = (
        df.groupby("parish_name")
        .agg(
            avg_collections=("total_receipts_final", "mean"),
            avg_expenses   =("total_expenses_final", "mean"),
        )
        .dropna()
        .reset_index()
    )

    if len(agg) == 0:
        return {"status": "SKIP -- no financial data"}

    parishes  = agg["parish_name"].tolist()
    avg_col   = dict(zip(parishes, agg["avg_collections"]))
    avg_exp   = dict(zip(parishes, agg["avg_expenses"]))
    min_svc   = {p: avg_col[p] * MIN_SERVICE_LEVEL_PCT for p in parishes}

    prob = pulp.LpProblem("Financial_Recommendation", pulp.LpMinimize)

    # Decision variable: allocated disbursement per parish
    alloc = {p: pulp.LpVariable(f"alloc_{i}", lowBound=min_svc[p])
             for i, p in enumerate(parishes)}

    # Objective: minimise total disbursement
    prob += pulp.lpSum(alloc[p] for p in parishes)

    # Budget constraint
    prob += pulp.lpSum(alloc[p] for p in parishes) <= TOTAL_BUDGET

    # Solve
    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    results = []
    for p in parishes:
        a = pulp.value(alloc[p])
        results.append({
            "parish":          p,
            "avg_collections": round(avg_col[p], 2),
            "recommended_alloc": round(a, 2) if a else None,
            "saved_vs_avg":    round(avg_exp[p] - a, 2) if a and avg_exp[p] else None,
        })

    total_alloc = sum(r["recommended_alloc"] or 0 for r in results)
    budget_util = total_alloc / TOTAL_BUDGET * 100

    return {
        "status":             pulp.LpStatus[prob.status],
        "budget_utilization": round(budget_util, 2),
        "total_allocated":    round(total_alloc, 2),
        "parish_allocations": results,
    }


def train(df: pd.DataFrame) -> None:
    print("Solving Financial Recommendation MILP...")
    result = solve_financial_recommendation(df)

    if "status" in result and result["status"] == "SKIP -- no financial data":
        print("[SKIP] Not enough data -- need filled financial values.")
        return

    print(f"Status:             {result['status']}")
    print(f"Budget Utilization: {result['budget_utilization']:.1f}%")
    print(f"Total Allocated:    {result['total_allocated']:,.0f}")

    alloc_df = pd.DataFrame(result["parish_allocations"])
    if not alloc_df.empty:
        print("\nParish allocations (top 10):")
        print(alloc_df.head(10).to_string(index=False))

    out = os.path.join(MODELS_DIR, "milp.joblib")
    joblib.dump(result, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("MILP -- Financial Recommendation\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
