"""
Descriptive: Financial Trend
Computes monthly totals, STL decomposition, Z-score anomaly flags, and KPIs.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

# ── Internal helpers ──────────────────────────────────────────────────────────


def _run_stl(series: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Run STL decomposition; return (trend, seasonal, residual)."""
    from statsmodels.tsa.seasonal import STL

    n = len(series)
    # STL requires at least 2 full seasonal cycles; fallback to linear trend
    if n < 24:
        trend = series.rolling(window=max(1, n // 3), center=True, min_periods=1).mean()
        seasonal = pd.Series(0.0, index=series.index)
        residual = series - trend
        return trend, seasonal, residual

    stl = STL(series, period=12, robust=True)
    result = stl.fit()
    return (
        pd.Series(result.trend, index=series.index),
        pd.Series(result.seasonal, index=series.index),
        pd.Series(result.resid, index=series.index),
    )


def _isolation_forest_flags(values: np.ndarray) -> list[bool]:
    """Return anomaly boolean flags using IsolationForest."""
    from sklearn.ensemble import IsolationForest

    if len(values) < 6:
        return [False] * len(values)

    clf = IsolationForest(contamination=0.1, random_state=42)
    preds = clf.fit_predict(values.reshape(-1, 1))
    return [p == -1 for p in preds]


def _compute_kpis(df: pd.DataFrame) -> dict[str, float]:
    receipts = df["total_receipts"]
    expenses = df["total_expenses"]

    # Annual Collection Growth Rate — compare last 12 months vs prior 12 months
    n = len(df)
    if n >= 24:
        current_year = receipts.iloc[-12:].sum()
        prior_year = receipts.iloc[-24:-12].sum()
        annual_growth = safe_div(current_year - prior_year, prior_year)
    elif n >= 2:
        annual_growth = safe_div(receipts.iloc[-1] - receipts.iloc[0], receipts.iloc[0] or 1)
    else:
        annual_growth = 0.0

    # Disbursement-to-Collection Ratio
    total_r = receipts.sum()
    total_e = expenses.sum()
    disbursement_ratio = safe_div(total_e, total_r)

    # MoM Collection Change (last two months)
    mom_change = safe_div(receipts.iloc[-1] - receipts.iloc[-2], abs(receipts.iloc[-2]) or 1) if n >= 2 else 0.0

    # Net Receipt Deficit Rate — months where expenses > receipts
    deficit_months = int((expenses > receipts).sum())
    deficit_rate = safe_div(deficit_months, n)

    return {
        "annual_collection_growth_rate": round(annual_growth, 4),
        "disbursement_to_collection_ratio": round(disbursement_ratio, 4),
        "mom_collection_change": round(mom_change, 4),
        "net_receipt_deficit_rate": round(deficit_rate, 4),
    }


def _build_response(
    df: pd.DataFrame,
    receipt_cols: list[str],
    expense_cols: list[str],
    entity_id: str,
    entity_type: str,
) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    if df.empty:
        return {
            "data_sufficient": False,
            "entity_id": entity_id,
            "entity_type": entity_type,
            "monthly_series": [],
            "anomaly_flags": [],
            "kpis": {},
            "decline_detected": False,
            "timestamp": ts,
        }

    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)

    n = len(df)
    ts_receipts = df["total_receipts"].copy()
    ts_receipts.index = pd.RangeIndex(n)

    trend, seasonal, residual = _run_stl(ts_receipts)

    # Z-scores of monthly collections
    mean_r = ts_receipts.mean()
    std_r = ts_receipts.std(ddof=0) or 1.0
    z_scores = ((ts_receipts - mean_r) / std_r).tolist()

    # Isolation Forest on residuals
    iso_flags = _isolation_forest_flags(residual.values)

    periods = df["date"].dt.strftime("%Y-%m").tolist()

    monthly_series = [
        {
            "period": p,
            "total_receipts": round(float(df["total_receipts"].iloc[i]), 2),
            "total_expenses": round(float(df["total_expenses"].iloc[i]), 2),
            "trend": round(float(trend.iloc[i]), 2),
            "seasonal": round(float(seasonal.iloc[i]), 2),
            "residual": round(float(residual.iloc[i]), 2),
        }
        for i, p in enumerate(periods)
    ]

    anomaly_flags = [
        {
            "period": p,
            "is_anomaly": iso_flags[i],
            "z_score": round(z_scores[i], 4),
        }
        for i, p in enumerate(periods)
    ]

    kpis = _compute_kpis(df)

    # Decline if last 3-month slope is negative
    decline_detected = False
    if n >= 3:
        last3 = ts_receipts.iloc[-3:].values
        slope = float(np.polyfit(range(3), last3, 1)[0])
        decline_detected = slope < 0

    return {
        "data_sufficient": True,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "monthly_series": monthly_series,
        "anomaly_flags": anomaly_flags,
        "kpis": kpis,
        "decline_detected": decline_detected,
        "timestamp": ts,
    }


def _fetch_and_process(institution_id: str, entity_type: str) -> dict[str, Any]:
    schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    result = (
        get_table(schema, "financial_records")
        .select(", ".join(select_cols))
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    if not result.data or len(result.data) < 3:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "monthly_series": [],
            "anomaly_flags": [],
            "kpis": {},
            "decline_detected": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    df = pd.DataFrame(result.data)
    return _build_response(df, receipt_cols, expense_cols, institution_id, entity_type)


async def get_financial_trend(institution_id: str, entity_type: str) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
