"""
Descriptive: Seasonality Trend Analysis
STL decomposition + liturgical event-window aggregation + Isolation Forest.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import analytics_db
from app.services.data_definitions import (
    _SCHEMA_MAP,
    MONTH_ORDER,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

ALL_INSTITUTIONS = "all"

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
    # bool(p == -1) — p == -1 is numpy.bool, which FastAPI's jsonable_encoder
    # cannot serialize (unlike a native Python bool).
    return [bool(p == -1) for p in preds]


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
        monthly_trend.append(
            {
                "month": mname,
                "avg_collection": round(avg_val, 2),
                "seasonal_impact": round(avg_val - float(monthly_avg.mean()), 2),
            }
        )

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
        event_averages.append(
            {
                "event_name": event,
                "avg_collection": round(avg_c, 2),
                "vs_baseline_pct": round(vs_baseline, 2),
            }
        )

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "monthly_trend": monthly_trend,
        "event_averages": event_averages,
        "seasonal_anomalies": seasonal_anomalies,
        "timestamp": ts,
    }


def _insufficient(institution_id: str, entity_type: str) -> dict[str, Any]:
    return {
        "data_sufficient": False,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "monthly_trend": [],
        "event_averages": [],
        "seasonal_anomalies": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


_AWS_SEASONALITY_SQL = """
    SELECT f.date_key,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.liturgical_sundays_count, 0))::float8 AS sundays_count,
           SUM(COALESCE(f.liturgical_solemnities_count, 0))::float8 AS solemnities_count,
           SUM(COALESCE(f.liturgical_major_celebration_days_count, 0))::float8 AS major_celebration_days_count,
           SUM(COALESCE(f.liturgical_christmas_days_count, 0))::float8 AS christmas_days_count,
           SUM(COALESCE(f.liturgical_holy_week_days_count, 0))::float8 AS holy_week_days_count,
           SUM(COALESCE(f.liturgical_simbang_gabi_days_count, 0))::float8 AS simbang_gabi_days_count,
           SUM(COALESCE(f.liturgical_lent_days_count, 0))::float8 AS lent_days_count,
           SUM(COALESCE(f.liturgical_easter_days_count, 0))::float8 AS easter_days_count,
           SUM(COALESCE(f.liturgical_ordinary_time_days_count, 0))::float8 AS ordinary_time_days_count
    FROM parish_analytics.vw_parish_monthly_financials_liturgical f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
    {where_sql}
    GROUP BY f.date_key
    ORDER BY f.date_key
"""

_AWS_EVENT_DEFINITIONS = [
    ("Christmas", ["christmas_days_count"]),
    ("Simbang Gabi", ["simbang_gabi_days_count"]),
    ("Holy Week", ["holy_week_days_count"]),
    ("Lent", ["lent_days_count"]),
    ("Easter", ["easter_days_count"]),
    ("Major Celebrations", ["major_celebration_days_count", "solemnities_count"]),
    ("Sundays", ["sundays_count"]),
    ("Ordinary Time", ["ordinary_time_days_count"]),
]


def _fetch_and_process_aws_parish(institution_id: str, year: int | None) -> dict[str, Any]:
    scope_all = institution_id == ALL_INSTITUTIONS
    where: list[str] = []
    params: list[Any] = []
    if not scope_all:
        where.append("di.institution_id = %s")
        params.append(institution_id)
    if year:
        where.append("f.date_key >= %s AND f.date_key < %s")
        params.extend([year * 100, (year + 1) * 100])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = analytics_db.fetch_query(_AWS_SEASONALITY_SQL.format(where_sql=where_sql), params)
    if len(rows) < 3:
        return _insufficient(institution_id, "parish")

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date_key"].astype(str), format="%Y%m")
    df["month_num"] = df["date"].dt.month
    df["total_receipts"] = pd.to_numeric(df["total_receipts"], errors="coerce").fillna(0.0)

    monthly_avg = df.groupby("month_num")["total_receipts"].mean()
    baseline = float(df["total_receipts"].mean())
    monthly_trend = []
    for i, mname in enumerate(MONTH_ORDER, start=1):
        avg_val = float(monthly_avg.get(i, 0.0))
        monthly_trend.append(
            {
                "month": mname,
                "avg_collection": round(avg_val, 2),
                "seasonal_impact": round(avg_val - baseline, 2),
            }
        )

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

    event_averages = []
    for event_name, cols in _AWS_EVENT_DEFINITIONS:
        mask = pd.Series(False, index=df.index)
        for col in cols:
            if col in df.columns:
                mask = mask | (pd.to_numeric(df[col], errors="coerce").fillna(0.0) > 0)
        sub = df[mask]["total_receipts"]
        if sub.empty:
            continue
        avg_c = float(sub.mean())
        event_averages.append(
            {
                "event_name": event_name,
                "avg_collection": round(avg_c, 2),
                "vs_baseline_pct": round(safe_div(avg_c - baseline, baseline) * 100, 2),
            }
        )

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": "parish",
        "monthly_trend": monthly_trend,
        "event_averages": sorted(event_averages, key=lambda e: e["vs_baseline_pct"], reverse=True),
        "seasonal_anomalies": seasonal_anomalies,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "aws",
    }


def _apply_timeframe(result: dict[str, Any], timeframe: str | None) -> dict[str, Any]:
    window = {"6m": 6, "12m": 12}.get(timeframe or "")
    if window and result.get("data_sufficient"):
        result["monthly_trend"] = result["monthly_trend"][-window:]
    return result


async def get_seasonality_trend(
    institution_id: str,
    entity_type: str,
    year: int | None = None,
    timeframe: str | None = None,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    if entity_type == "parish" and analytics_db.enabled():
        try:
            result = await asyncio.to_thread(_fetch_and_process_aws_parish, institution_id, year)
            if result.get("data_sufficient"):
                return _apply_timeframe(result, timeframe)
        except Exception:
            logger.exception("AWS seasonality trend read failed; falling back to Supabase")

    if entity_type == "parish" and institution_id == ALL_INSTITUTIONS:
        # No diocese-wide Supabase aggregator exists for seasonality (unlike
        # financial_trend.py's _fetch_and_process_supabase_all). Falling
        # through to _fetch_and_process below would crash — it does
        # .eq("institution_id", institution_id) against a UUID column, and
        # "all" isn't a valid UUID. An honest "insufficient" is correct
        # anyway: the AWS path already tried and had no real data for this
        # scope/year.
        return _insufficient(institution_id, entity_type)

    result = await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
    return _apply_timeframe(result, timeframe)
