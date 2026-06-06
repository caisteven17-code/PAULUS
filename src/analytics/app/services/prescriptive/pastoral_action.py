"""
Prescriptive: Pastoral Action Recommendations
MLP regressor on assignment-period data + DEA proxy via LP efficiency frontier.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_table


def _dea_efficiency(inputs: np.ndarray, outputs: np.ndarray) -> list[float]:
    """
    Compute DEA efficiency scores via LP.
    inputs: (n, 1) — e.g., normalized time index as proxy for resource
    outputs: (n, 1) — e.g., avg monthly collection
    Returns efficiency score in [0, 1] for each DMU.
    """
    try:
        import pulp

        n = len(inputs)
        scores = []
        for i in range(n):
            prob = pulp.LpProblem(f"DEA_{i}", pulp.LpMaximize)
            lambdas = [pulp.LpVariable(f"l_{j}", lowBound=0) for j in range(n)]
            _theta = pulp.LpVariable("theta", lowBound=0)  # noqa: F841

            # Maximize weighted output
            prob += pulp.lpSum(outputs[j] * lambdas[j] for j in range(n))

            # Input constraint
            prob += pulp.lpSum(inputs[j] * lambdas[j] for j in range(n)) <= inputs[i]

            # Output target
            prob += pulp.lpSum(outputs[j] * lambdas[j] for j in range(n)) >= outputs[i]

            # VRS: lambda sum = 1
            prob += pulp.lpSum(lambdas) == 1

            prob.solve(pulp.PULP_CBC_CMD(msg=0))

            if prob.status == 1:
                eff = safe_div(
                    float(sum(outputs[j] * float(lambdas[j].varValue or 0) for j in range(n))),
                    float(outputs[i]) or 1.0,
                )
                scores.append(min(1.0, max(0.0, round(eff, 4))))
            else:
                scores.append(0.5)

        return scores

    except Exception:
        # Fallback: rank by output/input ratio
        ratios = [safe_div(float(outputs[i]), float(inputs[i]) or 1) for i in range(len(inputs))]
        max_r = max(ratios) or 1.0
        return [round(r / max_r, 4) for r in ratios]


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    schema = None
    receipt_cols: list[str] = []
    for etype, (s, rc, _, _) in _SCHEMA_MAP.items():
        res_check = (
            get_table(s, "financial_records")
            .select("institution_id")
            .eq("institution_id", institution_id)
            .limit(1)
            .execute()
        )
        if res_check.data:
            schema, receipt_cols, _, _ = _SCHEMA_MAP[etype]
            break

    if schema is None:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "recommended_actions": [],
            "efficiency_scores": {},
            "performance_improvement_estimate": 0.0,
            "timestamp": ts,
        }

    all_cols = ["institution_id", "month", "year"] + receipt_cols
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    res = (
        get_table(schema, "financial_records")
        .select(", ".join(select_cols))
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    if not res.data or len(res.data) < 6:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "recommended_actions": [],
            "efficiency_scores": {},
            "performance_improvement_estimate": 0.0,
            "timestamp": ts,
        }

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)

    # Group by year as proxy for assignment periods
    yearly = df.groupby("year")["total_receipts"].agg(["mean", "count", "std"]).reset_index()
    yearly.columns = ["year", "avg_collection", "count", "std"]
    yearly["std"] = yearly["std"].fillna(0.0)

    n = len(yearly)
    if n < 2:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "recommended_actions": [],
            "efficiency_scores": {},
            "performance_improvement_estimate": 0.0,
            "timestamp": ts,
        }

    # MLP: predict avg_collection from year + count features
    from sklearn.neural_network import MLPRegressor
    from sklearn.preprocessing import StandardScaler

    X = yearly[["year", "count"]].values.astype(float)
    y = yearly["avg_collection"].values.astype(float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    mlp = MLPRegressor(hidden_layer_sizes=(32, 16), max_iter=500, random_state=42)
    mlp.fit(X_scaled, y)
    _y_pred = mlp.predict(X_scaled)  # noqa: F841

    # DEA: inputs = time index, outputs = avg_collection
    time_inputs = np.arange(1, n + 1).astype(float)
    dea_scores = _dea_efficiency(time_inputs, y)

    efficiency_scores = {str(int(yearly["year"].iloc[i])): dea_scores[i] for i in range(n)}

    # Actions: for below-frontier periods, recommend improvement
    recommended_actions = []
    max_collection = float(np.max(y))
    for i in range(n):
        eff = dea_scores[i]
        if eff < 0.8:
            gap = max_collection - float(y[i])
            recommended_actions.append(
                {
                    "period": str(int(yearly["year"].iloc[i])),
                    "efficiency_score": eff,
                    "avg_collection": round(float(y[i]), 2),
                    "collection_gap": round(gap, 2),
                    "action": "Review assignment strategy and increase community engagement activities.",
                }
            )

    # Performance improvement estimate: avg gap for inefficient periods
    if recommended_actions:
        avg_gap = float(np.mean([a["collection_gap"] for a in recommended_actions]))
        avg_hist = float(np.mean(y))
        perf_improvement = round(safe_div(avg_gap, avg_hist) * 100, 2)
    else:
        perf_improvement = 0.0

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "recommended_actions": recommended_actions,
        "efficiency_scores": efficiency_scores,
        "performance_improvement_estimate": perf_improvement,
        "timestamp": ts,
    }


async def get_pastoral_action(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
