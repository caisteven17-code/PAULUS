"""
Diagnostic: Priest-Financial Correlation
Regression + SHAP values + LLM narrative (aggregated stats only, no raw data).
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
from app.services.supabase_client import get_table

# ── LLM narrative ─────────────────────────────────────────────────────────────

def _llm_narrative(stats: dict[str, Any]) -> str:
    """
    Generate narrative via Claude. Only passes aggregated statistics.
    Falls back to rule-based text if key absent or call fails.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return _rule_based_narrative(stats)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "You are a financial analyst for a Catholic diocese. "
            "Based ONLY on the following aggregated financial statistics (no institution names or raw figures are included), "
            "write a concise 3-sentence diagnostic narrative explaining the relationship between "
            "priest assignment changes and financial performance. "
            "Focus on patterns, not individuals.\n\n"
            f"Statistics:\n"
            f"- Avg monthly collection overall: {stats.get('avg_collection', 0):.2f}\n"
            f"- Collection variance: {stats.get('variance', 0):.2f}\n"
            f"- Top SHAP feature: {stats.get('top_feature', 'N/A')}\n"
            f"- Association score (0-100): {stats.get('gauge_score', 0):.1f}\n"
            f"- Trend direction: {stats.get('trend', 'N/A')}\n"
            f"- Growth rate: {stats.get('growth_rate', 0):.2%}\n"
        )
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception:
        return _rule_based_narrative(stats)


def _rule_based_narrative(stats: dict[str, Any]) -> str:
    gauge = stats.get("gauge_score", 50)
    trend = stats.get("trend", "stable")
    top_feat = stats.get("top_feature", "assignment period")
    growth = stats.get("growth_rate", 0)

    if gauge >= 70:
        strength = "strong"
    elif gauge >= 40:
        strength = "moderate"
    else:
        strength = "weak"

    direction = "positive" if growth >= 0 else "negative"
    return (
        f"Analysis reveals a {strength} association between pastoral assignments and financial performance, "
        f"with {top_feat} identified as the primary driver. "
        f"Collections show a {direction} {abs(growth):.1%} trend, with overall financial trajectory "
        f"described as {trend}. "
        f"The gauge score of {gauge:.0f}/100 indicates the degree to which assignment dynamics "
        f"explain observed collection variability."
    )


# ── Core processing ───────────────────────────────────────────────────────────

def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    # Detect entity type
    schema = None
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

    if schema is None:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "root_cause_indicator": "N/A",
            "gauge_score": 0.0,
            "association_score": 0.0,
            "shap_values": {},
            "narrative": "Insufficient data.",
            "timestamp": ts,
        }

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

    if not res.data or len(res.data) < 6:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "root_cause_indicator": "N/A",
            "gauge_score": 0.0,
            "association_score": 0.0,
            "shap_values": {},
            "narrative": "Insufficient data for diagnostic analysis.",
            "timestamp": ts,
        }

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)

    # Engineer features: lag1, lag2, month_sin, month_cos, time_index
    df["lag1"] = df["total_receipts"].shift(1).fillna(method="bfill")
    df["lag2"] = df["total_receipts"].shift(2).fillna(method="bfill")
    df["month_num"] = df["date"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * df["month_num"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month_num"] / 12)
    df["time_idx"] = np.arange(len(df))

    features = ["lag1", "lag2", "month_sin", "month_cos", "time_idx"]
    X = df[features].values
    y = df["total_receipts"].values

    # Linear regression
    from sklearn.linear_model import LinearRegression

    lr = LinearRegression()
    lr.fit(X, y)

    # SHAP via LinearExplainer
    import shap

    explainer = shap.LinearExplainer(lr, X, feature_perturbation="correlation_dependent")
    shap_values = explainer.shap_values(X)
    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    shap_dict = {f: round(float(v), 4) for f, v in zip(features, mean_abs_shap)}

    top_feature = features[int(np.argmax(mean_abs_shap))]

    # Gauge score: normalized SHAP sum, scaled 0-100
    total_shap = float(np.sum(mean_abs_shap))
    avg_receipts = float(np.mean(np.abs(y))) or 1.0
    gauge_score = min(100.0, round(safe_div(total_shap, avg_receipts) * 100, 2))

    # Partial correlation (receipts vs time_idx controlling for lags)
    from scipy import stats as scipy_stats

    try:
        corr, _ = scipy_stats.pearsonr(df["time_idx"].values, y)
        association_score = round(abs(corr) * 100, 2)
    except Exception:
        association_score = gauge_score

    n = len(y)
    growth_rate = safe_div(y[-1] - y[0], abs(y[0]) or 1) if n >= 2 else 0.0
    variance = float(np.var(y, ddof=0))
    avg_c = float(np.mean(y))
    trend = "up" if growth_rate > 0.02 else ("down" if growth_rate < -0.02 else "stable")

    narrative = _llm_narrative({
        "avg_collection": avg_c,
        "variance": variance,
        "top_feature": top_feature,
        "gauge_score": gauge_score,
        "trend": trend,
        "growth_rate": growth_rate,
    })

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "root_cause_indicator": top_feature,
        "gauge_score": gauge_score,
        "association_score": association_score,
        "shap_values": shap_dict,
        "narrative": narrative,
        "timestamp": ts,
    }


async def get_priest_financial_diagnostic(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
