"""
Predictive: Parish Cluster Forecast
XGBoost predicts next cluster label; Markov Chain provides transition probabilities.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials, _parish_quadrant
from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
)
from app.services.supabase_client import get_table

# A/B/C/D — shared Stability × Net Margin quadrant. Transitions forecast here
# only make sense if "current cluster" is the exact definition
# descriptive/parish_cluster.py assigns, hence the shared module.
_CLUSTER_LABELS = _parish_quadrant.CLUSTER_LABELS
_LABEL_TO_IDX = {lbl: i for i, lbl in enumerate(_CLUSTER_LABELS)}
_IDX_TO_LABEL = {i: lbl for i, lbl in enumerate(_CLUSTER_LABELS)}


def _extract_features(df: pd.DataFrame) -> dict[str, float]:
    if "total_receipts" not in df.columns or "total_expenses" not in df.columns:
        # Supabase path: totals aren't precomputed, derive them from raw columns.
        for col in PARISH_RECEIPTS + PARISH_EXPENSES:
            if col not in df.columns:
                df[col] = 0.0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
        df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

    r = df["total_receipts"].values.astype(float)
    e = df["total_expenses"].values.astype(float)
    # cluster_idx is assigned in a second pass — the stable/volatile cutoff is
    # a diocese-wide median, unknowable per-parish in isolation.
    return _parish_quadrant.compute_features(r, e)


def _fetch_and_process() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    aws_series = _aws_financials.all_parish_monthly_dfs()
    if aws_series is not None:
        rows = []
        for iid, df in aws_series:
            if len(df) < 6:
                continue
            feats = _extract_features(df)
            feats["institution_id"] = iid
            rows.append(feats)
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
            if not res.data or len(res.data) < 6:
                return None
            df = pd.DataFrame(res.data)
            df = build_date_index(df)
            feats = _extract_features(df)
            feats["institution_id"] = iid
            return feats

        rows = run_parallel(_worker, institutions)

    if len(rows) < 4:
        return {
            "data_sufficient": False,
            "parish_predictions": [],
            "transition_matrix": {},
            "movement_summary": {lbl: 0 for lbl in _CLUSTER_LABELS},
            "timestamp": ts,
        }

    # Second pass: diocese-wide median volatility split, then assign every
    # parish its current A/B/C/D quadrant label — identical definition to
    # descriptive/parish_cluster.py by construction (shared module).
    threshold = _parish_quadrant.stability_threshold(rows)
    for r_ in rows:
        r_["cluster_idx"] = _LABEL_TO_IDX[
            _parish_quadrant.classify(r_["volatility_index"], r_["net_margin"], threshold)
        ]

    feature_names = ["avg_monthly_collection", "volatility_index", "net_margin"]
    X = np.array([[r[f] for f in feature_names] for r in rows])
    y = np.array([r["cluster_idx"] for r in rows])

    # XGBoost classifier
    import xgboost as xgb

    clf = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=3,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
    )

    n = len(rows)
    if n >= 5:
        clf.fit(X, y)
        predicted_clusters = clf.predict(X).tolist()
        predicted_proba = clf.predict_proba(X).tolist()
    else:
        predicted_clusters = y.tolist()
        predicted_proba = [[0.25] * 4] * n

    # Transition matrix (Markov): current → predicted
    tm = np.zeros((4, 4))
    for i, r in enumerate(rows):
        current = int(r["cluster_idx"])
        predicted = int(predicted_clusters[i])
        tm[current, predicted] += 1

    row_sums = tm.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    tm_norm = (tm / row_sums).tolist()

    transition_matrix = {
        _CLUSTER_LABELS[i]: {_CLUSTER_LABELS[j]: round(float(tm_norm[i][j]), 4) for j in range(4)} for i in range(4)
    }

    movement_summary = {lbl: 0 for lbl in _CLUSTER_LABELS}
    parish_predictions = []
    for i, r in enumerate(rows):
        current_label = _IDX_TO_LABEL.get(int(r["cluster_idx"]), _CLUSTER_LABELS[0])
        predicted_label = _IDX_TO_LABEL.get(int(predicted_clusters[i]), _CLUSTER_LABELS[0])
        movement_summary[predicted_label] = movement_summary.get(predicted_label, 0) + 1
        proba = predicted_proba[i] if isinstance(predicted_proba[i], list) else [0.25] * 4
        parish_predictions.append(
            {
                "institution_id": r["institution_id"],
                "current_cluster": current_label,
                "predicted_cluster": predicted_label,
                "probability": round(float(max(proba)), 4),
            }
        )

    return {
        "data_sufficient": True,
        "parish_predictions": parish_predictions,
        "transition_matrix": transition_matrix,
        "movement_summary": movement_summary,
        "timestamp": ts,
    }


async def get_cluster_forecast() -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process)
