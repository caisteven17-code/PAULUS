"""Shared parish A/B/C/D classification: subsidy status, then stability.

Client requirement: a parish's diocese subsidy status is the primary
signal — any parish that received diocese subsidy (Section B.3.03 "Subsidy
from Diocese" > 0) within the trailing SUBSIDY_WINDOW_MONTHS of its
available history is Class D, full stop, regardless of its own stability
or margin. A trailing window (not "ever subsidized") is used because
subsidy is paid intermittently, not monthly — a parish subsidized once
years ago and self-sufficient since should not be locked into Class D
forever. The remaining (self-sufficient) parishes are split into three
tiers by how stable their collections are, seasonally adjusted — a parish
whose collections predictably spike every December (a liturgical-calendar
pattern this system's own seasonality analysis confirms is large and
universal) is not "volatile"; only unexplained month-to-month variation
counts against it. Hence the stability metric is the standard deviation of
the STL decomposition *residual* (trend and seasonal pattern removed),
scaled by average receipts so parishes of very different sizes are
comparable (a scale-free volatility index).

    D — Subsidized (received diocese support within the last
        SUBSIDY_WINDOW_MONTHS), regardless of stability
    A — Self-sufficient, most stable third (steady, predictable)
    B — Self-sufficient, middle third for stability
    C — Self-sufficient, most volatile third (unpredictable, but not
        currently subsidized)

Net margin (organic, subsidy-excluded — see compute_features) is still
computed and reported alongside the classification for context, but no
longer determines the class itself — classification is subsidy-first, then
stability-only among the rest.

Class D parishes whose organic margin (receipts minus subsidy minus
expenses) is comfortably positive despite technically being subsidized are
flagged via review_recommended — a passive recommendation for the diocese
to consider graduating them off subsidy, never an automatic reclassification.

Both descriptive/parish_cluster.py (current assignment) and
predictive/cluster_forecast.py (cluster-transition forecasting) MUST import
this module rather than carrying their own copies — the forecast is of
transitions between these exact classes, so a drifted duplicate definition
would make "current → predicted" incoherent.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services._stl import run_stl_residuals
from app.services.data_definitions import safe_div

CLUSTER_LABELS = ["A", "B", "C", "D"]

CLUSTER_DESCRIPTIONS = {
    "A": "Self-sufficient, most stable third",
    "B": "Self-sufficient, middle third for stability",
    "C": "Self-sufficient, most volatile third",
    "D": "Currently receiving diocese subsidy",
}

# How far back a subsidy payment still counts toward Class D. A strict
# 1-month window would flicker: subsidy is paid intermittently (client data
# showed ~80% of recently-supported parishes skipped at least one of their
# last 6 months), so a parish can go months between payments without having
# stopped needing support. 12 months trades responsiveness for stability —
# acceptable because review_recommended (below) independently catches
# parishes that no longer need subsidy, using actual financial need rather
# than payment timing.
SUBSIDY_WINDOW_MONTHS = 12

# Average organic margin above which a Class D parish is flagged for review.
# Chosen above 0%: several subsidized parishes run a razor-thin (~0.5%)
# organic margin — basically break-even and one bad month from needing
# support again — so only comfortably positive margins should prompt review.
REVIEW_MARGIN_THRESHOLD = 0.05


def compute_features(
    receipts: np.ndarray, expenses: np.ndarray, subsidy: np.ndarray | None = None
) -> dict[str, Any]:
    """Per-parish classification inputs from chronological monthly series.

    volatility_index: std of the seasonally-adjusted (STL residual) receipts
    series, divided by average receipts — scale-free, so a ₱50M/mo parish and
    a ₱500k/mo parish are judged on relative, not absolute, swings. Computed
    from the full receipts series (subsidy included) — this measures the
    overall receipts pattern, not organic self-sufficiency.
    net_margin: mean of monthly (organic_receipts - expenses) / organic_receipts,
    where organic_receipts = receipts - subsidy — averaging monthly margins
    rather than one lump ratio so a single huge month can't mask a
    chronically negative operating position. Reported for context; no longer
    drives the class itself (see module docstring).
    is_subsidized: whether this parish received diocese subsidy within the
    trailing SUBSIDY_WINDOW_MONTHS of the available history — the sole
    determinant of Class D.
    review_recommended: for subsidized parishes only, whether their organic
    net_margin is comfortably positive (above REVIEW_MARGIN_THRESHOLD),
    i.e. they look financially self-sufficient without the subsidy. Always
    False for non-subsidized parishes. Advisory only — see module docstring.
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

    is_subsidized = bool(np.sum(subsidy[-SUBSIDY_WINDOW_MONTHS:]) > 0)
    review_recommended = bool(is_subsidized and net_margin > REVIEW_MARGIN_THRESHOLD)

    return {
        "avg_monthly_collection": round(avg_receipts, 2),
        "volatility_index": round(volatility_index, 4),
        "net_margin": round(net_margin, 4),
        "is_subsidized": is_subsidized,
        "review_recommended": review_recommended,
    }


def stability_terciles(all_features: list[dict[str, Any]]) -> tuple[float, float]:
    """Diocese-wide tercile cutoffs of volatility_index, computed only
    across non-subsidized parishes — the population these cutoffs actually
    classify (subsidized parishes are Class D unconditionally and never
    consulted for the A/B/C stability split). Returns (low, high): a
    volatility_index at or below `low` is A, at or below `high` is B, above
    `high` is C.
    """
    values = [f["volatility_index"] for f in all_features if not f.get("is_subsidized")]
    if not values:
        return 0.0, 0.0
    low = float(np.percentile(values, 100 / 3))
    high = float(np.percentile(values, 200 / 3))
    return low, high


def classify(volatility_index: float, is_subsidized: bool, low_cutoff: float, high_cutoff: float) -> str:
    """Subsidy-first: any subsidized parish is D regardless of stability.
    Otherwise, stability tercile among the non-subsidized population."""
    if is_subsidized:
        return "D"
    if volatility_index <= low_cutoff:
        return "A"
    if volatility_index <= high_cutoff:
        return "B"
    return "C"
