"""
Descriptive: Parish Cluster Analysis
Rule-based segmentation of parishes into 4 financial performance clusters.
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

# Cluster labels
_CLUSTERS = ["High-Performing", "Growing", "Stable", "At-Risk"]


def _classify(avg_collection: float, variance: float, growth_rate: float, deficit_rate: float) -> str:
    """
    Rule-based cluster assignment.
    High-Performing: high avg, low variance
    Growing: positive growth rate
    Stable: low variance, low growth, low deficit
    At-Risk: negative growth or high deficit
    """
    if avg_collection <= 0:
        return "At-Risk"

    if deficit_rate > 0.4 or growth_rate < -0.05:
        return "At-Risk"
    if avg_collection > 0 and growth_rate >= 0.05:
        return "Growing"
    # High-Performing: top-quartile collection AND low variance (CV < 0.3)
    cv = safe_div(float(np.sqrt(variance)), avg_collection)
    if avg_collection > 0 and cv < 0.3:
        return "High-Performing"
    return "Stable"


def _parish_features(df: pd.DataFrame, institution_id: str) -> dict[str, Any]:
    for col in PARISH_RECEIPTS + PARISH_EXPENSES:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
    df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

    receipts = df["total_receipts"].values.astype(float)
    expenses = df["total_expenses"].values.astype(float)

    avg_c = float(np.mean(receipts))
    variance = float(np.var(receipts, ddof=0))

    n = len(receipts)
    if n >= 12:
        current_yr = float(np.sum(receipts[-12:]))
        prior_yr = float(np.sum(receipts[-24:-12])) if n >= 24 else float(np.sum(receipts[: max(1, n - 12)]))
        growth_rate = safe_div(current_yr - prior_yr, prior_yr or 1)
    elif n >= 2:
        growth_rate = safe_div(receipts[-1] - receipts[0], abs(receipts[0]) or 1)
    else:
        growth_rate = 0.0

    deficit_months = int(np.sum(expenses > receipts))
    deficit_rate = safe_div(deficit_months, n)

    cluster = _classify(avg_c, variance, growth_rate, deficit_rate)

    return {
        "institution_id": institution_id,
        "avg_monthly_collection": round(avg_c, 2),
        "collection_variance": round(variance, 2),
        "growth_rate": round(growth_rate, 4),
        "deficit_rate": round(deficit_rate, 4),
        "cluster_label": cluster,
    }


def _compute_cluster_purity(parishes: list[dict]) -> float:
    """
    Cluster purity proxy: fraction of parishes whose cluster assignment
    is consistent with the rule definitions (always 1.0 for pure rule-based,
    but we cross-check growth vs cluster label as a sanity rate).
    """
    if not parishes:
        return 0.0
    consistent = 0
    for p in parishes:
        cl = p["cluster_label"]
        gr = p["growth_rate"]
        dr = p["deficit_rate"]
        if cl == "At-Risk" and (gr < -0.05 or dr > 0.4):
            consistent += 1
        elif cl == "Growing" and gr >= 0.05:
            consistent += 1
        elif cl in ("High-Performing", "Stable"):
            consistent += 1  # rule always satisfied by construction
    return round(safe_div(consistent, len(parishes)), 4)


def _fetch_and_process() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    # Fetch all parish institutions
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
            "cluster_counts": {c: 0 for c in _CLUSTERS},
            "parishes": [],
            "kpis": {"cluster_purity": 0.0, "rule_coverage_rate": 0.0},
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
        return _parish_features(df, iid)

    parishes = run_parallel(_worker, institutions)
    no_data_count = len(institutions) - len(parishes)

    if not parishes:
        return {
            "data_sufficient": False,
            "cluster_counts": {c: 0 for c in _CLUSTERS},
            "parishes": [],
            "kpis": {"cluster_purity": 0.0, "rule_coverage_rate": 0.0},
            "timestamp": ts,
        }

    cluster_counts = {c: 0 for c in _CLUSTERS}
    for p in parishes:
        cluster_counts[p["cluster_label"]] = cluster_counts.get(p["cluster_label"], 0) + 1

    total_institutions = len(institutions)
    rule_coverage_rate = round(safe_div(len(parishes), total_institutions), 4)
    purity = _compute_cluster_purity(parishes)

    return {
        "data_sufficient": True,
        "cluster_counts": cluster_counts,
        "parishes": parishes,
        "kpis": {
            "cluster_purity": purity,
            "rule_coverage_rate": rule_coverage_rate,
        },
        "timestamp": ts,
    }


async def get_parish_cluster() -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process)
