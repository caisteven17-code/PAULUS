"""Shared parish A/B/C/D quadrant classification: Stability × Net Margin.

Client requirement: parishes are clustered by *stability*, seasonally
adjusted — a parish whose collections predictably spike every December
(a liturgical-calendar pattern this system's own seasonality analysis
confirms is large and universal) is not "volatile"; only unexplained
month-to-month variation counts against it. Hence the stability metric is
the standard deviation of the STL decomposition *residual* (trend and
seasonal pattern removed), scaled by average receipts so parishes of very
different sizes are comparable (a scale-free volatility index).

Quadrant (net margin's natural zero-crossing is its own threshold; the
stability cutoff is a dynamic median-split computed diocese-wide across all
parishes, never per active dashboard filter, so "stable" means the same
thing regardless of viewing scope):

    A — Stable   + positive margin  (steady and healthy)
    B — Stable   + negative margin  (predictable, but consistently in deficit)
    C — Volatile + positive margin  (currently fine, but unpredictable)
    D — Volatile + negative margin  (erratic and losing money)

Both descriptive/parish_cluster.py (current assignment) and
predictive/cluster_forecast.py (cluster-transition forecasting) MUST import
this module rather than carrying their own copies — the forecast is of
transitions between these exact clusters, so a drifted duplicate definition
would make "current → predicted" incoherent.

Design lineage: model_lab/model_rule_based_segmentation.py documented a
collection-level × margin quadrant with median-split thresholds; this keeps
that structure but replaces the collection-level axis with seasonally
adjusted stability per the client's requirement (documented in
docs/MANUSCRIPT_GUIDE_HYBRID_DATABASE.md §9).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services._stl import run_stl_residuals
from app.services.data_definitions import safe_div

CLUSTER_LABELS = ["A", "B", "C", "D"]

CLUSTER_DESCRIPTIONS = {
    "A": "Stable collections, positive net margin",
    "B": "Stable collections, negative net margin",
    "C": "Volatile collections, positive net margin",
    "D": "Volatile collections, negative net margin",
}


def compute_features(
    receipts: np.ndarray, expenses: np.ndarray, subsidy: np.ndarray | None = None
) -> dict[str, Any]:
    """Per-parish quadrant inputs from chronological monthly series.

    volatility_index: std of the seasonally-adjusted (STL residual) receipts
    series, divided by average receipts — scale-free, so a ₱50M/mo parish and
    a ₱500k/mo parish are judged on relative, not absolute, swings. Computed
    from the full receipts series (subsidy included) — this measures the
    overall receipts pattern, not organic self-sufficiency.
    net_margin: mean of monthly (organic_receipts - expenses) / organic_receipts,
    where organic_receipts = receipts - subsidy — averaging monthly margins
    rather than one lump ratio so a single huge month can't mask a
    chronically negative operating position. Diocese subsidy (account
    B.3.03) is excluded here so a subsidized parish's margin reflects
    whether its OWN collections cover its OWN expenses, not whether the
    subsidy happens to cover the gap — otherwise a parish that only breaks
    even because of the subsidy reads as "healthy" instead of "supported."
    """
    receipts = np.asarray(receipts, dtype=float)
    expenses = np.asarray(expenses, dtype=float)
    subsidy = np.asarray(subsidy, dtype=float) if subsidy is not None else np.zeros_like(receipts)
    avg_receipts = float(np.mean(receipts)) if len(receipts) else 0.0

    residuals = run_stl_residuals(pd.Series(receipts, index=pd.RangeIndex(len(receipts))))
    residual_std = float(np.std(residuals.values, ddof=0))
    volatility_index = safe_div(residual_std, avg_receipts or 1)

    organic_receipts = receipts - subsidy
    monthly_margins = [safe_div(r - e, r) for r, e in zip(organic_receipts, expenses) if r > 0]
    net_margin = float(np.mean(monthly_margins)) if monthly_margins else (0.0 if avg_receipts > 0 else -1.0)

    return {
        "avg_monthly_collection": round(avg_receipts, 2),
        "volatility_index": round(volatility_index, 4),
        "net_margin": round(net_margin, 4),
    }


def stability_threshold(all_features: list[dict[str, Any]]) -> float:
    """Diocese-wide median volatility_index — the stable/volatile cutoff.

    Computed across every parish with sufficient data, regardless of what
    filter/scope a dashboard user has active, so cluster labels never shift
    just because the viewing scope changed.
    """
    if not all_features:
        return 0.0
    return float(np.median([f["volatility_index"] for f in all_features]))


def classify(volatility_index: float, net_margin: float, threshold: float) -> str:
    """Stable = at or below the diocese-wide median volatility index."""
    stable = volatility_index <= threshold
    positive = net_margin >= 0
    if stable and positive:
        return "A"
    if stable and not positive:
        return "B"
    if not stable and positive:
        return "C"
    return "D"
