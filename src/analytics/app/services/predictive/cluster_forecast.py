"""
Predictive: Parish Cluster Forecast
XGBoost predicts next-period class label from a genuine point-in-time training
panel; Markov Chain provides transition probabilities from real observed
(label at T -> label at T+1) transitions.

Rebuilt from a same-period self-prediction bug: the model previously trained
on (current features -> current cluster_idx) and predicted on the identical
X it trained on — no time displacement anywhere, so "predicted_cluster" was
really "the model's reconstruction of the label it was just given," not a
forecast. Confirmed against the manuscript ("categorical forecasts of parish
cluster assignments in the subsequent period") that genuine next-period
forecasting is the correct target, not a documentation mismatch to relabel.

Point-in-time classification, not just "current": for every calendar cutoff,
each parish's features and the diocese-wide stability terciles are computed
using *only* data available on or before that cutoff — using today's global
terciles to label 2022 would leak future information into a "past" label and
make the eventual holdout artificially optimistic.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials, _parish_quadrant, _ttl_cache
from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
)
from app.services.supabase_client import get_table

# A/B/C/D — shared subsidy-first, then-stability classification. Transitions
# forecast here only make sense if "current cluster" is the exact definition
# descriptive/parish_cluster.py assigns, hence the shared module.
_CLUSTER_LABELS = _parish_quadrant.CLUSTER_LABELS
_LABEL_TO_IDX = {lbl: i for i, lbl in enumerate(_CLUSTER_LABELS)}
_IDX_TO_LABEL = {i: lbl for i, lbl in enumerate(_CLUSTER_LABELS)}

_FEATURE_NAMES = ["avg_monthly_collection", "volatility_index", "net_margin", "is_subsidized"]

# Minimum months of history before a point-in-time cutoff is used at all —
# compute_features' STL step degrades gracefully below 24 months (see
# _stl.py) but a cutoff needs at least a full year to mean anything.
_MIN_HISTORY_MONTHS = 12

# Cross-sections are built quarterly, not monthly: each cutoff re-runs a full
# STL decomposition for every eligible parish, so a monthly step would be
# ~3x the compute for only marginally denser training pairs. Cached at
# MONTHLY_TTL_SECONDS regardless (see get_cluster_forecast), so the one-time
# cost per cache refresh is what matters, not per-request latency.
_CUTOFF_STEP_MONTHS = 3


def _extract_totals(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure total_receipts/total_expenses/subsidy_receipts columns exist,
    deriving them from raw columns on the Supabase path (AWS already has them)."""
    if "total_receipts" not in df.columns or "total_expenses" not in df.columns:
        for col in PARISH_RECEIPTS + PARISH_EXPENSES:
            if col not in df.columns:
                df[col] = 0.0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
        df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)
        # subsidy_inflow is already one of PARISH_RECEIPTS (summed into
        # total_receipts above) — mirrored into subsidy_receipts to match the
        # AWS path's column name, since _parish_quadrant needs it isolated
        # from total_receipts (see its compute_features docstring).
        if "subsidy_receipts" not in df.columns:
            df["subsidy_receipts"] = df["subsidy_inflow"] if "subsidy_inflow" in df.columns else 0.0
    return df


def _current_features(df: pd.DataFrame) -> dict[str, float]:
    """Features using the parish's *full* available series — used only for
    "current cluster" (must match descriptive/parish_cluster.py exactly) and
    for the forward prediction input, never for a training label."""
    r = df["total_receipts"].to_numpy(dtype=float)
    e = df["total_expenses"].to_numpy(dtype=float)
    subsidy = df["subsidy_receipts"].to_numpy(dtype=float) if "subsidy_receipts" in df.columns else None
    return _parish_quadrant.compute_features(r, e, subsidy)


def _eligible_cutoffs(all_series: list[tuple[str, pd.DataFrame]]) -> list[pd.Timestamp]:
    """Calendar cutoffs (quarterly-stepped) spanning from the diocese's
    earliest eligible history through its latest, leaving room for at least
    one subsequent cutoff to exist (a training pair needs a label at t+1)."""
    all_dates: set[pd.Timestamp] = set()
    for _, df in all_series:
        all_dates.update(df["date"].tolist())
    if not all_dates:
        return []

    sorted_dates = sorted(all_dates)
    earliest, latest = sorted_dates[0], sorted_dates[-1]
    cutoffs = []
    cursor = earliest + pd.DateOffset(months=_MIN_HISTORY_MONTHS - 1)
    while cursor < latest:
        cutoffs.append(cursor)
        cursor = cursor + pd.DateOffset(months=_CUTOFF_STEP_MONTHS)
    return cutoffs


def _classify_cross_section(
    all_series: list[tuple[str, pd.DataFrame]], cutoff: pd.Timestamp
) -> dict[str, dict[str, Any]]:
    """Point-in-time features + classification for every parish with enough
    history *as of this cutoff* — the stability terciles used here are this
    cutoff's own (computed only from data available then), not the current
    global ones, which is what actually prevents the look-ahead bias."""
    features_by_parish: dict[str, dict[str, Any]] = {}
    for iid, df in all_series:
        sub = df[df["date"] <= cutoff]
        if len(sub) < _MIN_HISTORY_MONTHS:
            continue
        r = sub["total_receipts"].to_numpy(dtype=float)
        e = sub["total_expenses"].to_numpy(dtype=float)
        subsidy = sub["subsidy_receipts"].to_numpy(dtype=float) if "subsidy_receipts" in sub.columns else None
        features_by_parish[iid] = _parish_quadrant.compute_features(r, e, subsidy)

    if len(features_by_parish) < 4:
        return {}

    low, high = _parish_quadrant.stability_terciles(list(features_by_parish.values()))
    for feats in features_by_parish.values():
        feats["cluster_label"] = _parish_quadrant.classify(feats["volatility_index"], feats["is_subsidized"], low, high)
    return features_by_parish


def _build_training_panel(
    all_series: list[tuple[str, pd.DataFrame]],
) -> tuple[np.ndarray, np.ndarray, list[tuple[str, str]], dict[str, float]] | None:
    """Genuine (features at cutoff t -> cluster label actually observed at
    t+1) pairs across every parish and every eligible cutoff — a real
    longitudinal panel, replacing the old same-period (current -> current)
    construction. Returns (X, y, real_transitions, holdout_metrics) or None
    if there isn't enough cutoff depth yet."""
    cutoffs = _eligible_cutoffs(all_series)
    if len(cutoffs) < 3:  # need >= 2 transitions: train on the first, hold out the last
        return None

    cross_sections = {cutoff: _classify_cross_section(all_series, cutoff) for cutoff in cutoffs}

    def pairs_for(i: int) -> tuple[list[list[float]], list[int], list[tuple[str, str]]]:
        section_t = cross_sections[cutoffs[i]]
        section_next = cross_sections[cutoffs[i + 1]]
        X_rows, y_rows, transitions = [], [], []
        for iid, feats in section_t.items():
            if iid not in section_next:
                continue
            X_rows.append([float(feats[f]) for f in _FEATURE_NAMES])
            label_next = section_next[iid]["cluster_label"]
            y_rows.append(_LABEL_TO_IDX[label_next])
            transitions.append((feats["cluster_label"], label_next))
        return X_rows, y_rows, transitions

    # Train on every transition except the most recent; hold out the most
    # recent one as a genuine, never-trained-on temporal test set.
    train_X: list[list[float]] = []
    train_y: list[int] = []
    train_transitions: list[tuple[str, str]] = []
    for i in range(len(cutoffs) - 2):
        X_rows, y_rows, transitions = pairs_for(i)
        train_X.extend(X_rows)
        train_y.extend(y_rows)
        train_transitions.extend(transitions)

    holdout_X, holdout_y, holdout_transitions = pairs_for(len(cutoffs) - 2)

    if len(train_X) < 10 or len(holdout_X) < 4:
        return None

    import xgboost as xgb
    from sklearn.metrics import balanced_accuracy_score, f1_score

    clf = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=3,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
    )
    clf.fit(np.array(train_X), np.array(train_y))
    holdout_preds = clf.predict(np.array(holdout_X))

    holdout_metrics = {
        "macro_f1": round(float(f1_score(holdout_y, holdout_preds, average="macro", zero_division=0)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(holdout_y, holdout_preds)), 4),
        "holdout_size": len(holdout_X),
    }

    # Refit on the full training panel *and* the holdout transition (once
    # evaluated) so the model used for the actual forward prediction below
    # uses every real transition observed, not just the ones used to score it.
    all_transitions = train_transitions + holdout_transitions
    full_X = np.array(train_X + holdout_X)
    full_y = np.array(train_y + holdout_y)
    clf.fit(full_X, full_y)

    return full_X, full_y, all_transitions, holdout_metrics, clf


def _fetch_and_process() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    aws_series = _aws_financials.all_parish_monthly_dfs()
    if aws_series is not None:
        all_series = [(iid, _extract_totals(df)) for iid, df in aws_series if len(df) >= 6]
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
                "parish_predictions": [],
                "transition_matrix": {},
                "movement_summary": {lbl: 0 for lbl in _CLUSTER_LABELS},
                "model_metrics": {},
                "timestamp": ts,
            }

        all_cols = ["institution_id", "month", "year"] + PARISH_RECEIPTS + PARISH_EXPENSES
        seen: set[str] = set()
        select_cols: list[str] = []
        for c in all_cols:
            if c not in seen:
                select_cols.append(c)
                seen.add(c)

        def _worker(inst: dict) -> tuple[str, pd.DataFrame] | None:
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
            if not res.data or len(res.data) < 6:
                return None
            df = build_date_index(pd.DataFrame(res.data))
            return iid, _extract_totals(df)

        all_series = [r for r in run_parallel(_worker, institutions) if r is not None]

    if len(all_series) < 4:
        return {
            "data_sufficient": False,
            "parish_predictions": [],
            "transition_matrix": {},
            "movement_summary": {lbl: 0 for lbl in _CLUSTER_LABELS},
            "model_metrics": {},
            "timestamp": ts,
        }

    # "Current" cluster — full available history per parish, global terciles
    # across all of them — must stay identical to descriptive/parish_cluster.py.
    current_features: dict[str, dict[str, Any]] = {}
    for iid, df in all_series:
        current_features[iid] = _current_features(df)
    low, high = _parish_quadrant.stability_terciles(list(current_features.values()))
    for feats in current_features.values():
        feats["cluster_label"] = _parish_quadrant.classify(feats["volatility_index"], feats["is_subsidized"], low, high)

    panel = _build_training_panel(all_series)

    if panel is None:
        # Not enough cutoff depth yet for a genuine temporal model — degrade
        # to reporting only the current classification, no forecast. This is
        # an honest "not ready yet," not a same-period substitute forecast.
        return {
            "data_sufficient": True,
            "parish_predictions": [
                {
                    "institution_id": iid,
                    "current_cluster": feats["cluster_label"],
                    "predicted_cluster": None,
                    "probability": None,
                }
                for iid, feats in current_features.items()
            ],
            "transition_matrix": {},
            "movement_summary": {lbl: 0 for lbl in _CLUSTER_LABELS},
            "model_metrics": {"status": "insufficient_cutoff_history_for_temporal_model"},
            "timestamp": ts,
        }

    _full_X, _full_y, all_transitions, holdout_metrics, clf = panel

    # Real transition matrix — built from every observed (label_t -> label_t+1)
    # pair across history, not from same-period self-predictions.
    tm = np.zeros((4, 4))
    for label_t, label_next in all_transitions:
        tm[_LABEL_TO_IDX[label_t], _LABEL_TO_IDX[label_next]] += 1
    row_sums = tm.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    tm_norm = (tm / row_sums).tolist()
    transition_matrix = {
        _CLUSTER_LABELS[i]: {_CLUSTER_LABELS[j]: round(float(tm_norm[i][j]), 4) for j in range(4)} for i in range(4)
    }

    # Genuine forward prediction: feed each parish's *current* (full-history)
    # features into the model trained on real past transitions.
    parish_predictions = []
    movement_summary = {lbl: 0 for lbl in _CLUSTER_LABELS}
    institution_ids = list(current_features.keys())
    X_current = np.array([[float(current_features[iid][f]) for f in _FEATURE_NAMES] for iid in institution_ids])
    predicted_idx = clf.predict(X_current)
    predicted_proba = clf.predict_proba(X_current)

    for i, iid in enumerate(institution_ids):
        current_label = current_features[iid]["cluster_label"]
        predicted_label = _IDX_TO_LABEL.get(int(predicted_idx[i]), current_label)
        movement_summary[predicted_label] = movement_summary.get(predicted_label, 0) + 1
        parish_predictions.append(
            {
                "institution_id": iid,
                "current_cluster": current_label,
                "predicted_cluster": predicted_label,
                "probability": round(float(np.max(predicted_proba[i])), 4),
            }
        )

    return {
        "data_sufficient": True,
        "parish_predictions": parish_predictions,
        "transition_matrix": transition_matrix,
        "movement_summary": movement_summary,
        "model_metrics": holdout_metrics,
        "timestamp": ts,
    }


async def get_cluster_forecast() -> dict[str, Any]:
    # Diocese-wide, identical for every caller, no request parameters —
    # trains/runs XGBoost fresh each call, so duplicate concurrent hits are
    # even more expensive than the read-only descriptive endpoints. Same
    # monthly cadence as descriptive/parish_cluster.py's classification
    # (see _ttl_cache.MONTHLY_TTL_SECONDS) — these transitions forecast from
    # that classification, so refreshing more often than it does would just
    # retrain against the same current-cluster labels for no benefit.
    return await _ttl_cache.cached(
        "cluster_forecast", _ttl_cache.MONTHLY_TTL_SECONDS, lambda: asyncio.to_thread(_fetch_and_process)
    )
