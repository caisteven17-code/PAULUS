"""
Descriptive: Parish Cluster Analysis
Rule-based segmentation of parishes into 4 classes (A/B/C/D): subsidized
parishes are D unconditionally, the rest are split into stability terciles
— see _parish_quadrant.py for the shared definition (also used by
predictive/cluster_forecast.py).
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
    subsidy: np.ndarray | None = None,
) -> dict[str, Any]:
    """Classification inputs only — cluster_label is assigned in a second
    pass once the diocese-wide stability terciles are known (classification
    is relative to the whole diocese, not computable per-parish in isolation)."""
    return {
        "institution_id": institution_id,
        "institution_name": institution_name,
        **_parish_quadrant.compute_features(receipts, expenses, subsidy),
    }


def _assign_clusters(parishes: list[dict[str, Any]]) -> tuple[float, float]:
    """Second pass: diocese-wide stability terciles (among non-subsidized
    parishes only), then label every parish. Returns (low, high) cutoffs so
    they can be included in the response."""
    low, high = _parish_quadrant.stability_terciles(parishes)
    for p in parishes:
        p["cluster_label"] = _parish_quadrant.classify(p["volatility_index"], p["is_subsidized"], low, high)
    return low, high


def _cluster_purity(parishes: list[dict[str, Any]]) -> float:
    """How cleanly the classification separates parishes into cohesive
    groups. This is rule-based (not distance-based) clustering, so there's
    no external ground truth to score "purity" against in the classic
    sense — instead this measures internal cohesion. Class D is perfectly
    pure by construction (is_subsidized is a binary, unambiguous
    criterion) — contributes 1.0 per member. For the stability terciles
    (A/B/C), purity is eta-squared: the fraction of total volatility_index
    variance explained by cluster membership (between-group / total
    variance) — well-separated terciles score close to 1.0, near-identical
    clusters score close to 0."""
    d_count = sum(1 for p in parishes if p["cluster_label"] == "D")
    non_d = [p for p in parishes if p["cluster_label"] != "D"]

    if not non_d:
        return 1.0 if d_count else 0.0

    values = np.array([p["volatility_index"] for p in non_d])
    overall_mean = float(np.mean(values))
    total_ss = float(np.sum((values - overall_mean) ** 2))

    # Exact-zero equality is unreliable here: near-identical volatility
    # values can leave a tiny nonzero total_ss from float rounding in the
    # mean/subtraction, which would otherwise fall through to an unstable
    # ~0/~0 division below.
    if np.isclose(total_ss, 0.0):
        eta_sq = 1.0  # every non-D parish has identical volatility -- terciles are trivially cohesive
    else:
        between_ss = 0.0
        for label in ("A", "B", "C"):
            group = [p["volatility_index"] for p in non_d if p["cluster_label"] == label]
            if not group:
                continue
            group_mean = float(np.mean(group))
            between_ss += len(group) * (group_mean - overall_mean) ** 2
        eta_sq = safe_div(between_ss, total_ss)

    total = len(parishes)
    return round(safe_div(d_count * 1.0 + len(non_d) * eta_sq, total), 4)


def _parish_features(df: pd.DataFrame, institution_id: str, institution_name: str = "") -> dict[str, Any]:
    for col in PARISH_RECEIPTS + PARISH_EXPENSES:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
    df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

    receipts = df["total_receipts"].values.astype(float)
    expenses = df["total_expenses"].values.astype(float)
    # subsidy_inflow is already one of PARISH_RECEIPTS (summed into
    # total_receipts above) — pulled out separately so net_margin can
    # exclude it (see _parish_quadrant.compute_features's docstring).
    subsidy = df["subsidy_inflow"].values.astype(float) if "subsidy_inflow" in df.columns else None
    return _features_from_series(receipts, expenses, institution_id, institution_name, subsidy)


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
            "kpis": {"rule_coverage_rate": 0.0},
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
            "kpis": {"rule_coverage_rate": 0.0},
            "timestamp": ts,
        }

    low, high = _assign_clusters(parishes)

    cluster_counts = {c: 0 for c in _CLUSTERS}
    for p in parishes:
        cluster_counts[p["cluster_label"]] = cluster_counts.get(p["cluster_label"], 0) + 1

    total_institutions = len(institutions)
    rule_coverage_rate = round(safe_div(len(parishes), total_institutions), 4)

    return {
        "data_sufficient": True,
        "cluster_counts": cluster_counts,
        "parishes": parishes,
        "stability_terciles": {"low": round(low, 4), "high": round(high, 4)},
        "kpis": {
            "rule_coverage_rate": rule_coverage_rate,
            "cluster_purity": _cluster_purity(parishes),
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
            df["subsidy_receipts"].values.astype(float) if "subsidy_receipts" in df.columns else None,
        )
        for iid, df in aws_series
        if len(df) >= 3
    ]

    if not parishes:
        return {
            "data_sufficient": False,
            "cluster_counts": {c: 0 for c in _CLUSTERS},
            "parishes": [],
            "kpis": {"rule_coverage_rate": 0.0},
            "timestamp": ts,
        }

    low, high = _assign_clusters(parishes)

    cluster_counts = {c: 0 for c in _CLUSTERS}
    for p in parishes:
        cluster_counts[p["cluster_label"]] = cluster_counts.get(p["cluster_label"], 0) + 1

    count_row = analytics_db.fetch_query(_AWS_PARISH_COUNT_SQL)
    total_institutions = count_row[0]["n"] if count_row else len(parishes)

    return {
        "data_sufficient": True,
        "cluster_counts": cluster_counts,
        "parishes": parishes,
        "stability_terciles": {"low": round(low, 4), "high": round(high, 4)},
        "kpis": {
            "rule_coverage_rate": round(safe_div(len(parishes), max(total_institutions, len(parishes))), 4),
            "cluster_purity": _cluster_purity(parishes),
        },
        "timestamp": ts,
        "source": "aws",
    }


async def get_parish_cluster() -> dict[str, Any]:
    # Client requirement: classification recomputes monthly, not on every
    # dashboard load — see _ttl_cache.MONTHLY_TTL_SECONDS's docstring.
    return await _ttl_cache.cached(
        "parish_cluster",
        _ttl_cache.MONTHLY_TTL_SECONDS,
        _get_parish_cluster_uncached,
        # The Supabase fallback below is also empty for parishes, so an AWS
        # read failing mid-contention and falling back looks identical to a
        # genuine "no data" — don't freeze that into the cache for 5 minutes.
        should_cache=lambda r: bool(r.get("data_sufficient")),
    )


async def _get_parish_cluster_uncached() -> dict[str, Any]:
    if analytics_db.enabled():
        try:
            result = await asyncio.to_thread(_fetch_and_process_aws)
            if result.get("data_sufficient"):
                return result
        except Exception:
            logger.exception("AWS parish cluster read failed; falling back to Supabase")
    return await asyncio.to_thread(_fetch_and_process)
