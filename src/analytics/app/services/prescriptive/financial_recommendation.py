"""
Prescriptive: Financial Recommendation
LP via PuLP — maximize total disbursement subject to per-category and total budget caps.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_table

_DISBURSEMENT_CAP = 0.9347  # 93.47% of receipts per Diocese benchmark
_BUDGET_CAP = 0.90          # total disbursements <= 90% of total_receipts


def _solve_lp(avg_receipts: float, category_avgs: dict[str, float]) -> dict[str, Any]:
    """
    Maximize sum(disbursements) subject to:
      disbursement_i <= avg_receipts_i * 0.9347  (per-category cap)
      sum(disbursements) <= total_receipts * budget_cap
    """
    try:
        import pulp

        prob = pulp.LpProblem("FinancialAllocation", pulp.LpMaximize)

        vars_dict = {}
        for cat, avg_exp in category_avgs.items():
            ub = min(avg_exp * 1.1, avg_receipts * _DISBURSEMENT_CAP)
            vars_dict[cat] = pulp.LpVariable(f"disb_{cat}", lowBound=0, upBound=max(0, ub))

        # Objective: maximize total disbursement
        prob += pulp.lpSum(vars_dict.values())

        # Total constraint
        prob += pulp.lpSum(vars_dict.values()) <= avg_receipts * _BUDGET_CAP

        status = prob.solve(pulp.PULP_CBC_CMD(msg=0))

        if status != 1:
            return {"method": "fallback", "optimal": False}

        allocation = {cat: round(float(v.varValue or 0), 2) for cat, v in vars_dict.items()}
        total_disb = sum(allocation.values())
        budget_util = round(safe_div(total_disb, avg_receipts) * 100, 2)

        # Disbursement saved vs naive allocation (sum of historical avgs)
        naive_total = sum(category_avgs.values())
        saved = round(safe_div(naive_total - total_disb, naive_total) * 100, 2) if naive_total > 0 else 0.0

        return {
            "method": "LP",
            "optimal": True,
            "allocation": allocation,
            "budget_utilization_pct": budget_util,
            "disbursement_saved_pct": max(0.0, saved),
            "total_disbursement": round(total_disb, 2),
        }

    except Exception:
        # Fallback: proportional allocation capped at 93.47%
        total_exp = sum(category_avgs.values())
        scale = min(1.0, (avg_receipts * _BUDGET_CAP) / total_exp) if total_exp > 0 else 1.0
        allocation = {cat: round(v * scale, 2) for cat, v in category_avgs.items()}
        total_disb = sum(allocation.values())
        budget_util = round(safe_div(total_disb, avg_receipts) * 100, 2)
        return {
            "method": "proportional_fallback",
            "optimal": False,
            "allocation": allocation,
            "budget_utilization_pct": budget_util,
            "disbursement_saved_pct": 0.0,
            "total_disbursement": round(total_disb, 2),
        }


def _fetch_and_process(institution_id: str, entity_type: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()
    schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]

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

    if not res.data or len(res.data) < 3:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "optimal_allocation": {},
            "budget_utilization_pct": 0.0,
            "disbursement_saved_pct": 0.0,
            "timestamp": ts,
        }

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    avg_receipts = float(df[receipt_cols].sum(axis=1).mean())
    category_avgs = {col: float(df[col].mean()) for col in expense_cols if col in df.columns}

    result = _solve_lp(avg_receipts, category_avgs)

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "optimal_allocation": result.get("allocation", {}),
        "budget_utilization_pct": result.get("budget_utilization_pct", 0.0),
        "disbursement_saved_pct": result.get("disbursement_saved_pct", 0.0),
        "timestamp": ts,
    }


async def get_financial_recommendation(institution_id: str, entity_type: str) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
