"""
Descriptive: Parish Cluster Analysis
Rule-based segmentation of parishes into 4 clusters (A/B/C/D) on a
Stability × Net Margin quadrant — see _parish_quadrant.py for the shared
definition (also used by predictive/cluster_forecast.py).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials, _parish_quadrant, _ttl_cache, analytics_db
from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

# A/B/C/D — shared quadrant definition (Stability × Net Margin)
_CLUSTERS = _parish_quadrant.CLUSTER_LABELS


def _features_from_series(
    receipts: np.ndarray,
    expenses: np.ndarray,
    institution_id: str,
    institution_name: str = "",
) -> dict[str, Any]:
    """Quadrant inputs only — cluster_label is assigned in a second pass once
    the diocese-wide median volatility threshold is known (classification is
    relative to the whole diocese, not computable per-parish in isolation)."""
    return {
        "institution_id": institution_id,
        "institution_name": institution_name,
        **_parish_quadrant.compute_features(receipts, expenses),
    }


def _assign_clusters(parishes: list[dict[str, Any]]) -> float:
    """Second pass: diocese-wide median split, then label every parish.
    Returns the threshold so it can be included in the response."""
    threshold = _parish_quadrant.stability_threshold(parishes)
    for p in parishes:
        p["cluster_label"] = _parish_quadrant.classify(p["volatility_index"], p["net_margin"], threshold)
    return threshold


def _parish_features(df: pd.DataFrame, institution_id: str, institution_name: str = "") -> dict[str, Any]:
    for col in PARISH_RECEIPTS + PARISH_EXPENSES:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
    df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

    receipts = df["total_receipts"].values.astype(float)
    expenses = df["total_expenses"].values.astype(float)
    return _features_from_series(receipts, expenses, institution_id, institution_name)


def _compute_cluster_purity(parishes: list[dict], threshold: float) -> float:
    """
    Cluster purity proxy: fraction of parishes whose stored label matches a
    re-derivation from their own features (always 1.0 for pure rule-based
    assignment — kept as an explicit self-consistency check, same KPI the
    original model_lab prototype reported).
    """
    if not parishes:
        return 0.0
    consistent = sum(
        1
        for p in parishes
        if p["cluster_label"] == _parish_quadrant.classify(p["volatility_index"], p["net_margin"], threshold)
    )
    return round(safe_div(consistent, len(parishes)), 4)


def _fetch_and_process() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    # Fetch all parish institutions
    inst_res = (
        get_table("diocese", "institutions")
        .select("id, name, institution_type")
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
        return _parish_features(df, iid, inst.get("name") or "")

    parishes = run_parallel(_worker, institutions)
    _no_data_count = len(institutions) - len(parishes)  # noqa: F841

    if not parishes:
        return {
            "data_sufficient": False,
            "cluster_counts": {c: 0 for c in _CLUSTERS},
            "parishes": [],
            "kpis": {"cluster_purity": 0.0, "rule_coverage_rate": 0.0},
            "timestamp": ts,
        }

    threshold = _assign_clusters(parishes)

    cluster_counts = {c: 0 for c in _CLUSTERS}
    for p in parishes:
        cluster_counts[p["cluster_label"]] = cluster_counts.get(p["cluster_label"], 0) + 1

    total_institutions = len(institutions)
    rule_coverage_rate = round(safe_div(len(parishes), total_institutions), 4)
    purity = _compute_cluster_purity(parishes, threshold)

    return {
        "data_sufficient": True,
        "cluster_counts": cluster_counts,
        "parishes": parishes,
        "stability_threshold": round(threshold, 4),
        "kpis": {
            "cluster_purity": purity,
            "rule_coverage_rate": rule_coverage_rate,
        },
        "timestamp": ts,
    }


_AWS_PARISH_COUNT_SQL = """
    SELECT COUNT(*)::int AS n
    FROM shared_analytics.dim_institutions
    WHERE institution_type = 'parish'
"""


def _fetch_and_process_aws() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()
    # Same shared diocese-wide fetch cluster_forecast.py uses — both cluster
    # views must classify from byte-identical per-parish series or their
    # cluster assignments can drift apart.
    aws_series = _aws_financials.all_parish_monthly_dfs() or []

    parishes = [
        _features_from_series(
            df["total_receipts"].values.astype(float),
            df["total_expenses"].values.astype(float),
            iid,
            str(df["institution_name"].iloc[0] or "") if "institution_name" in df.columns else "",
        )
        for iid, df in aws_series
        if len(df) >= 3
    ]

    if not parishes:
        return {
            "data_sufficient": False,
            "cluster_counts": {c: 0 for c in _CLUSTERS},
            "parishes": [],
            "kpis": {"cluster_purity": 0.0, "rule_coverage_rate": 0.0},
            "timestamp": ts,
        }

    threshold = _assign_clusters(parishes)

    cluster_counts = {c: 0 for c in _CLUSTERS}
    for p in parishes:
        cluster_counts[p["cluster_label"]] = cluster_counts.get(p["cluster_label"], 0) + 1

    count_row = analytics_db.fetch_query(_AWS_PARISH_COUNT_SQL)
    total_institutions = count_row[0]["n"] if count_row else len(parishes)

    return {
        "data_sufficient": True,
        "cluster_counts": cluster_counts,
        "parishes": parishes,
        "stability_threshold": round(threshold, 4),
        "kpis": {
            "cluster_purity": _compute_cluster_purity(parishes, threshold),
            "rule_coverage_rate": round(safe_div(len(parishes), max(total_institutions, len(parishes))), 4),
        },
        "timestamp": ts,
        "source": "aws",
    }


async def get_parish_cluster() -> dict[str, Any]:
    # Diocese-wide, identical for every caller, no request parameters — the
    # same duplicate-concurrent-request risk as financial-trend applies here
    # too, plus a short cache so requests moments apart also skip RDS (see
    # _ttl_cache.py).
    return await _ttl_cache.cached("parish_cluster", _ttl_cache.DEFAULT_TTL_SECONDS, _get_parish_cluster_uncached)


async def _get_parish_cluster_uncached() -> dict[str, Any]:
    if analytics_db.enabled():
        try:
            result = await asyncio.to_thread(_fetch_and_process_aws)
            if result.get("data_sufficient"):
                return result
        except Exception:
            logger.exception("AWS parish cluster read failed; falling back to Supabase")
    return await asyncio.to_thread(_fetch_and_process)
