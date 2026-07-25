"""
Prescriptive: Financial Recommendation
LP via PuLP — minimize total disbursement subject to per-category and total
budget caps, and a DEA-derived floor per category (see `_dea_target_floor`).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials
from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_table

_DISBURSEMENT_CAP = 0.9347  # 93.47% of receipts per Diocese benchmark
_BUDGET_CAP = 0.90  # total disbursements <= 90% of total_receipts
_MIN_PEERS_FOR_DEA = 3  # below this, a peer comparison isn't statistically meaningful yet


def _dea_target_floor(
    target_index: int,
    inputs: np.ndarray,
    outputs: np.ndarray,
) -> tuple[float, np.ndarray] | None:
    """
    Input-oriented DEA under variable returns to scale (VRS): among peer
    institutions producing at least as much output (here, avg_receipts) as the
    target, find the efficient peer combination's per-category input levels
    (here, expense category averages). That combination — not a flat
    percentage — becomes the genuine, receipts-scaled floor: "parishes
    collecting a similar amount, spent efficiently, only needed this much in
    this category."

    Unlike an *output*-oriented DEA (can this unit produce more with its given
    input? — e.g. `pastoral_action.py`'s `_dea_efficiency`), this is
    input-oriented (could this unit have used less input for its given
    output?) — the distinction matters: two units with identical output but
    different input levels are indistinguishable to an output-oriented score
    (neither could have produced *more*), but this one correctly flags the
    higher-input unit as less efficient.

    `inputs`: (n_peers, n_categories) — each peer's average spend per category.
    `outputs`: (n_peers,) — each peer's average receipts.
    `target_index`: row in `inputs`/`outputs` for the institution being evaluated.

    Returns `(theta, target_vector)` — `theta` is the scalar efficiency score
    (1.0 = on the frontier, lower = less efficient), `target_vector` is the
    per-category floor (shape (n_categories,)). None if the LP has no optimal
    solution (e.g. too few usable peers).
    """
    import pulp

    n, n_categories = inputs.shape
    i = target_index

    prob = pulp.LpProblem("DEA_target_floor", pulp.LpMinimize)
    theta = pulp.LpVariable("theta", lowBound=0)
    lambdas = [pulp.LpVariable(f"lambda_{j}", lowBound=0) for j in range(n)]

    prob += theta

    # Output constraint: the peer combination must produce at least as much
    # output (receipts) as the target institution.
    prob += pulp.lpSum(outputs[j] * lambdas[j] for j in range(n)) >= outputs[i]

    # Input constraints: the peer combination's spend per category can't
    # exceed theta * the target's own spend in that category.
    for k in range(n_categories):
        prob += pulp.lpSum(inputs[j, k] * lambdas[j] for j in range(n)) <= theta * inputs[i, k]

    # VRS
    prob += pulp.lpSum(lambdas) == 1

    status = prob.solve(pulp.PULP_CBC_CMD(msg=0))
    if status != 1:
        return None

    # The frontier's actual projection — the peer combination's per-category
    # spend — can be lower than theta * x_i for individual categories where
    # slack exists, which is a more informative floor than a flat rescale.
    target = np.array([sum(inputs[j, k] * (lambdas[j].varValue or 0.0) for j in range(n)) for k in range(n_categories)])
    return float(theta.varValue or 0.0), target


def _solve_lp(
    avg_receipts: float,
    category_avgs: dict[str, float],
    floor: dict[str, float] | None,
) -> dict[str, Any]:
    """
    Minimize sum(disbursements) subject to:
      floor_i <= disbursement_i <= avg_receipts_i * 0.9347  (DEA floor, per-category cap)
      sum(disbursements) <= total_receipts * budget_cap

    `floor`, when given, is the DEA-derived minimum spend per category (see
    `_dea_target_floor`) — without it there is nothing preventing every
    disbursement from being minimized to zero, so the LP falls back to
    `lowBound=0` (the old behavior) rather than recommending "spend nothing."
    """
    try:
        import pulp

        prob = pulp.LpProblem("FinancialAllocation", pulp.LpMinimize)

        vars_dict = {}
        for cat in category_avgs:
            # Diocesan per-category ceiling (93.47% of receipts), independent of
            # this institution's own history — under the old *maximize*
            # objective, a historical `avg_exp * 1.1` term was also part of
            # this cap (limiting growth beyond history), but that conflicts
            # with *minimize* + a peer-derived floor: a category that
            # genuinely needs more than 110% of a small historical average
            # (per the DEA floor below) would have its floor silently
            # suppressed by a now-obsolete historical ceiling. The floor is
            # allowed to widen the ceiling when it legitimately exceeds it.
            lb = floor.get(cat, 0.0) if floor else 0.0
            ub = max(avg_receipts * _DISBURSEMENT_CAP, lb)
            vars_dict[cat] = pulp.LpVariable(f"disb_{cat}", lowBound=max(0, lb), upBound=max(0, ub))

        # Objective: minimize total disbursement (the floor keeps this from
        # collapsing to zero — see docstring).
        prob += pulp.lpSum(vars_dict.values())

        # Total constraint
        prob += pulp.lpSum(vars_dict.values()) <= avg_receipts * _BUDGET_CAP

        status = prob.solve(pulp.PULP_CBC_CMD(msg=0))

        if status != 1:
            return {"method": "fallback", "optimal": False}

        allocation = {cat: round(float(v.varValue or 0), 2) for cat, v in vars_dict.items()}
        total_disb = sum(allocation.values())
        budget_util = round(safe_div(total_disb, avg_receipts) * 100, 2)

        # Disbursement saved vs naive allocation (sum of historical avgs).
        # Not clamped to 0 — a genuine spending *increase* (the floor exceeding
        # historical spend in some category) should be visible as a negative
        # value, not hidden as "0% saved".
        naive_total = sum(category_avgs.values())
        saved = round(safe_div(naive_total - total_disb, naive_total) * 100, 2) if naive_total > 0 else 0.0

        return {
            "method": "LP",
            "optimal": True,
            "allocation": allocation,
            "budget_utilization_pct": budget_util,
            "disbursement_saved_pct": saved,
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


def _fetch_receipts_and_categories(institution_id: str, entity_type: str) -> tuple[float, dict[str, float]] | None:
    """(avg total receipts, {expense category: avg}) — AWS warehouse first for
    parishes (Section-D categories), Supabase otherwise. None when < 3 months."""
    if entity_type == "parish":
        df = _aws_financials.parish_monthly_df(institution_id)
        if df is not None and len(df) >= 3:
            avg_receipts = float(df["total_receipts"].mean())
            category_avgs = {col: float(df[col].mean()) for col in _aws_financials.EXPENSE_CATEGORY_COLS}
            return avg_receipts, category_avgs

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
        return None

    df = pd.DataFrame(res.data)
    df = build_date_index(df)
    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    avg_receipts = float(df[receipt_cols].sum(axis=1).mean())
    category_avgs = {col: float(df[col].mean()) for col in expense_cols if col in df.columns}
    return avg_receipts, category_avgs


def _fetch_peer_pool(entity_type: str) -> list[tuple[str, float, dict[str, float]]]:
    """(institution_id, avg_receipts, category_avgs) for every institution of
    this entity_type — the peer set the DEA floor is benchmarked against.
    AWS warehouse first for parishes (one round trip), Supabase otherwise."""
    peers: list[tuple[str, float, dict[str, float]]] = []

    if entity_type == "parish":
        aws_dfs = _aws_financials.all_parish_monthly_dfs()
        if aws_dfs is not None:
            for institution_id, df in aws_dfs:
                if df.empty:
                    continue
                avg_receipts = float(df["total_receipts"].mean())
                category_avgs = {
                    col: float(df[col].mean()) for col in _aws_financials.EXPENSE_CATEGORY_COLS if col in df.columns
                }
                peers.append((institution_id, avg_receipts, category_avgs))
            if peers:
                return peers

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
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .execute()
    )
    if not res.data:
        return peers

    df = pd.DataFrame(res.data)
    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    for institution_id, group in df.groupby("institution_id"):
        avg_receipts = float(group[receipt_cols].sum(axis=1).mean())
        category_avgs = {col: float(group[col].mean()) for col in expense_cols}
        peers.append((str(institution_id), avg_receipts, category_avgs))
    return peers


_SELF_REFERENTIAL_FLOOR_FRACTION = 0.5  # fallback floor when peer DEA isn't feasible


def _compute_floor(
    institution_id: str,
    entity_type: str,
    avg_receipts: float,
    category_avgs: dict[str, float],
) -> dict[str, float]:
    """DEA-derived floor for this institution's categories, benchmarked
    against every peer institution of the same type. Falls back to a
    self-referential floor (a fraction of this institution's own historical
    average) when there aren't enough peers for a meaningful cross-sectional
    comparison — notably, entity types with very few institutions (e.g. only 2
    seminaries diocese-wide) can never clear `_MIN_PEERS_FOR_DEA`, and "no
    floor at all" would let the LP minimize every category to zero, which is
    not a usable recommendation."""
    peers = _fetch_peer_pool(entity_type)
    if not any(pid == institution_id for pid, _, _ in peers):
        peers.append((institution_id, avg_receipts, category_avgs))

    usable_peers = [(pid, r, c) for pid, r, c in peers if r > 0]
    if len(usable_peers) >= _MIN_PEERS_FOR_DEA:
        categories = list(category_avgs.keys())
        target_index = next(idx for idx, (pid, _, _) in enumerate(usable_peers) if pid == institution_id)
        inputs = np.array([[c.get(cat, 0.0) for cat in categories] for _, _, c in usable_peers], dtype=float)
        outputs = np.array([r for _, r, _ in usable_peers], dtype=float)

        result = _dea_target_floor(target_index, inputs, outputs)
        if result is not None:
            _theta, target = result
            return dict(zip(categories, target.tolist()))

    return {cat: avg * _SELF_REFERENTIAL_FLOOR_FRACTION for cat, avg in category_avgs.items()}


def _fetch_and_process(institution_id: str, entity_type: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    fetched = _fetch_receipts_and_categories(institution_id, entity_type)
    if fetched is None:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "optimal_allocation": {},
            "budget_utilization_pct": 0.0,
            "disbursement_saved_pct": 0.0,
            "timestamp": ts,
        }
    avg_receipts, category_avgs = fetched
    floor = _compute_floor(institution_id, entity_type, avg_receipts, category_avgs)

    result = _solve_lp(avg_receipts, category_avgs, floor)

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "optimal_allocation": result.get("allocation", {}),
        "budget_utilization_pct": result.get("budget_utilization_pct", 0.0),
        "disbursement_saved_pct": result.get("disbursement_saved_pct", 0.0),
        # Whether this came from the actual PuLP solver ("LP") or a fallback
        # heuristic ("proportional_fallback"/"fallback") — `_solve_lp` already
        # computed this, it just wasn't being surfaced to callers before.
        "method": result.get("method", "unknown"),
        "used_fallback": result.get("method") != "LP",
        "timestamp": ts,
    }


async def get_financial_recommendation(institution_id: str, entity_type: str) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
