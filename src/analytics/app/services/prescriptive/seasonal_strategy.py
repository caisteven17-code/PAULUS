"""
Prescriptive: Seasonality Strategy
MILP — maximize collection during peak seasons subject to operational resource constraints.
Sensitivity analysis on seasonal preparation investment.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

# Liturgical seasons and their months
_SEASONS = {
    "Christmas": [12],
    "Holy Week": [3, 4],
    "Pentecost": [5],
    "All Saints": [11],
    "Regular Season": [1, 2, 6, 7, 8, 9, 10],
}

# Operational cost weights per season (relative to baseline)
_SEASON_COST_WEIGHT = {
    "Christmas": 1.5,
    "Holy Week": 1.4,
    "Pentecost": 1.1,
    "All Saints": 1.1,
    "Regular Season": 1.0,
}


def _solve_seasonal_milp(
    season_avgs: dict[str, float],
    total_budget: float,
    max_preparation_per_season: float,
) -> dict[str, Any]:
    """
    MILP: choose how much to invest in each season's preparation.
    Variables: invest_s >= 0 for each season s
    Objective: maximize sum(collect_s + invest_s * return_rate_s)
    Constraints:
      sum(invest_s * cost_weight_s) <= total_budget
      invest_s <= max_preparation_per_season
    """
    try:
        import pulp

        seasons = list(season_avgs.keys())
        prob = pulp.LpProblem("SeasonalStrategy", pulp.LpMaximize)

        invest_vars = {
            s: pulp.LpVariable(f"invest_{s}", lowBound=0, upBound=max_preparation_per_season) for s in seasons
        }

        # Return rate: 20% of avg collection per unit invested (heuristic)
        return_rates = {s: 0.20 for s in seasons}
        # Peak seasons get higher return rate
        for s in ["Christmas", "Holy Week"]:
            if s in return_rates:
                return_rates[s] = 0.35

        # Maximize: fixed collection + investment return
        prob += pulp.lpSum(season_avgs[s] + invest_vars[s] * return_rates[s] for s in seasons)

        # Budget constraint
        prob += pulp.lpSum(invest_vars[s] * _SEASON_COST_WEIGHT.get(s, 1.0) for s in seasons) <= total_budget

        prob.solve(pulp.PULP_CBC_CMD(msg=0))

        allocation: dict[str, float] = {}
        for s in seasons:
            allocation[s] = round(float(invest_vars[s].varValue or 0), 2)

        total_invested = sum(allocation.values())
        efficiency = round(safe_div(total_invested, total_budget) * 100, 2)

        return {
            "method": "MILP",
            "optimal": prob.status == 1,
            "allocation": allocation,
            "total_invested": round(total_invested, 2),
            "allocation_efficiency": efficiency,
        }

    except Exception:
        # Fallback: proportional allocation to peak seasons
        total_avg = sum(season_avgs.values()) or 1.0
        allocation = {}
        for s, avg in season_avgs.items():
            share = safe_div(avg, total_avg)
            allocation[s] = round(share * total_budget, 2)
        return {
            "method": "proportional_fallback",
            "optimal": False,
            "allocation": allocation,
            "total_invested": round(total_budget, 2),
            "allocation_efficiency": 100.0,
        }


def _sensitivity_analysis(
    season_avgs: dict[str, float],
    base_budget: float,
    max_prep: float,
) -> dict[str, Any]:
    sensitivity: dict[str, Any] = {}
    for delta_pct in [-20, 20]:
        test_budget = base_budget * (1 + delta_pct / 100)
        result = _solve_seasonal_milp(season_avgs, test_budget, max_prep)
        sensitivity[f"budget_{'+' if delta_pct > 0 else ''}{delta_pct}pct"] = {
            "budget": round(test_budget, 2),
            "total_invested": result.get("total_invested", 0),
            "allocation_efficiency": result.get("allocation_efficiency", 0),
        }
    return sensitivity


def _fetch_and_process(
    institution_id: str,
    entity_type: str,
    total_budget: float,
    max_preparation_per_season: float,
) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()
    schema, receipt_cols, _, _ = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols
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

    if not res.data or len(res.data) < 3:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "season_recommendations": [],
            "sensitivity_results": {},
            "allocation_efficiency": 0.0,
            "timestamp": ts,
        }

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["month_num"] = df["date"].dt.month

    # Compute season averages
    season_avgs: dict[str, float] = {}
    for season, months in _SEASONS.items():
        mask = df["month_num"].isin(months)
        sub = df[mask]["total_receipts"]
        season_avgs[season] = float(sub.mean()) if not sub.empty else 0.0

    result = _solve_seasonal_milp(season_avgs, total_budget, max_preparation_per_season)
    allocation = result.get("allocation", {})

    # Build recommendation list
    baseline = float(df["total_receipts"].mean()) or 1.0
    recommendations = []
    for season, avg in season_avgs.items():
        invest = allocation.get(season, 0.0)
        vs_baseline = round(safe_div(avg - baseline, baseline) * 100, 2)
        recommendations.append(
            {
                "season": season,
                "avg_collection": round(avg, 2),
                "vs_baseline_pct": vs_baseline,
                "recommended_investment": invest,
                "expected_uplift_pct": round(invest * 0.20 / (avg or 1) * 100, 2),
                "priority": "High" if avg >= baseline * 1.1 else ("Medium" if avg >= baseline * 0.9 else "Low"),
            }
        )

    recommendations.sort(key=lambda r: -r["avg_collection"])

    sensitivity = _sensitivity_analysis(season_avgs, total_budget, max_preparation_per_season)

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "season_recommendations": recommendations,
        "sensitivity_results": sensitivity,
        "allocation_efficiency": result.get("allocation_efficiency", 0.0),
        "timestamp": ts,
    }


async def get_seasonal_strategy(
    institution_id: str,
    entity_type: str,
    total_budget: float = 100000.0,
    max_preparation_per_season: float = 30000.0,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(
        _fetch_and_process,
        institution_id,
        entity_type,
        total_budget,
        max_preparation_per_season,
    )
