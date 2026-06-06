"""
Descriptive: Seasonality Trend Analysis
STL decomposition + liturgical event-window aggregation + Isolation Forest.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import (
    MONTH_ORDER,
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_supabase, get_table

# Liturgical season to month mapping (month number)
_LITURGICAL_EVENTS = {
    "Christmas": [12],
    "Holy Week": [3, 4],
    "Pentecost": [5],
    "All Saints": [11],
    "Regular Season": [1, 2, 6, 7, 8, 9, 10],
}


def _run_stl_residuals(series: pd.Series) -> pd.Series:
    from statsmodels.tsa.seasonal import STL

    n = len(series)
    if n < 24:
        rolling = series.rolling(window=max(1, n // 3), center=True, min_periods=1).mean()
        return series - rolling

    stl = STL(series, period=12, robust=True)
    result = stl.fit()
    return pd.Series(result.resid, index=series.index)


def _isolation_flags(residuals: np.ndarray) -> list[bool]:
    from sklearn.ensemble import IsolationForest

    if len(residuals) < 6:
        return [False] * len(residuals)

    clf = IsolationForest(contamination=0.1, random_state=42)
    preds = clf.fit_predict(residuals.reshape(-1, 1))
    return [p == -1 for p in preds]


def _fetch_and_process(institution_id: str, entity_type: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]
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

    if not res.data or len(res.data) < 3:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "monthly_trend": [],
            "event_averages": [],
            "seasonal_anomalies": [],
            "timestamp": ts,
        }

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)

    # Monthly average by calendar month
    df["month_num"] = df["date"].dt.month
    monthly_avg = df.groupby("month_num")["total_receipts"].mean()

    monthly_trend = []
    for i, mname in enumerate(MONTH_ORDER, start=1):
        avg_val = float(monthly_avg.get(i, 0.0))
        monthly_trend.append({
            "month": mname,
            "avg_collection": round(avg_val, 2),
            "seasonal_impact": round(avg_val - float(monthly_avg.mean()), 2),
        })

    # STL residuals and anomaly flags over the full time series
    series = df["total_receipts"].copy()
    series.index = pd.RangeIndex(len(series))
    residuals = _run_stl_residuals(series)
    iso_flags = _isolation_flags(residuals.values)

    periods = df["date"].dt.strftime("%Y-%m").tolist()
    seasonal_anomalies = [
        {"period": p, "is_anomaly": iso_flags[i], "residual": round(float(residuals.iloc[i]), 2)}
        for i, p in enumerate(periods)
        if iso_flags[i]
    ]

    # Liturgical event averages
    baseline = float(df["total_receipts"].mean())
    event_averages = []
    for event, months in _LITURGICAL_EVENTS.items():
        mask = df["month_num"].isin(months)
        sub = df[mask]["total_receipts"]
        if sub.empty:
            continue
        avg_c = float(sub.mean())
        vs_baseline = safe_div(avg_c - baseline, baseline) * 100
        event_averages.append({
            "event_name": event,
            "avg_collection": round(avg_c, 2),
            "vs_baseline_pct": round(vs_baseline, 2),
        })

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "monthly_trend": monthly_trend,
        "event_averages": event_averages,
        "seasonal_anomalies": seasonal_anomalies,
        "timestamp": ts,
    }


async def get_seasonality_trend(institution_id: str, entity_type: str) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
