"""
Descriptive: Pastoral Assignment Trend
Computes average monthly collection per assignment period and variance metrics.
Falls back to year-grouped records when priest_assignments table is absent.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials
from app.services._stl import run_stl
from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table


def _period_stats(sub: pd.DataFrame, label: str) -> dict[str, Any]:
    vals = sub["total_receipts"].values.astype(float)
    avg = float(np.mean(vals)) if len(vals) > 0 else 0.0
    var = float(np.var(vals, ddof=0)) if len(vals) > 1 else 0.0
    if len(vals) >= 2:
        mom = safe_div(float(vals[-1]) - float(vals[-2]), abs(float(vals[-2])) or 1)
    else:
        mom = 0.0
    return {
        "period_label": label,
        "avg_monthly_collection": round(avg, 2),
        "variance": round(var, 2),
        "mom_collection_change": round(mom, 4),
        "record_count": len(vals),
    }


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    # ── Try priest_assignments table ─────────────────────────────────────────
    assignments: list[dict] = []
    try:
        res = (
            get_table("clergy", "priest_assignments")
            .select("priest_id, start_date, end_date, institution_id")
            .eq("institution_id", institution_id)
            .order("start_date")
            .execute()
        )
        assignments = res.data or []
    except Exception:
        assignments = []

    # ── Fetch financial records ───────────────────────────────────────────────
    # Try all entity types to find the institution
    schema = "parishes"
    receipt_cols: list[str] = []
    expense_cols: list[str] = []
    for etype, (s, rc, ec, _) in _SCHEMA_MAP.items():
        res_check = (
            get_table(s, "financial_records")
            .select("institution_id")
            .eq("institution_id", institution_id)
            .limit(1)
            .execute()
        )
        if res_check.data:
            schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[etype]
            break

    if not receipt_cols:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "assignment_periods": [],
            "performance_analysis": {},
            "timestamp": ts,
        }

    # AWS is authoritative for parishes — Supabase's financial_records numeric
    # columns are never populated by the real ingestion pipeline, so reading
    # them would produce assignment-period stats that are always ~zero
    # regardless of the priest or period involved.
    df: pd.DataFrame | None = _aws_financials.parish_monthly_df(institution_id) if schema == "parishes" else None

    if df is None or len(df) < 3:
        all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
        seen: set[str] = set()
        select_cols: list[str] = []
        for c in all_cols:
            if c not in seen:
                select_cols.append(c)
                seen.add(c)

        fin_res = (
            get_table(schema, "financial_records")
            .select(", ".join(select_cols))
            .eq("institution_id", institution_id)
            .eq("is_current_version", True)
            .is_("deleted_at", "null")
            .order("year")
            .execute()
        )

        if not fin_res.data or len(fin_res.data) < 3:
            return {
                "data_sufficient": False,
                "institution_id": institution_id,
                "assignment_periods": [],
                "performance_analysis": {},
                "timestamp": ts,
            }

        df = pd.DataFrame(fin_res.data)
        df = build_date_index(df)

        for col in receipt_cols + expense_cols:
            if col not in df.columns:
                df[col] = 0.0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        df["total_receipts"] = df[receipt_cols].sum(axis=1)

    # ── Build period segments ─────────────────────────────────────────────────
    period_stats: list[dict] = []

    if assignments:
        for asn in assignments:
            start = pd.Timestamp(asn.get("start_date") or "1900-01-01")
            end_raw = asn.get("end_date")
            end = pd.Timestamp(end_raw) if end_raw else df["date"].max()
            mask = (df["date"] >= start) & (df["date"] <= end)
            sub = df[mask]
            if sub.empty:
                continue
            label = (
                f"Assignment {asn.get('priest_id', 'unknown')} ({start.strftime('%Y-%m')} to {end.strftime('%Y-%m')})"
            )
            period_stats.append(_period_stats(sub, label))
    else:
        # Fallback: group by year
        for year, grp in df.groupby("year"):
            grp = grp.sort_values("date")
            period_stats.append(_period_stats(grp, f"Year {year}"))

    if not period_stats:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "assignment_periods": [],
            "performance_analysis": {},
            "timestamp": ts,
        }

    avgs = [p["avg_monthly_collection"] for p in period_stats]
    overall_avg = float(np.mean(avgs))

    # Real Time Series Decomposition on the full underlying series (not per
    # assignment-period segments, which are usually too short for STL's
    # n>=24 real-decomposition threshold — see _stl.py) — trend_direction
    # now reads the deseasonalized trend component's start-vs-end movement
    # instead of comparing raw first/last period averages, which a single
    # seasonal spike (e.g. December) or dip could flip either way.
    full_series = df.sort_values("date")["total_receipts"].reset_index(drop=True)
    trend_comp, _seasonal_comp, _residual_comp = run_stl(full_series)
    trend_slope = float(trend_comp.iloc[-1]) - float(trend_comp.iloc[0])
    trend_direction = "up" if trend_slope > 0 else "down"

    # Collection Variance (%) — coefficient of variation of period averages.
    # Raw variance is in squared-peso units and was never actually a
    # percentage despite the name; CV (std/mean) is the standard way to
    # express variability as a genuine, scale-free percentage.
    collection_variance_pct = round(safe_div(float(np.std(avgs, ddof=0)), overall_avg) * 100, 2)

    performance_analysis = {
        "best_period": period_stats[int(np.argmax(avgs))]["period_label"],
        "worst_period": period_stats[int(np.argmin(avgs))]["period_label"],
        "overall_avg_monthly_collection": round(overall_avg, 2),
        "collection_variance_across_periods": round(float(np.var(avgs, ddof=0)), 2),
        "collection_variance_pct": collection_variance_pct,
        "trend_direction": trend_direction,
    }

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "assignment_periods": period_stats,
        "performance_analysis": performance_analysis,
        "timestamp": ts,
    }


async def get_pastoral_assignment(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
