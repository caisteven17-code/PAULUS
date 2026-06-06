"""
Prescriptive: Institution Simulation (Digital Twin)
Scenario-based projection of financials + health score trajectory + sensitivity analysis.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_table


def _compute_health_score(avg_receipts: float, avg_expenses: float, avg_consumable: float) -> float:
    liquidity = max(0.0, min(100.0, safe_div(avg_receipts, avg_expenses or 1) * 100 - 50))
    sustainability = max(0.0, min(100.0, (safe_div(avg_consumable, avg_expenses or 1) - 0.4) * 125))
    efficiency = max(0.0, min(100.0, 100 - (safe_div(avg_expenses, avg_receipts or 1) - 0.5) * 100))
    return round(liquidity * 0.30 + sustainability * 0.25 + efficiency * 0.45, 2)


def _run_simulation(
    baseline_receipts: np.ndarray,
    baseline_expenses: np.ndarray,
    consumable_avg: float,
    collection_change_pct: float,
    expense_change_pct: float,
    periods: int,
) -> tuple[list[dict], list[dict]]:
    """Project financials forward and compute health score per period."""
    last_r = float(baseline_receipts[-1])
    last_e = float(baseline_expenses[-1])
    r_growth = 1 + collection_change_pct / 100
    e_growth = 1 + expense_change_pct / 100

    monthly: list[dict] = []
    health_traj: list[dict] = []
    base_date = pd.Timestamp.today().replace(day=1)

    for i in range(periods):
        period_date = (base_date + pd.DateOffset(months=i + 1)).strftime("%Y-%m")
        sim_r = last_r * (r_growth ** (i + 1))
        sim_e = last_e * (e_growth ** (i + 1))
        monthly.append(
            {
                "period": period_date,
                "simulated_receipts": round(sim_r, 2),
                "simulated_expenses": round(sim_e, 2),
                "net": round(sim_r - sim_e, 2),
            }
        )
        score = _compute_health_score(sim_r, sim_e, consumable_avg)
        health_traj.append({"period": period_date, "health_score": score})

    return monthly, health_traj


def _sensitivity_analysis(
    baseline_receipts: np.ndarray,
    baseline_expenses: np.ndarray,
    consumable_avg: float,
    base_cr: float,
    base_er: float,
    periods: int,
) -> dict[str, Any]:
    """Vary each parameter ±10% and report impact on terminal health score."""
    results: dict[str, Any] = {}
    params = {
        "collection_change_pct": base_cr,
        "expense_change_pct": base_er,
    }
    deltas = [-10, 10]

    for param, base_val in params.items():
        impacts: dict[str, float] = {}
        for delta in deltas:
            test_params = params.copy()
            test_params[param] = base_val + delta
            _, health_traj = _run_simulation(
                baseline_receipts,
                baseline_expenses,
                consumable_avg,
                test_params["collection_change_pct"],
                test_params["expense_change_pct"],
                periods,
            )
            terminal_score = health_traj[-1]["health_score"] if health_traj else 0.0
            impacts[f"{'+' if delta > 0 else ''}{delta}pct"] = terminal_score
        results[param] = impacts

    return results


def _fetch_baseline(institution_id: str, entity_type: str) -> tuple[np.ndarray, np.ndarray, float]:
    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    res = (
        get_table(schema, "financial_records")
        .select(", ".join(select_cols))
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    if not res.data:
        return np.array([1000.0]), np.array([900.0]), 200.0

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)

    consumable_avg = float(df[consumable_col].mean()) if consumable_col in df.columns else 0.0

    return (
        df["total_receipts"].values.astype(float),
        df["total_expenses"].values.astype(float),
        consumable_avg,
    )


def _run_scenario(
    institution_id: str,
    entity_type: str,
    collection_change_pct: float,
    expense_change_pct: float,
    periods: int,
) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    baseline_r, baseline_e, consumable_avg = _fetch_baseline(institution_id, entity_type)

    monthly, health_traj = _run_simulation(
        baseline_r,
        baseline_e,
        consumable_avg,
        collection_change_pct,
        expense_change_pct,
        periods,
    )

    sensitivity = _sensitivity_analysis(
        baseline_r,
        baseline_e,
        consumable_avg,
        collection_change_pct,
        expense_change_pct,
        periods,
    )

    return {
        "entity_id": institution_id,
        "entity_type": entity_type,
        "scenario_params": {
            "collection_change_pct": collection_change_pct,
            "expense_change_pct": expense_change_pct,
            "periods": periods,
        },
        "simulated_monthly": monthly,
        "health_score_trajectory": health_traj,
        "sensitivity_results": sensitivity,
        "timestamp": ts,
    }


async def run_institution_simulation(
    institution_id: str,
    entity_type: str,
    collection_change_pct: float = 0.0,
    expense_change_pct: float = 0.0,
    periods: int = 12,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(
        _run_scenario,
        institution_id,
        entity_type,
        collection_change_pct,
        expense_change_pct,
        periods,
    )
