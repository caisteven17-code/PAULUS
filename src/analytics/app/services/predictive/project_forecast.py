"""
Predictive: Project Success Rate Forecast
XGBoost classifier + Logistic Regression — best by F1 on holdout.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import safe_div
from app.services.supabase_client import get_table


def _days_elapsed(start_str: str | None) -> float:
    if not start_str:
        return 0.0
    try:
        start = pd.Timestamp(start_str)
        now = pd.Timestamp.now()
        return max(0.0, float((now - start).days))
    except Exception:
        return 0.0


def _total_days(start_str: str | None, end_str: str | None) -> float:
    if not start_str or not end_str:
        return 365.0  # default 1 year
    try:
        start = pd.Timestamp(start_str)
        end = pd.Timestamp(end_str)
        return max(1.0, float((end - start).days))
    except Exception:
        return 365.0


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    proj_res = (
        get_table("diocese", "projects")
        .select("id, name, target_amount, current_amount, status, start_date, end_date, institution_id")
        .eq("institution_id", institution_id)
        .execute()
    )
    raw_projects = proj_res.data or []

    don_res = (
        get_table("diocese", "donations")
        .select("project_id, amount, created_at")
        .eq("institution_id", institution_id)
        .execute()
    )
    donations = don_res.data or []

    # Attempt project_expenses query
    try:
        exp_res = get_table("diocese", "project_expenses").select("project_id, amount").execute()
        expenses_data = exp_res.data or []
    except Exception:
        expenses_data = []

    # Aggregate donations and expenses per project
    don_count: dict[str, int] = {}
    don_total: dict[str, float] = {}
    for d in donations:
        pid = str(d.get("project_id", ""))
        don_count[pid] = don_count.get(pid, 0) + 1
        don_total[pid] = don_total.get(pid, 0.0) + float(d.get("amount") or 0)

    exp_total: dict[str, float] = {}
    for e in expenses_data:
        pid = str(e.get("project_id", ""))
        exp_total[pid] = exp_total.get(pid, 0.0) + float(e.get("amount") or 0)

    if not raw_projects:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "projects": [],
            "model_metrics": {},
            "timestamp": ts,
        }

    feature_rows: list[dict] = []
    label_rows: list[int] = []

    for p in raw_projects:
        pid = str(p.get("id", ""))
        target = float(p.get("target_amount") or 0)
        current = float(p.get("current_amount") or 0) + don_total.get(pid, 0.0)
        start = p.get("start_date")
        end = p.get("end_date")
        status = str(p.get("status") or "active").lower()

        elapsed = _days_elapsed(start)
        total_d = _total_days(start, end)
        completion = safe_div(current, target) if target > 0 else 0.0
        expense_rate = safe_div(exp_total.get(pid, 0.0), target) if target > 0 else 0.0

        row = {
            "project_id": pid,
            "name": p.get("name", ""),
            "completion_ratio": completion,
            "time_elapsed_ratio": safe_div(elapsed, total_d),
            "donation_count": float(don_count.get(pid, 0)),
            "expense_rate": expense_rate,
        }
        feature_rows.append(row)
        # Label: 1 = completed/successful, 0 = not
        label = 1 if status in ("completed", "done", "successful") else 0
        label_rows.append(label)

    feature_names = ["completion_ratio", "time_elapsed_ratio", "donation_count", "expense_rate"]
    X = np.array([[r[f] for f in feature_names] for r in feature_rows])
    y = np.array(label_rows)

    # Need at least 4 samples to train
    if len(X) < 4:
        # Fallback: heuristic success probability
        projects_out = []
        for r in feature_rows:
            sp = min(1.0, r["completion_ratio"] * 1.1)
            projects_out.append(
                {
                    "project_id": r["project_id"],
                    "name": r["name"],
                    "success_probability": round(sp, 4),
                    "risk_score": round(1.0 - sp, 4),
                    "predicted_delay": r["time_elapsed_ratio"] > r["completion_ratio"] + 0.1,
                }
            )
        return {
            "data_sufficient": True,
            "institution_id": institution_id,
            "projects": projects_out,
            "model_metrics": {"method": "heuristic"},
            "timestamp": ts,
        }

    # XGBoost classifier
    import xgboost as xgb
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import balanced_accuracy_score, brier_score_loss, f1_score, precision_score, recall_score
    from sklearn.model_selection import train_test_split

    n_class = int(np.sum(y))
    n_neg = len(y) - n_class
    if n_class == 0 or n_neg == 0:
        # All same class — use heuristic
        projects_out = []
        for i, r in enumerate(feature_rows):
            sp = float(y[i]) if len(y) > i else r["completion_ratio"]
            projects_out.append(
                {
                    "project_id": r["project_id"],
                    "name": r["name"],
                    "success_probability": round(sp, 4),
                    "risk_score": round(1.0 - sp, 4),
                    "predicted_delay": r["time_elapsed_ratio"] > r["completion_ratio"] + 0.1,
                }
            )
        return {
            "data_sufficient": True,
            "institution_id": institution_id,
            "projects": projects_out,
            "model_metrics": {"method": "heuristic_no_variance"},
            "timestamp": ts,
        }

    test_size = max(1, int(len(X) * 0.2))
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=test_size, random_state=42, stratify=None)

    # XGBoost
    xgb_clf = xgb.XGBClassifier(
        n_estimators=50,
        max_depth=3,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )
    xgb_clf.fit(X_tr, y_tr)
    xgb_preds = xgb_clf.predict(X_te)
    xgb_probas_te = xgb_clf.predict_proba(X_te)[:, 1]
    xgb_f1 = f1_score(y_te, xgb_preds, zero_division=0)
    xgb_precision = precision_score(y_te, xgb_preds, zero_division=0)
    xgb_recall = recall_score(y_te, xgb_preds, zero_division=0)
    xgb_balanced_accuracy = balanced_accuracy_score(y_te, xgb_preds)
    xgb_brier = brier_score_loss(y_te, xgb_probas_te)

    # Logistic Regression
    lr_clf = LogisticRegression(max_iter=500)
    lr_clf.fit(X_tr, y_tr)
    lr_preds = lr_clf.predict(X_te)
    lr_probas_te = lr_clf.predict_proba(X_te)[:, 1]
    lr_f1 = f1_score(y_te, lr_preds, zero_division=0)
    lr_precision = precision_score(y_te, lr_preds, zero_division=0)
    lr_recall = recall_score(y_te, lr_preds, zero_division=0)
    lr_balanced_accuracy = balanced_accuracy_score(y_te, lr_preds)
    lr_brier = brier_score_loss(y_te, lr_probas_te)

    # Champion by F1
    if xgb_f1 >= lr_f1:
        champion_clf = xgb_clf
        champion_name = "XGBoost"
        champion_f1 = xgb_f1
        champion_precision = xgb_precision
        champion_recall = xgb_recall
        champion_balanced_accuracy = xgb_balanced_accuracy
        champion_brier = xgb_brier
    else:
        champion_clf = lr_clf
        champion_name = "LogisticRegression"
        champion_f1 = lr_f1
        champion_precision = lr_precision
        champion_recall = lr_recall
        champion_balanced_accuracy = lr_balanced_accuracy
        champion_brier = lr_brier

    champion_clf.fit(X, y)  # refit on full data
    probas = champion_clf.predict_proba(X)

    projects_out = []
    for i, r in enumerate(feature_rows):
        prob_success = float(probas[i, 1]) if probas.shape[1] > 1 else float(probas[i, 0])
        predicted_delay = r["time_elapsed_ratio"] > r["completion_ratio"] + 0.1
        projects_out.append(
            {
                "project_id": r["project_id"],
                "name": r["name"],
                "success_probability": round(prob_success, 4),
                "risk_score": round(1.0 - prob_success, 4),
                "predicted_delay": predicted_delay,
            }
        )

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "projects": projects_out,
        "model_metrics": {
            "champion_model": champion_name,
            "xgboost_f1": round(float(xgb_f1), 4),
            "xgboost_precision": round(float(xgb_precision), 4),
            "xgboost_recall": round(float(xgb_recall), 4),
            "xgboost_balanced_accuracy": round(float(xgb_balanced_accuracy), 4),
            "xgboost_brier_score": round(float(xgb_brier), 4),
            "logistic_regression_f1": round(float(lr_f1), 4),
            "logistic_regression_precision": round(float(lr_precision), 4),
            "logistic_regression_recall": round(float(lr_recall), 4),
            "logistic_regression_balanced_accuracy": round(float(lr_balanced_accuracy), 4),
            "logistic_regression_brier_score": round(float(lr_brier), 4),
            "champion_f1": round(float(champion_f1), 4),
            "champion_precision": round(float(champion_precision), 4),
            "champion_recall": round(float(champion_recall), 4),
            "champion_balanced_accuracy": round(float(champion_balanced_accuracy), 4),
            "champion_brier_score": round(float(champion_brier), 4),
        },
        "timestamp": ts,
    }


async def get_project_forecast(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
