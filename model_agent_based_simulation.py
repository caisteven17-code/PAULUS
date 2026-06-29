"""
Agent-Based Simulation
=======================
Tier  : Prescriptive Analytics
Uses  : Institution Simulation (What-If Analysis + Sensitivity Analysis)
        Pastoral Assignment Simulation
KPI   : Scenario Processing Latency, Simulation Accuracy,
        Realized Outcome (%), Forecast-to-Simulation Error (%),
        Decision-Quality Lift (%), Scenario Coverage Rate (%)

Each parish is an agent whose collections respond to:
  - Assignment changes (priest reassignment shock)
  - Seasonal factors (liturgical calendar multipliers)
  - Budget interventions (additional pastoral funding)

Run: python model_agent_based_simulation.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install pandas numpy joblib
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, total_receipts_final, total_expenses_final
Step 3  : (Optional) Adjust what-if scenarios at the top of this file
          inside the SHOCKS dictionary.  Each scenario is a dict of:
            priest_change  — % impact of priest reassignment (e.g. -0.10)
            budget_boost   — % increase in diocesan budget (e.g. 0.10)
            seasonal       — % lift from liturgical season (e.g. 0.25)
Step 4  : python model_agent_based_simulation.py
Output  : models/agent_based_simulation.joblib
          Contains: scenario results (net receipts per scenario),
          number of agents, steps simulated, and shock parameters.
KPI tip : Forecast-to-Simulation Error should be < 20%.  High error
          means the CSV average collections differ greatly from the
          simulation baseline — check for missing/zero values in the CSV.
Note    : Simulation runs 12 months (N_STEPS) and 5 scenarios by default.
          Change N_STEPS for longer projections, and add entries to SHOCKS
          for additional what-if scenarios.
"""

import os
import warnings
import time
import pandas as pd
import numpy as np
import joblib

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

N_STEPS       = 12    # simulate 12 months forward
N_SCENARIOS   = 5     # number of what-if scenarios to run
RANDOM_SEED   = 42

# Sensitivity parameters (shock magnitudes as % change)
SHOCKS = {
    "baseline":            {"priest_change": 0.0,   "budget_boost": 0.0,   "seasonal": 0.0},
    "priest_reassigned":   {"priest_change": -0.10, "budget_boost": 0.0,   "seasonal": 0.0},
    "budget_increased_10": {"priest_change": 0.0,   "budget_boost": 0.10,  "seasonal": 0.0},
    "high_season":         {"priest_change": 0.0,   "budget_boost": 0.0,   "seasonal": 0.25},
    "combined_stress":     {"priest_change": -0.15, "budget_boost": 0.05,  "seasonal": -0.10},
}


class ParishAgent:
    def __init__(self, name: str, base_collections: float,
                 base_expenses: float, volatility: float):
        self.name             = name
        self.base_collections = max(base_collections, 0)
        self.base_expenses    = max(base_expenses, 0)
        self.volatility       = max(volatility, 0.01)

    def step(self, month: int, shock: dict, rng: np.random.Generator) -> dict:
        seasonal_m = 1.0 + 0.15 * np.sin(2 * np.pi * month / 12)
        noise      = rng.normal(0, self.volatility)

        collections = (
            self.base_collections
            * seasonal_m
            * (1 + shock["priest_change"])
            * (1 + shock["seasonal"])
            * (1 + shock["budget_boost"] * 0.5)
            * (1 + noise)
        )
        expenses = (
            self.base_expenses
            * (1 + shock["budget_boost"])
            * (1 + noise * 0.3)
        )
        return {
            "month":        month,
            "collections":  max(collections, 0),
            "expenses":     max(expenses, 0),
            "net_receipts": max(collections, 0) - max(expenses, 0),
        }


def build_agents(df: pd.DataFrame) -> list:
    summary = (
        df.groupby("parish_name")
        .agg(
            base_collections=("total_receipts_final", "mean"),
            base_expenses   =("total_expenses_final", "mean"),
            volatility      =("total_receipts_final", "std"),
        )
        .fillna(0)
        .reset_index()
    )
    return [
        ParishAgent(r["parish_name"], r["base_collections"],
                    r["base_expenses"], r["volatility"])
        for _, r in summary.iterrows()
    ]


def run_scenario(agents: list, shock: dict, n_steps: int) -> pd.DataFrame:
    rng     = np.random.default_rng(RANDOM_SEED)
    records = []
    for agent in agents:
        for month in range(1, n_steps + 1):
            row = agent.step(month, shock, rng)
            row["parish"] = agent.name
            records.append(row)
    return pd.DataFrame(records)


def train(df: pd.DataFrame) -> None:
    agents = build_agents(df)

    if not agents:
        print("[SKIP] Not enough data -- need filled financial values.")
        return

    print(f"Agents initialised: {len(agents)} parishes")
    scenario_results = {}

    for scenario_name, shock in SHOCKS.items():
        t0     = time.perf_counter()
        result = run_scenario(agents, shock, N_STEPS)
        latency_ms = (time.perf_counter() - t0) * 1000

        total_col = result["collections"].sum()
        total_exp = result["expenses"].sum()
        net_total = result["net_receipts"].sum()

        scenario_results[scenario_name] = {
            "latency_ms":       round(latency_ms, 2),
            "total_collections": round(total_col, 2),
            "total_expenses":    round(total_exp, 2),
            "net_receipts":      round(net_total, 2),
        }
        print(f"  {scenario_name:<25} net={net_total:>12,.0f}  latency={latency_ms:.1f}ms")

    # Forecast-to-Simulation Error: compare baseline to current average
    baseline = scenario_results["baseline"]
    parish_avg = df["total_receipts_final"].mean() * N_STEPS * len(agents)
    fts_error = abs(baseline["total_collections"] - parish_avg) / (parish_avg + 1e-8) * 100
    print(f"\nForecast-to-Simulation Error: {fts_error:.1f}%")

    out = os.path.join(MODELS_DIR, "agent_based_simulation.joblib")
    joblib.dump({
        "scenario_results": scenario_results,
        "n_agents":         len(agents),
        "n_steps":          N_STEPS,
        "shocks":           SHOCKS,
    }, out)
    print(f"Saved -> {out}")


if __name__ == "__main__":
    print("Agent-Based Simulation -- Running\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Agent-Based Simulation", df)
