"""
Diagnostic: Cluster and Seasonal Diagnostic
STL decomposition + SHAP on cluster features + change-point detection (ruptures).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_supabase, get_table


def _llm_narrative(stats: dict[str, Any]) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return _rule_based_narrative(stats)
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "You are a financial analyst for a Catholic diocese. "
            "Write a concise 3-sentence narrative explaining the seasonal and cluster dynamics "
            "based on the following aggregated statistics only (no institution names):\n\n"
            f"- Anomaly count: {stats.get('anomaly_count', 0)}\n"
            f"- Total periods analyzed: {stats.get('total_periods', 0)}\n"
            f"- Change points detected: {stats.get('change_point_count', 0)}\n"
            f"- Top cluster feature: {stats.get('top_feature', 'N/A')}\n"
            f"- Attribution precision estimate: {stats.get('precision', 0):.2%}\n"
            f"- Trend direction: {stats.get('trend', 'N/A')}\n"
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return _rule_based_narrative(stats)


def _rule_based_narrative(stats: dict[str, Any]) -> str:
    anomaly_count = stats.get("anomaly_count", 0)
    cp_count = stats.get("change_point_count", 0)
    precision = stats.get("precision", 0.0)
    top_feat = stats.get("top_feature", "seasonal index")
    trend = stats.get("trend", "stable")

    return (
        f"Seasonal analysis identified {anomaly_count} anomalous period(s) "
        f"and {cp_count} structural change point(s) in the collection series. "
        f"The feature '{top_feat}' contributes most to cluster membership, "
        f"with an attribution precision of {precision:.0%}. "
        f"The overall financial trajectory is {trend}, suggesting "
        + ("elevated volatility warranting intervention." if anomaly_count > 2 else "manageable variability.")
    )


def _fetch_and_process(entity_id: str, entity_type: str) -> dict[str, Any]:
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
        .eq("institution_id", entity_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    insufficient = {
        "data_sufficient": False,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "root_cause": "N/A",
        "change_points": [],
        "attribution_precision": 0.0,
        "shap_values": {},
        "narrative": "Insufficient data for cluster-seasonal diagnostics.",
        "timestamp": ts,
    }

    if not res.data or len(res.data) < 6:
        return insufficient

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    series = df["total_receipts"].copy()
    series.index = pd.RangeIndex(len(series))

    # STL decomposition
    from statsmodels.tsa.seasonal import STL

    n = len(series)
    if n >= 24:
        stl = STL(series, period=12, robust=True)
        result = stl.fit()
        residuals = pd.Series(result.resid, index=series.index)
        trend_comp = pd.Series(result.trend, index=series.index)
    else:
        rolling = series.rolling(window=max(1, n // 3), center=True, min_periods=1).mean()
        residuals = series - rolling
        trend_comp = rolling

    # Flag anomalies: residuals > 2 sigma
    sigma = float(residuals.std(ddof=0)) or 1.0
    anomaly_mask = (residuals.abs() > 2 * sigma).tolist()
    anomaly_count = sum(anomaly_mask)

    # Change point detection with ruptures
    import ruptures as rpt

    cp_dates: list[str] = []
    if n >= 6:
        try:
            signal = series.values.reshape(-1, 1)
            model_rpt = rpt.Pelt(model="rbf").fit(signal)
            breakpoints = model_rpt.predict(pen=10)
            # breakpoints are 1-indexed positions; exclude the last (== n)
            for bp in breakpoints[:-1]:
                if 0 <= bp - 1 < len(df):
                    cp_dates.append(df["date"].iloc[bp - 1].strftime("%Y-%m"))
        except Exception:
            cp_dates = []

    # Feature engineering for SHAP
    df["lag1"] = series.shift(1).fillna(method="bfill")
    df["lag2"] = series.shift(2).fillna(method="bfill")
    df["month_num"] = df["date"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * df["month_num"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month_num"] / 12)
    df["time_idx"] = np.arange(len(df))

    features = ["lag1", "lag2", "month_sin", "month_cos", "time_idx"]
    X = df[features].values
    y = df["total_receipts"].values

    from sklearn.linear_model import LinearRegression
    import shap

    lr = LinearRegression()
    lr.fit(X, y)
    explainer = shap.LinearExplainer(lr, X, feature_perturbation="correlation_dependent")
    shap_vals = explainer.shap_values(X)
    mean_abs = np.abs(shap_vals).mean(axis=0)
    shap_dict = {f: round(float(v), 4) for f, v in zip(features, mean_abs)}
    top_feature = features[int(np.argmax(mean_abs))]

    # Attribution precision: R2 as proxy
    y_pred = lr.predict(X)
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2)) or 1.0
    r2 = max(0.0, 1.0 - safe_div(ss_res, ss_tot))
    precision = round(r2, 4)

    trend_val = float(trend_comp.iloc[-1]) - float(trend_comp.iloc[0])
    trend_dir = "up" if trend_val > 0 else "down" if trend_val < 0 else "stable"

    narrative = _llm_narrative({
        "anomaly_count": anomaly_count,
        "total_periods": n,
        "change_point_count": len(cp_dates),
        "top_feature": top_feature,
        "precision": precision,
        "trend": trend_dir,
    })

    return {
        "data_sufficient": True,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "root_cause": top_feature,
        "change_points": cp_dates,
        "attribution_precision": precision,
        "shap_values": shap_dict,
        "narrative": narrative,
        "timestamp": ts,
    }


async def get_cluster_seasonal_diagnostic(entity_id: str, entity_type: str) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, entity_id, entity_type)
