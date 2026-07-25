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

from app.services import _aws_financials
from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    KPI_PARISH_UPGRADE_ACTIONABILITY_RATE_MIN,
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
    safe_div,
)
from app.services.prescriptive.financial_recommendation import _dea_target_floor
from app.services.supabase_client import get_table

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


def _solve_milp(parishes: list[dict], budget: float, upgrade_cost_per_parish: float) -> tuple[list[dict], bool]:
    """
    MILP: binary x_i = 1 if parish i is selected for upgrade.
    Maximize sum(x_i) subject to sum(x_i * cost) <= budget.
    Priority: At-Risk parishes first, then Stable.
    Returns (selected parishes, whether the greedy fallback was used instead
    of the actual MILP solve).
    """
    n = len(parishes)
    if n == 0 or budget <= 0:
        return [], False

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
        return selected, False

    except Exception:
        # Fallback: greedy selection by priority
        sortable = [p for p in parishes if p.get("target_cluster")]
        sortable.sort(
            key=lambda p: 0 if p["cluster_label"] == "At-Risk" else 1 if p["cluster_label"] == "Stable" else 2
        )
        selected = []
        remaining_budget = budget
        for p in sortable:
            if remaining_budget >= upgrade_cost_per_parish:
                selected.append(p)
                remaining_budget -= upgrade_cost_per_parish
        return selected, True


def _features_from_totals(iid: str, r: np.ndarray, e: np.ndarray) -> dict[str, Any]:
    n = len(r)
    avg = float(np.mean(r))
    avg_expenses = float(np.mean(e))
    var = float(np.var(r, ddof=0))
    cv = safe_div(float(np.sqrt(var)), avg)

    if n >= 12:
        cy = float(np.sum(r[-12:]))
        py = float(np.sum(r[-24:-12])) if n >= 24 else float(np.sum(r[: max(1, n - 12)]))
        growth = safe_div(cy - py, py or 1)
    elif n >= 2:
        growth = safe_div(r[-1] - r[0], abs(r[0]) or 1)
    else:
        growth = 0.0

    deficit = int(np.sum(e > r))
    deficit_rate = safe_div(deficit, n)
    cluster = _rule_cluster(avg, growth, deficit_rate, cv)
    target = _upgrade_cluster(cluster)

    return {
        "institution_id": iid,
        "avg_collection": round(avg, 2),
        "avg_expenses": round(avg_expenses, 2),
        "cluster_label": cluster,
        "target_cluster": target,
        "growth_rate": round(growth, 4),
        "deficit_rate": round(deficit_rate, 4),
    }


def _fetch_and_process(budget: float = 500000.0, upgrade_cost: float = 50000.0) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    aws_series = _aws_financials.all_parish_monthly_dfs()
    if aws_series is not None:
        parishes = [
            _features_from_totals(
                iid, df["total_receipts"].values.astype(float), df["total_expenses"].values.astype(float)
            )
            for iid, df in aws_series
            if len(df) >= 3
        ]
    else:
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
                "actionability_rate_pass": False,
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

            return _features_from_totals(
                iid, df["total_receipts"].values.astype(float), df["total_expenses"].values.astype(float)
            )

        parishes = run_parallel(_worker, institutions)

    if not parishes:
        return {
            "data_sufficient": False,
            "recommended_upgrades": [],
            "actionability_rate": 0.0,
            "budget_allocation": {},
            "timestamp": ts,
        }

    # DEA efficiency for budget allocation priority — real LP-based, input-
    # oriented DEA (same implementation `financial_recommendation.py` uses for
    # its spending floor), not a simple ratio to the max. Input: avg_expenses
    # (resources consumed); output: avg_collection (value produced) — a
    # parish spending a lot but collecting no more than a lower-spending peer
    # scores as inefficient, which is exactly the signal "needs an upgrade"
    # should be based on. Input-oriented (not output-oriented, e.g.
    # `pastoral_action.py`'s `_dea_efficiency`) because the question here is
    # "could this parish have spent less for the same result," not "could it
    # have collected more with what it already spends" — an output-oriented
    # score can't tell two same-output, different-spend parishes apart.
    inputs = np.array([[p["avg_expenses"]] for p in parishes])
    outputs = np.array([p["avg_collection"] for p in parishes])
    eff_scores = []
    dea_used_fallback = False
    for i in range(len(parishes)):
        result = _dea_target_floor(i, inputs, outputs)
        if result is None:
            eff_scores.append(0.5)
            dea_used_fallback = True
        else:
            eff_scores.append(round(result[0], 4))
    for i, p in enumerate(parishes):
        p["efficiency_score"] = eff_scores[i]

    selected, milp_used_fallback = _solve_milp(parishes, budget, upgrade_cost)

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
        # actionability_rate was already computed but never checked against
        # the diagram's own "≥70%" threshold — same gap/fix shape as
        # financial_trend.py's KPI_* thresholds.
        "actionability_rate_pass": bool(actionability_rate >= KPI_PARISH_UPGRADE_ACTIONABILITY_RATE_MIN),
        "budget_allocation": budget_allocation,
        "used_fallback": milp_used_fallback or dea_used_fallback,
        "timestamp": ts,
    }


async def get_parish_upgrade(budget: float = 500000.0, upgrade_cost: float = 50000.0) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, budget, upgrade_cost)
