"""
Prescriptive: Pastoral Assignment Simulation
POST scenario → simulate financial outcomes under different assignment configurations.

When `incoming_priest_id` is given, the destination institution's trajectory
is shifted by THAT priest's own historical performance ratio (see
_agent_simulation.build_priest_agent) rather than the abstract
assignment_duration/collection_impact knobs — a genuine priest-agent
carrying its own track record into the simulation, per the manuscript's
"agent-based simulation" description. Without it, the abstract knobs remain
the mechanism (preserves the original behavior for existing callers).
Either way, the result is now a Monte Carlo range (worst/likely/best),
sharing a diocese-wide subsidy pool with every other subsidized parish —
same agent core as institution_simulation.py, see _agent_simulation.py.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials
from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.prescriptive import _agent_simulation as _agent_sim
from app.services.supabase_client import get_table


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
            value *= 1 + collection_impact_pct / 100
        current_base = value
        results.append(
            {
                "period": period_date,
                "simulated_collection": round(max(0.0, value), 2),
            }
        )

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
            test_duration = (
                base_duration if param_name != "assignment_duration_months" else max(1, base_duration + delta)
            )
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


def _fetch_baseline(institution_id: str) -> tuple[np.ndarray, str]:
    """Returns (monthly total_receipts, resolved entity_type) — the entity
    type is needed by the caller to decide whether this institution can
    participate in the parish-only diocese subsidy pool (see
    _agent_simulation.py's module docstring on that scope boundary)."""
    aws_df = _aws_financials.parish_monthly_df(institution_id)
    if aws_df is not None and not aws_df.empty:
        return aws_df["total_receipts"].values.astype(float), "parish"

    schema = None
    receipt_cols: list[str] = []
    resolved_entity_type = ""
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
            resolved_entity_type = etype
            break

    if schema is None:
        raise ValueError(f"No financial records found for institution {institution_id}")

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
        raise ValueError(f"No financial records found for institution {institution_id}")

    df = pd.DataFrame(res.data)
    df = build_date_index(df)
    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    return df["total_receipts"].values.astype(float), resolved_entity_type


def _build_priest_agent_context(incoming_priest_id: str | None) -> tuple[float, float | None, dict[str, Any] | None]:
    """(performance_ratio, ratio_volatility, response context) for an
    incoming priest. performance_ratio defaults to 1.0 (no shift — the
    destination keeps its own baseline) whenever no priest id is given, or
    the priest has no usable assignment history to build a track record
    from — this is the genuine "no specific priest data" case, not an error."""
    if not incoming_priest_id:
        return 1.0, None, None

    priest_agent = _agent_sim.build_priest_agent(incoming_priest_id)
    if priest_agent is None:
        return 1.0, None, {"priest_id": incoming_priest_id, "status": "no_assignment_history_found"}

    context = {
        "priest_id": priest_agent.priest_id,
        "performance_ratio": round(priest_agent.performance_ratio, 4),
        "ratio_volatility": round(priest_agent.ratio_volatility, 4),
        "n_assignments_observed": priest_agent.n_assignments_observed,
    }
    return priest_agent.performance_ratio, priest_agent.ratio_volatility, context


def _fetch_and_run(
    institution_id: str,
    assignment_duration_months: int,
    collection_impact_pct: float,
    periods: int,
    incoming_priest_id: str | None = None,
    subsidy_pool_change_pct: float = 0.0,
) -> dict[str, Any]:
    started = time.perf_counter()
    ts = datetime.now(timezone.utc).isoformat()

    baseline, entity_type = _fetch_baseline(institution_id)
    simulated = _run_scenario(baseline, assignment_duration_months, collection_impact_pct, periods)
    sensitivity = _sensitivity_analysis(baseline, assignment_duration_months, collection_impact_pct, periods)
    dq = _decision_quality(simulated, baseline)

    performance_ratio, priest_ratio_volatility, priest_agent_context = _build_priest_agent_context(incoming_priest_id)

    pool_context: dict[str, Any] | None = None
    agent: _agent_sim.ParishAgent | None = None
    if entity_type == "parish":
        diocese_ctx = _agent_sim.build_parish_agent_with_pool_context(institution_id)
        if diocese_ctx is not None:
            agent, pool_context = diocese_ctx
    if agent is None:
        solo_df = pd.DataFrame({"total_receipts": baseline, "total_expenses": np.zeros_like(baseline)})
        agent = _agent_sim.build_parish_agent(institution_id, solo_df)

    if priest_ratio_volatility is not None:
        # Real-world uncertainty here comes from two independent sources —
        # how noisy this parish's own history is, and how consistent this
        # specific priest has been across their own past postings — so the
        # wider of the two drives the Monte Carlo spread rather than
        # silently deferring to just one.
        agent.volatility = max(agent.volatility, priest_ratio_volatility)

    real_priest_found = bool(priest_agent_context and "performance_ratio" in priest_agent_context)
    if real_priest_found:
        # The priest's own performance_ratio already encodes the level
        # shift — no separate growth knob layered on top of it.
        drift_pct = 0.0
    else:
        # No specific incoming priest (or none found): fall back to the
        # legacy knobs, translating the periodic "jump every N months" into
        # an equivalent average monthly drift so the new continuous-drift
        # Monte Carlo model still reflects the caller-supplied parameters
        # instead of ignoring them.
        drift_pct = (
            safe_div(collection_impact_pct, assignment_duration_months) if assignment_duration_months > 0 else 0.0
        )

    pool_share_val = pool_context["this_agent_pool_share"] if pool_context else 0.0
    paths = _agent_sim.run_monte_carlo(
        agent,
        periods,
        drift_pct,
        subsidy_pool_change_pct,
        pool_share_val,
        performance_ratio=performance_ratio,
    )
    monte_carlo_range = _agent_sim.summarize_paths(paths)

    # Scenario Coverage Rate: how much of the requested scenario resolved
    # from real agent data vs fell back to a default — the diocese subsidy
    # pool context, and (if a specific incoming priest was requested) their
    # actual track record. A priest that wasn't requested at all isn't a
    # coverage gap, so it counts as covered.
    coverage_factors = [1.0 if pool_context is not None else 0.0]
    if incoming_priest_id:
        coverage_factors.append(1.0 if real_priest_found else 0.0)
    kpis = {
        "scenario_processing_latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "scenario_coverage_rate": round(float(np.mean(coverage_factors)), 4),
    }

    return {
        "institution_id": institution_id,
        "scenario_params": {
            "assignment_duration_months": assignment_duration_months,
            "collection_impact_pct": collection_impact_pct,
            "periods": periods,
            "incoming_priest_id": incoming_priest_id,
            "subsidy_pool_change_pct": subsidy_pool_change_pct,
        },
        "scenario_results": simulated,
        "decision_quality_metrics": dq,
        "sensitivity_results": sensitivity,
        "priest_agent_context": priest_agent_context,
        "agent_context": {
            "is_subsidized": agent.is_subsidized,
            "volatility": round(agent.volatility, 4),
        },
        "subsidy_pool_context": pool_context,
        "monte_carlo_range": monte_carlo_range,
        "kpis": kpis,
        "timestamp": ts,
    }


async def run_pastoral_simulation(
    institution_id: str,
    assignment_duration_months: int = 12,
    collection_impact_pct: float = 5.0,
    periods: int = 12,
    incoming_priest_id: str | None = None,
    subsidy_pool_change_pct: float = 0.0,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        _fetch_and_run,
        institution_id,
        assignment_duration_months,
        collection_impact_pct,
        periods,
        incoming_priest_id,
        subsidy_pool_change_pct,
    )
