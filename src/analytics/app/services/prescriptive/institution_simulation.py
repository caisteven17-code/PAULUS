"""
Prescriptive: Institution Simulation (Digital Twin)
Scenario-based projection of financials + health score trajectory +
sensitivity analysis, plus a genuine agent-based Monte Carlo layer (see
_agent_simulation.py) — this institution's own parish-agent, sharing a
diocese-wide subsidy pool with every other subsidized parish when
entity_type is "parish", producing a best/worst/most-likely range rather
than one deterministic line.
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


def _compute_health_score(avg_receipts: float, avg_expenses: float, avg_consumable: float) -> float:
    operating_margin = safe_div(avg_receipts - avg_expenses, avg_receipts or 1)
    expense_ratio = safe_div(avg_expenses, avg_receipts or 1)
    liquidity = max(0.0, min(100.0, safe_div(avg_receipts, avg_expenses or 1) * 100))
    sustainability = max(0.0, min(100.0, 50 + operating_margin * 200))
    efficiency = max(0.0, min(100.0, 100 - max(0.0, expense_ratio - 0.75) * 200))
    reporting_compliance = 100.0
    return round(liquidity * 0.25 + sustainability * 0.25 + efficiency * 0.35 + reporting_compliance * 0.15, 2)


def _run_simulation(
    baseline_receipts: np.ndarray,
    baseline_expenses: np.ndarray,
    consumable_avg: float,
    collection_change_pct: float,
    expense_change_pct: float,
    periods: int,
) -> tuple[list[dict], list[dict]]:
    """Project financials forward and compute health score per period."""
    last_r = float(baseline_receipts[-1])
    last_e = float(baseline_expenses[-1])
    r_growth = 1 + collection_change_pct / 100
    e_growth = 1 + expense_change_pct / 100

    monthly: list[dict] = []
    health_traj: list[dict] = []
    base_date = pd.Timestamp.today().replace(day=1)

    for i in range(periods):
        period_date = (base_date + pd.DateOffset(months=i + 1)).strftime("%Y-%m")
        sim_r = last_r * (r_growth ** (i + 1))
        sim_e = last_e * (e_growth ** (i + 1))
        monthly.append(
            {
                "period": period_date,
                "simulated_receipts": round(sim_r, 2),
                "simulated_expenses": round(sim_e, 2),
                "net": round(sim_r - sim_e, 2),
            }
        )
        score = _compute_health_score(sim_r, sim_e, consumable_avg)
        health_traj.append({"period": period_date, "health_score": score})

    return monthly, health_traj


# Months of known-real history held out for the backtest below. Needs
# enough remaining training history on top of it to still be a reasonable
# baseline projection — 3 held-out months against a 6-month minimum training
# window keeps this usable down to institutions with modest history.
_BACKTEST_HOLDOUT_MONTHS = 3
_BACKTEST_MIN_TRAIN_MONTHS = 6


def _backtest_accuracy(
    baseline_receipts: np.ndarray,
    baseline_expenses: np.ndarray,
    consumable_avg: float,
) -> dict[str, float] | None:
    """Simulation Accuracy / Realized Outcome / Forecast-to-Simulation Error
    — there's no persisted history of past scenario runs to score a live
    prediction against, so instead this holds out the most recent
    _BACKTEST_HOLDOUT_MONTHS of REAL history, re-runs the exact same
    deterministic projector this endpoint already uses (_run_simulation)
    from the truncated series under a zero-change "business as usual"
    baseline (the only honest backtest assumption — we can't know what
    change_pct scenario a user will ask about for a genuinely future
    period), and compares the projection against what actually happened.
    None when there isn't enough history for a meaningful holdout."""
    if len(baseline_receipts) < _BACKTEST_MIN_TRAIN_MONTHS + _BACKTEST_HOLDOUT_MONTHS:
        return None

    train_r = baseline_receipts[:-_BACKTEST_HOLDOUT_MONTHS]
    train_e = baseline_expenses[:-_BACKTEST_HOLDOUT_MONTHS]
    actual_r = baseline_receipts[-_BACKTEST_HOLDOUT_MONTHS:]

    monthly, _health_traj = _run_simulation(train_r, train_e, consumable_avg, 0.0, 0.0, _BACKTEST_HOLDOUT_MONTHS)
    predicted_r = np.array([m["simulated_receipts"] for m in monthly])

    wape = safe_div(float(np.sum(np.abs(actual_r - predicted_r))), float(np.sum(np.abs(actual_r))))
    actual_total = float(np.sum(actual_r))
    predicted_total = float(np.sum(predicted_r))

    return {
        "simulation_accuracy": round(max(0.0, 1.0 - wape), 4),
        "forecast_to_simulation_error": round(wape, 4),
        "realized_outcome_pct": round(safe_div(predicted_total, actual_total) * 100, 2) if actual_total else 0.0,
    }


def _sensitivity_analysis(
    baseline_receipts: np.ndarray,
    baseline_expenses: np.ndarray,
    consumable_avg: float,
    base_cr: float,
    base_er: float,
    periods: int,
) -> dict[str, Any]:
    """Vary each parameter ±10% and report impact on terminal health score."""
    results: dict[str, Any] = {}
    params = {
        "collection_change_pct": base_cr,
        "expense_change_pct": base_er,
    }
    deltas = [-10, 10]

    for param, base_val in params.items():
        impacts: dict[str, float] = {}
        for delta in deltas:
            test_params = params.copy()
            test_params[param] = base_val + delta
            _, health_traj = _run_simulation(
                baseline_receipts,
                baseline_expenses,
                consumable_avg,
                test_params["collection_change_pct"],
                test_params["expense_change_pct"],
                periods,
            )
            terminal_score = health_traj[-1]["health_score"] if health_traj else 0.0
            impacts[f"{'+' if delta > 0 else ''}{delta}pct"] = terminal_score
        results[param] = impacts

    return results


def _fetch_baseline(institution_id: str, entity_type: str) -> tuple[np.ndarray, np.ndarray, float]:
    if entity_type == "parish":
        aws_df = _aws_financials.parish_monthly_df(institution_id)
        if aws_df is not None and not aws_df.empty:
            return (
                aws_df["total_receipts"].values.astype(float),
                aws_df["total_expenses"].values.astype(float),
                0.0,  # consumable_avg is accepted for signature compat but unused by _compute_health_score
            )

    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
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
        raise ValueError("No financial records found for this institution")

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)

    consumable_avg = float(df[consumable_col].mean()) if consumable_col in df.columns else 0.0

    return (
        df["total_receipts"].values.astype(float),
        df["total_expenses"].values.astype(float),
        consumable_avg,
    )


def _run_agent_monte_carlo(
    institution_id: str,
    entity_type: str,
    baseline_r: np.ndarray,
    baseline_e: np.ndarray,
    collection_change_pct: float,
    periods: int,
    subsidy_pool_change_pct: float,
) -> tuple[list[dict], dict[str, Any], dict[str, Any] | None]:
    """Builds this institution's parish-agent (diocese cross-section for
    parishes when AWS is available, a solo agent otherwise/for schools and
    seminaries — see module docstring on the pool's parish-only scope), runs
    the Monte Carlo layer, and returns (range, agent_context, pool_context)."""
    pool_context: dict[str, Any] | None = None
    agent: _agent_sim.ParishAgent | None = None

    if entity_type == "parish":
        diocese_ctx = _agent_sim.build_parish_agent_with_pool_context(institution_id)
        if diocese_ctx is not None:
            agent, pool_context = diocese_ctx

    if agent is None:
        solo_df = pd.DataFrame({"total_receipts": baseline_r, "total_expenses": baseline_e})
        agent = _agent_sim.build_parish_agent(institution_id, solo_df)

    pool_share_val = pool_context["this_agent_pool_share"] if pool_context else 0.0
    paths = _agent_sim.run_monte_carlo(
        agent,
        periods,
        collection_change_pct,
        subsidy_pool_change_pct,
        pool_share_val,
    )
    monte_carlo_range = _agent_sim.summarize_paths(paths)
    agent_context = {
        "cluster": agent.cluster,
        "is_subsidized": agent.is_subsidized,
        "volatility": round(agent.volatility, 4),
    }
    return monte_carlo_range, agent_context, pool_context


def _run_scenario(
    institution_id: str,
    entity_type: str,
    collection_change_pct: float,
    expense_change_pct: float,
    periods: int,
    subsidy_pool_change_pct: float = 0.0,
) -> dict[str, Any]:
    started = time.perf_counter()
    ts = datetime.now(timezone.utc).isoformat()

    baseline_r, baseline_e, consumable_avg = _fetch_baseline(institution_id, entity_type)

    monthly, health_traj = _run_simulation(
        baseline_r,
        baseline_e,
        consumable_avg,
        collection_change_pct,
        expense_change_pct,
        periods,
    )

    sensitivity = _sensitivity_analysis(
        baseline_r,
        baseline_e,
        consumable_avg,
        collection_change_pct,
        expense_change_pct,
        periods,
    )

    monte_carlo_range, agent_context, pool_context = _run_agent_monte_carlo(
        institution_id,
        entity_type,
        baseline_r,
        baseline_e,
        collection_change_pct,
        periods,
        subsidy_pool_change_pct,
    )

    backtest = _backtest_accuracy(baseline_r, baseline_e, consumable_avg)
    kpis = {
        "scenario_processing_latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "simulation_accuracy": backtest["simulation_accuracy"] if backtest else None,
        "realized_outcome_pct": backtest["realized_outcome_pct"] if backtest else None,
        "forecast_to_simulation_error": backtest["forecast_to_simulation_error"] if backtest else None,
    }

    return {
        "entity_id": institution_id,
        "entity_type": entity_type,
        "scenario_params": {
            "collection_change_pct": collection_change_pct,
            "expense_change_pct": expense_change_pct,
            "periods": periods,
            "subsidy_pool_change_pct": subsidy_pool_change_pct,
        },
        "simulated_monthly": monthly,
        "health_score_trajectory": health_traj,
        "sensitivity_results": sensitivity,
        "agent_context": agent_context,
        "subsidy_pool_context": pool_context,
        "monte_carlo_range": monte_carlo_range,
        "kpis": kpis,
        "timestamp": ts,
    }


async def run_institution_simulation(
    institution_id: str,
    entity_type: str,
    collection_change_pct: float = 0.0,
    expense_change_pct: float = 0.0,
    periods: int = 12,
    subsidy_pool_change_pct: float = 0.0,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(
        _run_scenario,
        institution_id,
        entity_type,
        collection_change_pct,
        expense_change_pct,
        periods,
        subsidy_pool_change_pct,
    )


# ── Counterfactual replay (Digital Twin) ──────────────────────────────────────
# Answers: "if this month's actual figures had been different, what would the
# trajectory up to today have looked like?" Reads only official records;
# never writes anywhere — results are returned to the caller.

_HEALTH_WINDOW = 6  # trailing months used per-period for the health score


def _fetch_monthly_history(institution_id: str, entity_type: str) -> pd.DataFrame:
    """Per-month history with totals, date-sorted. Empty DataFrame if no records."""
    if entity_type == "parish":
        aws_df = _aws_financials.parish_monthly_df(institution_id)
        if aws_df is not None and not aws_df.empty:
            aws_df = aws_df.copy()
            aws_df["consumable"] = 0.0  # unused by _compute_health_score; kept for column-shape parity
            return aws_df

    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
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
        return pd.DataFrame()

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    df["consumable"] = (
        pd.to_numeric(df[consumable_col], errors="coerce").fillna(0.0) if consumable_col in df.columns else 0.0
    )
    return df


def _trajectory(
    df: pd.DataFrame,
    receipts: np.ndarray,
    expenses: np.ndarray,
    start_idx: int,
) -> list[dict]:
    """Cumulative net + trailing-window health score from start_idx to the latest record."""
    points: list[dict] = []
    cumulative = 0.0
    consumables = df["consumable"].values.astype(float)

    for i in range(start_idx, len(df)):
        net = float(receipts[i] - expenses[i])
        cumulative += net
        lo = max(0, i - _HEALTH_WINDOW + 1)
        score = _compute_health_score(
            float(np.mean(receipts[lo : i + 1])),
            float(np.mean(expenses[lo : i + 1])),
            float(np.mean(consumables[lo : i + 1])),
        )
        points.append(
            {
                "period": df["date"].iloc[i].strftime("%Y-%m"),
                "receipts": round(float(receipts[i]), 2),
                "expenses": round(float(expenses[i]), 2),
                "net": round(net, 2),
                "cumulative_net": round(cumulative, 2),
                "health_score": score,
            }
        )
    return points


def _run_replay(
    institution_id: str,
    entity_type: str,
    start_month: int,
    start_year: int,
    modified_receipts: float | None,
    modified_expenses: float | None,
) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    df = _fetch_monthly_history(institution_id, entity_type)
    if df.empty:
        raise ValueError("No financial records found for this institution")

    start_date = pd.Timestamp(year=start_year, month=start_month, day=1)
    matches = df.index[df["date"] == start_date]
    if len(matches) == 0:
        available = [d.strftime("%Y-%m") for d in df["date"].tolist()]
        raise ValueError(f"No record for {start_date.strftime('%Y-%m')}. Available periods: {', '.join(available)}")
    start_idx = int(matches[0])

    actual_r = df["total_receipts"].values.astype(float)
    actual_e = df["total_expenses"].values.astype(float)

    cf_r = actual_r.copy()
    cf_e = actual_e.copy()
    if modified_receipts is not None:
        cf_r[start_idx] = float(modified_receipts)
    if modified_expenses is not None:
        cf_e[start_idx] = float(modified_expenses)

    actual_traj = _trajectory(df, actual_r, actual_e, start_idx)
    cf_traj = _trajectory(df, cf_r, cf_e, start_idx)

    return {
        "entity_id": institution_id,
        "entity_type": entity_type,
        "modified_period": start_date.strftime("%Y-%m"),
        "original_values": {
            "receipts": round(float(actual_r[start_idx]), 2),
            "expenses": round(float(actual_e[start_idx]), 2),
        },
        "modified_values": {
            "receipts": round(float(cf_r[start_idx]), 2),
            "expenses": round(float(cf_e[start_idx]), 2),
        },
        "actual_trajectory": actual_traj,
        "counterfactual_trajectory": cf_traj,
        "divergence": {
            "periods_compared": len(actual_traj),
            "cumulative_net_delta": round(cf_traj[-1]["cumulative_net"] - actual_traj[-1]["cumulative_net"], 2),
            "final_health_delta": round(cf_traj[-1]["health_score"] - actual_traj[-1]["health_score"], 2),
        },
        "timestamp": ts,
    }


async def run_counterfactual_replay(
    institution_id: str,
    entity_type: str,
    start_month: int,
    start_year: int,
    modified_receipts: float | None = None,
    modified_expenses: float | None = None,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    if not 1 <= start_month <= 12:
        raise ValueError(f"start_month must be 1-12, got {start_month}")
    if modified_receipts is None and modified_expenses is None:
        raise ValueError("At least one of modified_receipts or modified_expenses is required")
    return await asyncio.to_thread(
        _run_replay,
        institution_id,
        entity_type,
        start_month,
        start_year,
        modified_receipts,
        modified_expenses,
    )
