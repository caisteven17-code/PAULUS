"""
Prescriptive: Project Portfolio and Resource Recommendation
MLP regressor → predicted completion rate.
Priority scoring = success_probability * impact_weight / resource_cost.
Triangle rate estimates using Beta distribution.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import safe_div
from app.services.supabase_client import get_supabase, get_table


def _beta_triangle(optimistic: float, most_likely: float, pessimistic: float) -> float:
    """PERT/Beta weighted average: (O + 4*ML + P) / 6"""
    return (optimistic + 4 * most_likely + pessimistic) / 6


def _fetch_and_process(institution_id: str, total_budget: float) -> dict[str, Any]:
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
        .select("project_id, amount")
        .eq("institution_id", institution_id)
        .execute()
    )
    donations = don_res.data or []

    don_total: dict[str, float] = {}
    don_count: dict[str, int] = {}
    for d in donations:
        pid = str(d.get("project_id", ""))
        don_total[pid] = don_total.get(pid, 0.0) + float(d.get("amount") or 0)
        don_count[pid] = don_count.get(pid, 0) + 1

    if not raw_projects:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "prioritized_projects": [],
            "recommended_budget_allocation": {},
            "completion_rate_predictions": {},
            "timestamp": ts,
        }

    today = pd.Timestamp.now()
    feature_rows: list[dict] = []
    label_rows: list[float] = []

    for p in raw_projects:
        pid = str(p.get("id", ""))
        target = float(p.get("target_amount") or 0)
        current = float(p.get("current_amount") or 0) + don_total.get(pid, 0.0)
        start_s = p.get("start_date")
        end_s = p.get("end_date")
        status = str(p.get("status") or "active").lower()

        completion = safe_div(current, target) if target > 0 else 0.0

        if start_s:
            try:
                elapsed = max(0.0, float((today - pd.Timestamp(start_s)).days))
            except Exception:
                elapsed = 0.0
        else:
            elapsed = 0.0

        if start_s and end_s:
            try:
                total_d = max(1.0, float((pd.Timestamp(end_s) - pd.Timestamp(start_s)).days))
            except Exception:
                total_d = 365.0
        else:
            total_d = 365.0

        time_elapsed = safe_div(elapsed, total_d)
        progress_gap = completion - time_elapsed

        feature_rows.append({
            "project_id": pid,
            "name": p.get("name", ""),
            "target_amount": target,
            "completion_ratio": completion,
            "time_elapsed_ratio": time_elapsed,
            "donation_count": float(don_count.get(pid, 0)),
            "progress_gap": progress_gap,
        })
        # Label: completion ratio as continuous target
        label_rows.append(completion)

    if not feature_rows:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "prioritized_projects": [],
            "recommended_budget_allocation": {},
            "completion_rate_predictions": {},
            "timestamp": ts,
        }

    feature_names = ["completion_ratio", "time_elapsed_ratio", "donation_count", "progress_gap"]
    X = np.array([[r[f] for f in feature_names] for r in feature_rows])
    y = np.array(label_rows)

    completion_predictions: dict[str, float] = {}

    if len(X) >= 4:
        try:
            from sklearn.neural_network import MLPRegressor
            from sklearn.preprocessing import StandardScaler

            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            mlp = MLPRegressor(hidden_layer_sizes=(32, 16), max_iter=500, random_state=42)
            mlp.fit(X_scaled, y)
            y_pred = np.clip(mlp.predict(X_scaled), 0.0, 1.0)

            for i, r in enumerate(feature_rows):
                completion_predictions[r["project_id"]] = round(float(y_pred[i]), 4)
        except Exception:
            for r in feature_rows:
                completion_predictions[r["project_id"]] = round(r["completion_ratio"], 4)
    else:
        for r in feature_rows:
            completion_predictions[r["project_id"]] = round(r["completion_ratio"], 4)

    # Priority scoring and triangle rates
    prioritized: list[dict] = []
    for r in feature_rows:
        pid = r["project_id"]
        target = r["target_amount"]
        sp = completion_predictions.get(pid, r["completion_ratio"])
        resource_cost = max(1.0, target)
        impact_weight = 1.0 + r["donation_count"] * 0.01  # more donations = more community impact
        priority_score = round(safe_div(sp * impact_weight, resource_cost / 1e6), 4)

        # Triangle estimates
        opt = min(1.0, sp + 0.15)
        pess = max(0.0, sp - 0.20)
        ml = sp
        beta_estimate = round(_beta_triangle(opt, ml, pess), 4)

        prioritized.append({
            "project_id": pid,
            "name": r["name"],
            "success_probability": sp,
            "priority_score": priority_score,
            "target_amount": round(target, 2),
            "optimistic_completion": round(opt, 4),
            "most_likely_completion": round(ml, 4),
            "pessimistic_completion": round(pess, 4),
            "beta_estimate": beta_estimate,
        })

    prioritized.sort(key=lambda p: -p["priority_score"])

    # Budget allocation (proportional to priority_score)
    total_ps = sum(p["priority_score"] for p in prioritized) or 1.0
    budget_allocation: dict[str, float] = {}
    for p in prioritized:
        share = safe_div(p["priority_score"], total_ps)
        budget_allocation[p["project_id"]] = round(share * total_budget, 2)

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "prioritized_projects": prioritized,
        "recommended_budget_allocation": budget_allocation,
        "completion_rate_predictions": completion_predictions,
        "timestamp": ts,
    }


async def get_project_portfolio(institution_id: str, total_budget: float = 1000000.0) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id, total_budget)
