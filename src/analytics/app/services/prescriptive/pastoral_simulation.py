"""
Prescriptive: Pastoral Assignment Simulation
POST scenario → simulate financial outcomes under different assignment configurations.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_supabase, get_table


def _run_scenario(
    baseline: np.ndarray,
    assignment_duration_months: int,
    collection_impact_pct: float,
    periods: int,
) -> list[dict]:
    """
    Simulate monthly collections for `periods` months.
    At every `assignment_duration_months`, the collection baseline shifts by `collection_impact_pct`.
    """
    last_val = float(baseline[-1])
    base_growth = float(np.polyfit(range(len(baseline)), baseline, 1)[0])  # trend per month
    results = []
    current_base = last_val
    base_date = pd.Timestamp.today().replace(day=1)

    for i in range(periods):
        period_date = (base_date + pd.DateOffset(months=i + 1)).strftime("%Y-%m")
        # Apply trend
        value = current_base + base_growth
        # Apply assignment impact at transition boundaries
        if assignment_duration_months > 0 and (i + 1) % assignment_duration_months == 0:
            value *= (1 + collection_impact_pct / 100)
        current_base = value
        results.append({
            "period": period_date,
            "simulated_collection": round(max(0.0, value), 2),
        })

    return results


def _sensitivity_analysis(
    baseline: np.ndarray,
    base_duration: int,
    base_impact: float,
    periods: int,
) -> dict[str, Any]:
    sensitivity: dict[str, Any] = {}

    for param_name, param_val, delta_vals in [
        ("assignment_duration_months", base_duration, [-3, 3]),
        ("collection_impact_pct", base_impact, [-5, 5]),
    ]:
        impacts: dict[str, float] = {}
        for delta in delta_vals:
            test_duration = base_duration if param_name != "assignment_duration_months" else max(1, base_duration + delta)
            test_impact = base_impact if param_name != "collection_impact_pct" else base_impact + delta
            sim = _run_scenario(baseline, test_duration, test_impact, periods)
            terminal = sim[-1]["simulated_collection"] if sim else 0.0
            impacts[f"{'+' if delta > 0 else ''}{delta}"] = terminal
        sensitivity[param_name] = impacts

    return sensitivity


def _decision_quality(simulated: list[dict], baseline: np.ndarray) -> dict[str, float]:
    avg_baseline = float(np.mean(baseline))
    avg_simulated = float(np.mean([s["simulated_collection"] for s in simulated]))
    improvement = safe_div(avg_simulated - avg_baseline, avg_baseline) * 100
    return {
        "avg_baseline_collection": round(avg_baseline, 2),
        "avg_simulated_collection": round(avg_simulated, 2),
        "improvement_pct": round(improvement, 2),
    }


def _fetch_and_run(
    institution_id: str,
    assignment_duration_months: int,
    collection_impact_pct: float,
    periods: int,
) -> dict[str, Any]:
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
        baseline = np.array([1000.0] * 12)
    else:
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

        if not res.data:
            baseline = np.array([1000.0] * 12)
        else:
            df = pd.DataFrame(res.data)
            df = build_date_index(df)
            for col in receipt_cols:
                if col not in df.columns:
                    df[col] = 0.0
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
            df["total_receipts"] = df[receipt_cols].sum(axis=1)
            baseline = df["total_receipts"].values.astype(float)

    simulated = _run_scenario(baseline, assignment_duration_months, collection_impact_pct, periods)
    sensitivity = _sensitivity_analysis(baseline, assignment_duration_months, collection_impact_pct, periods)
    dq = _decision_quality(simulated, baseline)

    return {
        "institution_id": institution_id,
        "scenario_params": {
            "assignment_duration_months": assignment_duration_months,
            "collection_impact_pct": collection_impact_pct,
            "periods": periods,
        },
        "scenario_results": simulated,
        "decision_quality_metrics": dq,
        "sensitivity_results": sensitivity,
        "timestamp": ts,
    }


async def run_pastoral_simulation(
    institution_id: str,
    assignment_duration_months: int = 12,
    collection_impact_pct: float = 5.0,
    periods: int = 12,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        _fetch_and_run,
        institution_id, assignment_duration_months, collection_impact_pct, periods,
    )
