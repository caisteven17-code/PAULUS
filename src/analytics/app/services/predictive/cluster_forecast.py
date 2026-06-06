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

from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    PARISH_EXPENSES,
    PARISH_RECEIPTS,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

_CLUSTER_LABELS = ["High-Performing", "Growing", "Stable", "At-Risk"]
_LABEL_TO_IDX = {lbl: i for i, lbl in enumerate(_CLUSTER_LABELS)}
_IDX_TO_LABEL = {i: lbl for i, lbl in enumerate(_CLUSTER_LABELS)}


def _rule_cluster(avg: float, growth: float, deficit_rate: float, cv: float) -> int:
    if deficit_rate > 0.4 or growth < -0.05:
        return 3  # At-Risk
    if growth >= 0.05:
        return 1  # Growing
    if cv < 0.3:
        return 0  # High-Performing
    return 2  # Stable


def _extract_features(df: pd.DataFrame) -> dict[str, float]:
    for col in PARISH_RECEIPTS + PARISH_EXPENSES:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[PARISH_RECEIPTS].sum(axis=1)
    df["total_expenses"] = df[PARISH_EXPENSES].sum(axis=1)

    r = df["total_receipts"].values.astype(float)
    e = df["total_expenses"].values.astype(float)
    n = len(r)

    avg = float(np.mean(r))
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

    return {
        "avg_collection": avg,
        "variance": var,
        "cv": cv,
        "growth_rate": growth,
        "deficit_rate": deficit_rate,
        "cluster_idx": _rule_cluster(avg, growth, deficit_rate, cv),
    }


def _fetch_and_process() -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    inst_res = (
        get_table("diocese", "institutions").select("id, institution_type").eq("institution_type", "parish").execute()
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

    feature_names = ["avg_collection", "variance", "cv", "growth_rate", "deficit_rate"]
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
        current_label = _IDX_TO_LABEL.get(int(r["cluster_idx"]), "Stable")
        predicted_label = _IDX_TO_LABEL.get(int(predicted_clusters[i]), "Stable")
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
