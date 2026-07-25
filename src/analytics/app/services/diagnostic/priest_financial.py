"""
Diagnostic: Priest-Financial Correlation
Regression + SHAP values + LLM narrative (aggregated stats only, no raw data).

Per the manuscript (Section 3.9.6 "Multiple Linear Regression"): "the model
will consider priest assignment period, weather conditions, and seasonality,
while controlling for parish cluster." This module builds those as real
features rather than a plain time-trend regression — see `_assignment_features`,
`_fetch_weather_days`, `_fetch_seasonality_days`, `_parish_cluster_context`.

Per the manuscript glossary ("Clergy Assignment-Based Financial Trend
Analysis"): this analysis is "designed to identify financial patterns rather
than assess the performance of individual priests" — assignment period is
represented structurally (tenure, whether a transition just happened), never
by which specific priest was assigned, and all narrative text is written in
terms of patterns, not individual judgment.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials, _parish_quadrant, analytics_db
from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.predictive.financial_forecast import fetch_liturgical_features
from app.services.supabase_client import get_table
from app.services.weather_repository import get_table as get_weather_table

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
            "Based ONLY on the following aggregated financial statistics (no institution or priest names, "
            "no raw figures are included), write a concise 3-4 sentence diagnostic narrative describing "
            "financial patterns across pastoral assignment periods, weather conditions, and seasonality. "
            "Describe patterns, never assess or judge individual priests.\n\n"
            f"Statistics:\n"
            f"- Avg monthly collection overall: {stats.get('avg_collection', 0):.2f}\n"
            f"- Collection variance: {stats.get('variance', 0):.2f}\n"
            f"- Top driver of variation: {stats.get('top_feature', 'N/A')}\n"
            f"- Assignment-period association score (0-100): {stats.get('gauge_score', 0):.1f}\n"
            f"- Pre/post assignment-transition change: {stats.get('transition_effect_pct', 0):.1f}%\n"
            f"- Trend direction: {stats.get('trend', 'N/A')}\n"
            f"- Growth rate: {stats.get('growth_rate', 0):.2%}\n"
            f"- Parish cluster (peer context): {stats.get('parish_cluster', 'N/A')}\n"
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
    top_feat = stats.get("top_feature", "assignment tenure")
    growth = stats.get("growth_rate", 0)
    transition_effect = stats.get("transition_effect_pct", 0)
    cluster = stats.get("parish_cluster")

    if gauge >= 70:
        strength = "strong"
    elif gauge >= 40:
        strength = "moderate"
    else:
        strength = "weak"

    direction = "positive" if growth >= 0 else "negative"
    cluster_note = f" This parish is currently in the '{cluster}' cluster." if cluster else ""
    return (
        f"Analysis reveals a {strength} pattern linking assignment periods, weather, and seasonality to "
        f"financial performance, with {top_feat} identified as the primary driver of variation. "
        f"Collections show a {direction} {abs(growth):.1%} trend, described as {trend} overall. "
        f"Periods immediately surrounding an assignment transition show an average "
        f"{'increase' if transition_effect >= 0 else 'decrease'} of {abs(transition_effect):.1f}% in collections "
        f"relative to the surrounding months.{cluster_note}"
    )


# ── Priest assignment period features ──────────────────────────────────────────


def _fetch_assignments(institution_id: str) -> list[dict]:
    """Same table/pattern as `descriptive/pastoral_assignment.py` — gracefully
    returns empty when the table is absent or unreachable."""
    try:
        res = (
            get_table("clergy", "priest_assignments")
            .select("priest_id, start_date, end_date")
            .eq("institution_id", institution_id)
            .order("start_date")
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def _assignment_features(dates: list[pd.Timestamp], assignments: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """(tenure_months, transition_flag) per date. Tenure = months since the
    start of whichever assignment covers that date (structural — "how long
    into an assignment is this"), transition_flag = 1 within 2 months of any
    assignment start (structural — "did a handover just happen"). Neither
    encodes *which* priest was assigned, only the shape of the assignment
    timeline — matching the manuscript's framing that this identifies
    patterns, not individual priest performance."""
    n = len(dates)
    tenure = np.zeros(n)
    transition = np.zeros(n)
    starts = sorted(pd.Timestamp(a["start_date"]) for a in assignments if a.get("start_date"))
    if not starts:
        return tenure, transition

    for i, raw_date in enumerate(dates):
        d = pd.Timestamp(raw_date)
        covering = [s for s in starts if s <= d]
        if covering:
            start = max(covering)
            tenure[i] = (d.year - start.year) * 12 + (d.month - start.month)
        if any(abs((d.year - s.year) * 12 + (d.month - s.month)) <= 2 for s in starts):
            transition[i] = 1.0
    return tenure, transition


def _pre_post_transition_effect(
    dates: list[pd.Timestamp], y: np.ndarray, starts: list[pd.Timestamp], window: int = 2
) -> float:
    """Simple event-study / interrupted-time-series comparison: average
    collection in the `window` months immediately before each assignment
    start vs. the `window` months immediately after, averaged across every
    transition observed. This is the "Causal Inference" piece — a real
    pre/post comparison around the actual event, not a plain correlation."""
    if not starts:
        return 0.0

    date_index = pd.DatetimeIndex([pd.Timestamp(d) for d in dates])
    effects = []
    for start in starts:
        pos = date_index.searchsorted(start)
        before = y[max(0, pos - window) : pos]
        after = y[pos : pos + window]
        if len(before) == 0 or len(after) == 0:
            continue
        before_mean = float(np.mean(before))
        after_mean = float(np.mean(after))
        if before_mean == 0:
            continue
        effects.append((after_mean - before_mean) / before_mean * 100)

    return float(np.mean(effects)) if effects else 0.0


# ── Weather conditions ──────────────────────────────────────────────────────────

_MUNICIPALITY_SQL = """
    SELECT di.municipality
    FROM shared_analytics.dim_institutions di
    WHERE di.institution_id = %s
    LIMIT 1
"""


def _fetch_municipality(institution_id: str) -> str | None:
    """`shared_analytics.dim_institutions.municipality` — nearest-centroid
    match against the weather pipeline's municipality list, resolved by
    `institution_dimension_sync.py` (migration 079). None when AWS is
    disabled/unreachable or the institution has no resolved municipality yet."""
    if not analytics_db.enabled():
        return None
    try:
        rows = analytics_db.fetch_query(_MUNICIPALITY_SQL, [institution_id])
    except Exception:
        return None
    return rows[0]["municipality"] if rows else None


def _fetch_weather_days(municipality: str | None, start_date: pd.Timestamp, end_date: pd.Timestamp) -> pd.DataFrame:
    """One aggregate "adverse weather days" column per month — light/moderate/
    heavy rain plus moderate/strong/storm wind — rather than the full ~22-
    column weather feature set `evaluate_financial_models.py` uses. A single
    institution's regression here has only a handful of monthly data points;
    22 extra columns would overfit long before they'd inform anything."""
    columns = [
        "light_rain_days",
        "moderate_rain_days",
        "heavy_rain_days",
        "wind_moderate_days",
        "wind_strong_days",
        "wind_storm_days",
    ]
    if not municipality or pd.isna(start_date) or pd.isna(end_date):
        return pd.DataFrame(columns=["date", "adverse_weather_days"])

    try:
        rows = (
            get_weather_table("reference", "weather_monthly_summary")
            .select("year_month, " + ", ".join(columns))
            .eq("municipality", municipality)
            .gte("year_month", start_date.date().isoformat())
            .lte("year_month", end_date.date().isoformat())
            .order("year_month")
            .execute()
        ).data or []
    except Exception:
        rows = []

    if not rows:
        return pd.DataFrame(columns=["date", "adverse_weather_days"])

    weather = pd.DataFrame(rows)
    weather["date"] = pd.to_datetime(weather["year_month"], errors="coerce")
    for col in columns:
        if col not in weather.columns:
            weather[col] = 0.0
        weather[col] = pd.to_numeric(weather[col], errors="coerce").fillna(0.0)
    weather["adverse_weather_days"] = weather[columns].sum(axis=1)
    return weather[["date", "adverse_weather_days"]]


# ── Seasonality ──────────────────────────────────────────────────────────────────


def _fetch_seasonality_days(years: list[int], months: list[int]) -> np.ndarray:
    """`liturgical_major_days` (solemnities + feasts + Sundays that month) as a
    single representative seasonality feature, reusing the same liturgical
    calendar fetch `financial_forecast.py` uses for its SARIMAX candidate —
    one implementation, not a third copy."""
    liturgical = fetch_liturgical_features(years)
    frame = pd.DataFrame({"year": years, "month_num": months})
    if liturgical.empty or "liturgical_major_days" not in liturgical.columns:
        return np.zeros(len(years))
    merged = frame.merge(
        liturgical[["year", "month_num", "liturgical_major_days"]], on=["year", "month_num"], how="left"
    )
    return pd.to_numeric(merged["liturgical_major_days"], errors="coerce").fillna(0.0).to_numpy()


# ── Parish cluster (control/context) ─────────────────────────────────────────────


def _parish_cluster_context(institution_id: str, entity_type: str) -> str | None:
    """The institution's own cluster label, for context rather than as a
    regression dummy: this diagnostic runs on one institution's own time
    series, where cluster membership is constant across every row (no
    within-institution variance for a regression to use) — a literal
    same-institution dummy variable would be mathematically degenerate.
    Reported instead so results can be read in light of peer context (e.g. a
    pattern is more concerning for an At-Risk parish than a High-Performing
    one), which is the substance of "controlling for parish cluster" when the
    unit of analysis is a single institution, not a cross-institution panel."""
    if entity_type != "parish":
        return None
    aws_series = _aws_financials.all_parish_monthly_dfs()
    if not aws_series:
        return None

    rows = []
    for iid, df in aws_series:
        if len(df) < 6 or "total_receipts" not in df.columns or "total_expenses" not in df.columns:
            continue
        r = df["total_receipts"].values.astype(float)
        e = df["total_expenses"].values.astype(float)
        subsidy = df["subsidy_receipts"].values.astype(float) if "subsidy_receipts" in df.columns else None
        feats = _parish_quadrant.compute_features(r, e, subsidy)
        feats["institution_id"] = iid
        rows.append(feats)

    if len(rows) < 4:
        return None

    low, high = _parish_quadrant.stability_terciles(rows)
    for row in rows:
        if row["institution_id"] == institution_id:
            return _parish_quadrant.classify(row["volatility_index"], row["is_subsidized"], low, high)
    return None


# ── Core processing ───────────────────────────────────────────────────────────


def _fetch_series(institution_id: str) -> tuple[pd.DataFrame, str] | None:
    aws_df = _aws_financials.parish_monthly_df(institution_id)
    if aws_df is not None and len(aws_df) >= 6:
        return aws_df, "parish"

    schema = None
    receipt_cols: list[str] = []
    expense_cols: list[str] = []
    matched_entity_type = "parish"
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
            matched_entity_type = etype
            break

    if schema is None:
        return None

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
        return None

    df = pd.DataFrame(res.data)
    df = build_date_index(df)
    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    return df, matched_entity_type


def _partial_correlation(y: np.ndarray, target_var: np.ndarray, other_features: np.ndarray) -> float:
    """Real partial correlation via residualization: regress `y` and
    `target_var` each on every *other* feature, correlate what's left over.
    That isolates the association between `target_var` and `y` net of the
    other variables — unlike a plain `pearsonr(time_idx, y)`, which is what
    this function previously stood in for without controlling for anything."""
    from scipy import stats as scipy_stats
    from sklearn.linear_model import LinearRegression

    if other_features.shape[1] == 0 or np.std(target_var) == 0:
        if np.std(target_var) == 0 or np.std(y) == 0:
            return 0.0
        corr, _ = scipy_stats.pearsonr(target_var, y)
        return abs(float(corr))

    y_resid = y - LinearRegression().fit(other_features, y).predict(other_features)
    t_resid = target_var - LinearRegression().fit(other_features, target_var).predict(other_features)
    if np.std(y_resid) == 0 or np.std(t_resid) == 0:
        return 0.0
    corr, _ = scipy_stats.pearsonr(t_resid, y_resid)
    return abs(float(corr))


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    fetched = _fetch_series(institution_id)
    if fetched is None:
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
    df, entity_type = fetched

    df["month_num"] = df["date"].dt.month
    dates = df["date"].tolist()
    y = df["total_receipts"].values.astype(float)

    # Priest assignment period — structural (tenure, transition), never which
    # specific priest, per the manuscript glossary's framing constraint.
    assignments = _fetch_assignments(institution_id)
    assignment_starts = sorted(pd.Timestamp(a["start_date"]) for a in assignments if a.get("start_date"))
    tenure, transition = _assignment_features(dates, assignments)

    # Weather conditions
    municipality = _fetch_municipality(institution_id) if entity_type == "parish" else None
    weather = _fetch_weather_days(municipality, df["date"].min(), df["date"].max())
    weather_by_date = dict(zip(weather["date"], weather["adverse_weather_days"])) if not weather.empty else {}
    adverse_weather = np.array([weather_by_date.get(pd.Timestamp(d), 0.0) for d in dates])

    # Seasonality
    seasonality = _fetch_seasonality_days(df["date"].dt.year.tolist(), df["month_num"].tolist())

    # Parish cluster — reported as peer context, not a regression dummy (see
    # `_parish_cluster_context` docstring for why).
    parish_cluster = _parish_cluster_context(institution_id, entity_type)

    all_features = ["tenure_months", "assignment_transition", "adverse_weather_days", "liturgical_major_days"]
    all_columns = [tenure, transition, adverse_weather, seasonality]

    # SHAP's LinearExplainer needs at least one column with real variance —
    # a constant column (e.g. no assignment/weather/liturgical data resolved
    # for this institution at all) makes its covariance matrix singular and
    # crashes. Keep only columns that actually vary; fall back to calendar
    # position (month sin/cos + time index — always defined and non-constant
    # for any series with >= 2 months) if every real feature turned out
    # constant, so the regression never operates on a degenerate matrix. A
    # single-column fallback specifically trips a separate SHAP bug (its
    # covariance computation collapses to a 0-d scalar for one feature), so
    # the fallback always keeps at least 3 columns.
    keep = [i for i, col in enumerate(all_columns) if np.std(col) > 0]
    if not keep:
        month_sin = np.sin(2 * np.pi * df["month_num"].to_numpy() / 12)
        month_cos = np.cos(2 * np.pi * df["month_num"].to_numpy() / 12)
        features = ["month_sin", "month_cos", "time_idx"]
        X = np.column_stack([month_sin, month_cos, np.arange(len(y), dtype=float)])
    else:
        features = [all_features[i] for i in keep]
        X = np.column_stack([all_columns[i] for i in keep])

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

    # Partial correlation: tenure vs. collections, controlling for weather and
    # seasonality — the actual "priest assignment period" association, not a
    # generic time-trend correlation.
    other_features = np.column_stack([adverse_weather, seasonality]) if len(dates) > 0 else np.zeros((len(y), 0))
    association_score = round(_partial_correlation(y, tenure, other_features) * 100, 2)

    # Causal inference: pre/post comparison around real assignment
    # transitions (event-study style), not a correlation.
    transition_effect_pct = round(_pre_post_transition_effect(dates, y, assignment_starts), 2)

    n = len(y)
    growth_rate = safe_div(y[-1] - y[0], abs(y[0]) or 1) if n >= 2 else 0.0
    variance = float(np.var(y, ddof=0))
    avg_c = float(np.mean(y))
    trend = "up" if growth_rate > 0.02 else ("down" if growth_rate < -0.02 else "stable")

    narrative = _llm_narrative(
        {
            "avg_collection": avg_c,
            "variance": variance,
            "top_feature": top_feature,
            "gauge_score": gauge_score,
            "trend": trend,
            "growth_rate": growth_rate,
            "transition_effect_pct": transition_effect_pct,
            "parish_cluster": parish_cluster,
        }
    )

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "root_cause_indicator": top_feature,
        "gauge_score": gauge_score,
        "association_score": association_score,
        "transition_effect_pct": transition_effect_pct,
        "parish_cluster": parish_cluster,
        "shap_values": shap_dict,
        "narrative": narrative,
        "timestamp": ts,
    }


async def get_priest_financial_diagnostic(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
