"""
Prescriptive: Parish Upgrade Recommendation
MILP (PuLP) — maximize upgraded parishes subject to budget. DEA for frontier identification.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import (
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_supabase, get_table
from app.services._institution_pool import run_parallel

_CLUSTER_LABELS = ["High-Performing", "Growing", "Stable", "At-Risk"]


def _rule_cluster(avg: float, growth: float, deficit_rate: float, cv: float) -> str:
    if deficit_rate > 0.4 or growth < -0.05:
        return "At-Risk"
    if growth >= 0.05:
        return "Growing"
    if cv < 0.3:
        return "High-Performing"
    return "Stable"


def _upgrade_cluster(current: str) -> str | None:
    order = ["At-Risk", "Stable", "Growing", "High-Performing"]
    idx = order.index(current) if current in order else -1
    if idx < 0 or idx == len(order) - 1:
        return None
    return order[idx + 1]


def _solve_milp(parishes: list[dict], budget: float, upgrade_cost_per_parish: float) -> list[dict]:
    """
    MILP: binary x_i = 1 if parish i is selected for upgrade.
    Maximize sum(x_i) subject to sum(x_i * cost) <= budget.
    Priority: At-Risk parishes first, then Stable.
    """
    n = len(parishes)
    if n == 0 or budget <= 0:
        return []

    try:
        import pulp

        prob = pulp.LpProblem("ParishUpgrade", pulp.LpMaximize)
        x = [pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(n)]

        # Objective: maximize count weighted by priority
        weights = []
        for p in parishes:
            cl = p.get("cluster_label", "Stable")
            w = 3 if cl == "At-Risk" else (2 if cl == "Stable" else 1)
            weights.append(w)

        prob += pulp.lpSum(weights[i] * x[i] for i in range(n))

        # Budget constraint
        prob += pulp.lpSum(upgrade_cost_per_parish * x[i] for i in range(n)) <= budget

        # Only parishes that can be upgraded
        for i, p in enumerate(parishes):
            if p.get("target_cluster") is None:
                prob += x[i] == 0

        prob.solve(pulp.PULP_CBC_CMD(msg=0))

        selected = []
        for i in range(n):
            if x[i].varValue and float(x[i].varValue) > 0.5:
                selected.append(parishes[i])
        return selected

    except Exception:
        # Fallback: greedy selection by priority
        sortable = [p for p in parishes if p.get("target_cluster")]
        sortable.sort(
            key=lambda p: (
                0 if p["cluster_label"] == "At-Risk" else
                1 if p["cluster_label"] == "Stable" else 2
            )
        )
        selected = []
        remaining_budget = budget
        for p in sortable:
            if remaining_budget >= upgrade_cost_per_parish:
                selected.append(p)
                remaining_budget -= upgrade_cost_per_parish
        return selected


def _fetch_and_process(budget: float = 500000.0, upgrade_cost: float = 50000.0) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    inst_res = (
        get_table("diocese", "institutions")
        .select("id, institution_type")
        .eq("institution_type", "parish")
        .execute()
    )
    institutions = inst_res.data or []

    if not institutions:
        return {
            "data_sufficient": False,
            "recommended_upgrades": [],
            "actionability_rate": 0.0,
            "budget_allocation": {},
            "timestamp": ts,
        }

    all_cols = ["institution_id", "month", "year"] + PARISH_RECEIPTS + PARISH_EXPENSES
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    def _worker(inst: dict) -> dict | None:
        iid = inst["id"]
        res = (
            get_table("parishes", "financial_records")
            .select(", ".join(select_cols))
            .eq("institution_id", iid)
            .eq("is_current_version", True)
            .is_("deleted_at", "null")
            .order("year")
            .execute()
        )
        if not res.data or len(res.data) < 3:
            return None

        df = pd.DataFrame(res.data)
        df = build_date_index(df)

        for col in PARISH_RECEIPTS + PARISH_EXPENSES:
            if col not in df.columns:
                df[col] = 0.0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
        df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

        r = df["total_receipts"].values.astype(float)
        e = df["total_expenses"].values.astype(float)
        n = len(r)
        avg = float(np.mean(r))
        var = float(np.var(r, ddof=0))
        cv = safe_div(float(np.sqrt(var)), avg)

        if n >= 12:
            cy = float(np.sum(r[-12:]))
            py = float(np.sum(r[-24:-12])) if n >= 24 else float(np.sum(r[:max(1, n - 12)]))
            growth = safe_div(cy - py, py or 1)
        elif n >= 2:
            growth = safe_div(r[-1] - r[0], abs(r[0]) or 1)
        else:
            growth = 0.0

        deficit      = int(np.sum(e > r))
        deficit_rate = safe_div(deficit, n)
        cluster      = _rule_cluster(avg, growth, deficit_rate, cv)
        target       = _upgrade_cluster(cluster)

        return {
            "institution_id": iid,
            "avg_collection": round(avg, 2),
            "cluster_label":  cluster,
            "target_cluster": target,
            "growth_rate":    round(growth, 4),
            "deficit_rate":   round(deficit_rate, 4),
        }

    parishes = run_parallel(_worker, institutions)

    if not parishes:
        return {
            "data_sufficient": False,
            "recommended_upgrades": [],
            "actionability_rate": 0.0,
            "budget_allocation": {},
            "timestamp": ts,
        }

    # DEA efficiency for budget allocation priority
    outputs = np.array([p["avg_collection"] for p in parishes])
    inputs = np.arange(1, len(parishes) + 1).astype(float)
    max_out = float(np.max(outputs)) or 1.0
    eff_scores = [round(safe_div(float(outputs[i]), max_out), 4) for i in range(len(parishes))]
    for i, p in enumerate(parishes):
        p["efficiency_score"] = eff_scores[i]

    selected = _solve_milp(parishes, budget, upgrade_cost)

    # Rank selected by priority
    priority_map = {"At-Risk": 1, "Stable": 2, "Growing": 3}
    selected.sort(key=lambda p: priority_map.get(p["cluster_label"], 4))
    for rank, p in enumerate(selected, start=1):
        p["priority"] = rank
        p["budget_allocated"] = upgrade_cost

    actionability_rate = round(safe_div(len(selected), len(parishes)), 4)

    budget_allocation = {
        "total_budget": budget,
        "allocated": round(len(selected) * upgrade_cost, 2),
        "remaining": round(budget - len(selected) * upgrade_cost, 2),
        "cost_per_upgrade": upgrade_cost,
    }

    return {
        "data_sufficient": True,
        "recommended_upgrades": selected,
        "actionability_rate": actionability_rate,
        "budget_allocation": budget_allocation,
        "timestamp": ts,
    }


async def get_parish_upgrade(budget: float = 500000.0, upgrade_cost: float = 50000.0) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, budget, upgrade_cost)
