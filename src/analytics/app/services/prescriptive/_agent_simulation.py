"""
Agent-based simulation core shared by Institution Simulation and Pastoral
Assignment Simulation.

Both endpoints previously projected a single institution forward with one
deterministic trend line — not "agent-based" in any real sense, despite the
manuscript (Section 3.2.1.2.2, duplicated in the Appendix) explicitly
describing both as agent-based. Genuinely agent-based requires: (1) each
parish carrying its own state/history rather than one shared top-down
formula, (2) a priest identity carrying ITS OWN track record when a
reassignment is being modeled, and (3) a shared resource (the diocese
subsidy pool) whose size links one subsidized parish-agent's simulated
outcome to what happens to every OTHER subsidized parish-agent — the actual
"agents interacting," not just independent parallel copies of one equation.

Monte Carlo (many randomized paths -> best/worst/most-likely) is layered on
top of this same agent core rather than built as a separate mechanism, so it
satisfies the manuscript Appendix glossary's "Sandbox Scenario Results"
definition using the one architecture, not two.

Scope: the shared subsidy pool is a parish-only mechanic, matching
_parish_quadrant.py's own explicit scope (Class D / diocese subsidy is
defined only for parishes, keyed off IAFR account B.3.03; schools/
seminaries have no equivalent concept anywhere else in this codebase).
Institution Simulation still runs genuine per-agent Monte Carlo for
schools/seminaries, just without the cross-institution pool-sharing term.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials, _parish_quadrant
from app.services._parish_quadrant import SUBSIDY_WINDOW_MONTHS
from app.services.data_definitions import safe_div
from app.services.supabase_client import get_table

# Enough paths for stable 10th/50th/90th percentiles without meaningfully
# slowing a single request (each path is a few dozen scalar arithmetic steps).
N_MONTE_CARLO_PATHS = 300
_PESSIMISTIC_PCTL = 10
_OPTIMISTIC_PCTL = 90

# A lone data point (a brand-new institution, or a priest with a single
# assignment) carries no real variance signal — this default keeps Monte
# Carlo from collapsing to a single deterministic path in that edge case,
# without pretending to know a more specific number.
_DEFAULT_VOLATILITY = 0.05


@dataclass
class ParishAgent:
    """One parish's own state: its baseline, how noisy its own history has
    been, and whether it draws from the shared diocese subsidy pool."""

    institution_id: str
    avg_receipts: float
    avg_expenses: float
    volatility: float  # relative std of month-over-month receipt changes
    is_subsidized: bool
    avg_monthly_subsidy: float
    cluster: str | None = None  # A/B/C/D — only set when a diocese-wide cross-section was available


def build_parish_agent(institution_id: str, df: pd.DataFrame) -> ParishAgent:
    """df needs total_receipts/total_expenses (and, for parishes with AWS
    data, subsidy_receipts) — same shape every AWS/Supabase reader in this
    codebase already produces."""
    receipts = df["total_receipts"].to_numpy(dtype=float) if "total_receipts" in df.columns else np.array([])
    expenses = df["total_expenses"].to_numpy(dtype=float) if "total_expenses" in df.columns else np.array([])
    subsidy = (
        df["subsidy_receipts"].to_numpy(dtype=float) if "subsidy_receipts" in df.columns else np.zeros_like(receipts)
    )

    avg_receipts = float(np.mean(receipts)) if len(receipts) else 0.0
    avg_expenses = float(np.mean(expenses)) if len(expenses) else 0.0

    if len(receipts) > 1:
        prior = receipts[:-1]
        pct_changes = np.diff(receipts) / np.where(prior == 0, 1, prior)
        volatility = float(np.std(pct_changes))
    else:
        volatility = _DEFAULT_VOLATILITY

    window_subsidy = subsidy[-SUBSIDY_WINDOW_MONTHS:]
    is_subsidized = bool(np.sum(window_subsidy) > 0)
    positive = window_subsidy[window_subsidy > 0]
    avg_monthly_subsidy = float(np.mean(positive)) if len(positive) else 0.0

    return ParishAgent(
        institution_id=institution_id,
        avg_receipts=avg_receipts,
        avg_expenses=avg_expenses,
        volatility=volatility,
        is_subsidized=is_subsidized,
        avg_monthly_subsidy=avg_monthly_subsidy,
    )


def build_parish_agent_with_pool_context(
    institution_id: str,
) -> tuple[ParishAgent, dict[str, Any]] | None:
    """Full diocese cross-section for parish-agents: this institution's own
    agent plus shared subsidy-pool context, reusing the exact classification
    pattern predictive/cluster_forecast.py uses for "current" cluster labels
    so the reported cluster always matches descriptive/parish_cluster.py.
    Shared by institution_simulation.py and pastoral_simulation.py so the
    diocese-wide fetch/classify logic exists in one place. None when AWS is
    unavailable or this institution isn't found there — caller falls back
    to a solo agent with no pool participation."""
    all_series = _aws_financials.all_parish_monthly_dfs()
    if all_series is None:
        return None

    agents: dict[str, ParishAgent] = {}
    features_by_parish: dict[str, dict] = {}
    for iid, df in all_series:
        if len(df) < 6:
            continue
        agents[iid] = build_parish_agent(iid, df)
        r = df["total_receipts"].to_numpy(dtype=float)
        e = df["total_expenses"].to_numpy(dtype=float)
        s = df["subsidy_receipts"].to_numpy(dtype=float) if "subsidy_receipts" in df.columns else None
        features_by_parish[iid] = _parish_quadrant.compute_features(r, e, s)

    if institution_id not in agents:
        return None

    low, high = _parish_quadrant.stability_terciles(list(features_by_parish.values()))
    this_features = features_by_parish[institution_id]
    agents[institution_id].cluster = _parish_quadrant.classify(
        this_features["volatility_index"], this_features["is_subsidized"], low, high
    )

    this_agent = agents[institution_id]
    pool_total = diocese_subsidy_pool(list(agents.values()))
    context = {
        "pool_total_monthly": round(pool_total, 2),
        "num_subsidized_parishes": sum(1 for a in agents.values() if a.is_subsidized),
        "this_agent_pool_share": round(pool_share(this_agent, pool_total), 4),
    }
    return this_agent, context


def diocese_subsidy_pool(agents: list[ParishAgent]) -> float:
    """Total recent monthly subsidy draw across every currently-subsidized
    parish-agent — the shared resource multiple agents draw from."""
    return sum(a.avg_monthly_subsidy for a in agents if a.is_subsidized)


def pool_share(agent: ParishAgent, pool_total: float) -> float:
    """This agent's fraction of the shared pool — how much of a pool-wide
    shock actually reaches it. Non-subsidized agents never draw from the
    pool, so a shock to it can't touch them."""
    if pool_total <= 0 or not agent.is_subsidized:
        return 0.0
    return safe_div(agent.avg_monthly_subsidy, pool_total)


@dataclass
class PriestAgent:
    """A priest's own track record, expressed relative to each institution's
    own baseline (never as an absolute peso figure — transplanting one
    parish's raw collection numbers onto a different-sized parish would be
    meaningless; a performance ratio travels with the priest instead)."""

    priest_id: str
    performance_ratio: float
    ratio_volatility: float
    n_assignments_observed: int


def _fetch_priest_assignment_history(priest_id: str) -> list[dict]:
    try:
        res = (
            get_table("clergy", "priest_assignments")
            .select("institution_id, start_date, end_date")
            .eq("priest_id", priest_id)
            .order("start_date")
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def build_priest_agent(priest_id: str) -> PriestAgent | None:
    """None means no usable assignment history was found (unknown priest,
    or every past posting was non-parish/has no AWS series) — callers treat
    that as "no specific incoming priest data" and fall back to the
    destination parish's own baseline, not a crash or a fabricated number."""
    assignments = _fetch_priest_assignment_history(priest_id)
    if not assignments:
        return None

    ratios: list[float] = []
    for a in assignments:
        inst_id = a.get("institution_id")
        start_raw = a.get("start_date")
        if not inst_id or not start_raw:
            continue

        df = _aws_financials.parish_monthly_df(inst_id)
        if df is None or df.empty:
            continue

        start = pd.Timestamp(start_raw)
        end = pd.Timestamp(a["end_date"]) if a.get("end_date") else df["date"].max()
        during = df[(df["date"] >= start) & (df["date"] <= end)]
        if during.empty:
            continue

        overall_avg = float(df["total_receipts"].mean())
        if overall_avg <= 0:
            continue
        tenure_avg = float(during["total_receipts"].mean())
        ratios.append(tenure_avg / overall_avg)

    if not ratios:
        return None

    return PriestAgent(
        priest_id=priest_id,
        performance_ratio=float(np.mean(ratios)),
        ratio_volatility=float(np.std(ratios)) if len(ratios) > 1 else _DEFAULT_VOLATILITY,
        n_assignments_observed=len(ratios),
    )


def run_monte_carlo(
    agent: ParishAgent,
    periods: int,
    drift_pct: float,
    pool_shock_pct: float,
    pool_share_of_agent: float,
    performance_ratio: float = 1.0,
    n_paths: int = N_MONTE_CARLO_PATHS,
    seed: int | None = None,
) -> np.ndarray:
    """Month-by-month random walk for one parish-agent's receipts, shape
    (n_paths, periods). Each step applies the deterministic drift plus a
    Gaussian shock scaled by the agent's OWN historical volatility (not a
    diocese-wide constant) — the actual agent-interaction mechanic is the
    pool term: a shared shock applied identically to every subsidized
    agent's path in the same scenario run, scaled by this agent's own share
    of the pool, so one agent's simulated outcome depends on the shared
    resource rather than only its own numbers. `performance_ratio` folds in
    an incoming priest-agent's own track record (1.0 = no reassignment
    modeled, i.e. the destination keeps its own baseline)."""
    rng = np.random.default_rng(seed)
    baseline = agent.avg_receipts if agent.avg_receipts > 0 else 1.0
    growth = 1 + drift_pct / 100
    vol = max(agent.volatility, 0.01)
    pool_effect = (pool_shock_pct / 100) * pool_share_of_agent

    paths = np.zeros((n_paths, periods))
    current = np.full(n_paths, baseline * performance_ratio)
    for t in range(periods):
        shocks = rng.normal(loc=0.0, scale=vol, size=n_paths)
        current = current * growth * (1 + shocks) * (1 + pool_effect)
        paths[:, t] = np.maximum(current, 0.0)
    return paths


def summarize_paths(paths: np.ndarray, base_date: pd.Timestamp | None = None) -> list[dict]:
    """Per-period worst/most-likely/best case across all Monte Carlo paths —
    the 10th/50th/90th percentile, matching the manuscript Appendix
    glossary's "Sandbox Scenario Results" definition."""
    base_date = base_date or pd.Timestamp.today().replace(day=1)
    periods = paths.shape[1]
    out = []
    for t in range(periods):
        col = paths[:, t]
        period_label = (base_date + pd.DateOffset(months=t + 1)).strftime("%Y-%m")
        out.append(
            {
                "period": period_label,
                "worst_case": round(float(np.percentile(col, _PESSIMISTIC_PCTL)), 2),
                "most_likely": round(float(np.percentile(col, 50)), 2),
                "best_case": round(float(np.percentile(col, _OPTIMISTIC_PCTL)), 2),
            }
        )
    return out
