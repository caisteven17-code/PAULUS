"""
Descriptive: Financial Trend
Computes monthly totals, STL decomposition, Z-score anomaly flags, and KPIs.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.services import analytics_db
from app.services._institution_pool import run_parallel
from app.services.data_definitions import (
    _SCHEMA_MAP,
    build_date_index,
    safe_div,
)
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

# Diocese-wide aggregate sentinel accepted in place of an institution UUID.
ALL_INSTITUTIONS = "all"

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
    # bool(p == -1) — p is numpy.int64, and p == -1 is numpy.bool, which
    # FastAPI's jsonable_encoder cannot serialize (unlike a native Python bool).
    return [bool(p == -1) for p in preds]


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


def _insufficient(entity_id: str, entity_type: str) -> dict[str, Any]:
    return {
        "data_sufficient": False,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "monthly_series": [],
        "anomaly_flags": [],
        "kpis": {},
        "decline_detected": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _analyze(
    df: pd.DataFrame,
    entity_id: str,
    entity_type: str,
    extra_cols: list[str] | None = None,
) -> dict[str, Any]:
    """Statistical core. Expects df sorted by month with `date`, `total_receipts`
    and `total_expenses` columns; `extra_cols` are passed through into each
    monthly_series entry (category breakdowns from the gold layer)."""
    ts = datetime.now(timezone.utc).isoformat()
    extra_cols = extra_cols or []
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
            **{c: round(float(df[c].iloc[i]), 2) for c in extra_cols},
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


def _build_response(
    df: pd.DataFrame,
    receipt_cols: list[str],
    expense_cols: list[str],
    entity_id: str,
    entity_type: str,
) -> dict[str, Any]:
    if df.empty:
        return _insufficient(entity_id, entity_type)

    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    return _analyze(df, entity_id, entity_type)


def _dedup_select_cols(entity_type: str) -> tuple[str, list[str], list[str], list[str]]:
    schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]
    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)
    return schema, receipt_cols, expense_cols, select_cols


def _fetch_and_process(institution_id: str, entity_type: str) -> dict[str, Any]:
    schema, receipt_cols, expense_cols, select_cols = _dedup_select_cols(entity_type)

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
        return _insufficient(institution_id, entity_type)

    df = pd.DataFrame(result.data)
    return _build_response(df, receipt_cols, expense_cols, institution_id, entity_type)


# ── AWS gold-layer path (parishes) ────────────────────────────────────────────

# Four real, reconciling components of total_collections (verified against the
# warehouse's own validation formula: sacraments_parish_share +
# sacraments_over_above + collections_mass + other_collections(net) +
# other_receipts ≈ total_collections, ~99.5% match):
#   - collections_mass: Section B.1 (weekday/Sunday/Saturday mass collections)
#   - sacraments: parish's actual retained share (NOT the gross prescribed/
#     arancel amount — that overstates by the diocese/bishop's-fund portion)
#   - other_receipts: Section B.3 (donations, interest, subsidy, special/
#     second collections, charge over/above, misc receipts)
#   - other_collections: Section B.2 (rentals, mortuary, kandilaan, donation
#     boxes, envelopes, parking), net of a 5% deduction that applied 2023-2025
_AWS_CATEGORY_COLS = [
    "collections_mass",
    "sacraments",
    "other_receipts",
    "other_collections",
    "expenses_parish",
    "expenses_pastoral",
]

# Sourced from the v2 candidates view rather than the gold fact table: it
# carries institution_id directly (no dim_institutions join needed for scope)
# and already has collections_other_95 / collections_other_receipts, which
# the promoted gold table doesn't yet include. Verified fast (unmaterialized
# view, but a full 5,232-row scan takes ~50ms) and reconciles against
# total_collections, so it's safe to read live.
_AWS_TREND_SQL_TEMPLATE = """
    SELECT f.date_key,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses,
           SUM(COALESCE(f.collections_mass, 0))::float8 AS collections_mass,
           SUM(COALESCE(f.sacraments_parish_share, 0)
             + COALESCE(f.sacraments_over_above_confirmation_incl, 0))::float8 AS sacraments,
           SUM(COALESCE(f.collections_other_receipts, 0))::float8 AS other_receipts,
           SUM(COALESCE(f.collections_other_95, 0)
             * (1 - CASE WHEN f.reporting_year BETWEEN 2023 AND 2025 THEN 0.05 ELSE 0 END))::float8
             AS other_collections,
           SUM(COALESCE(f.expenses_parish, 0))::float8 AS expenses_parish,
           SUM(COALESCE(f.expenses_pastoral_mass_stipend, 0))::float8 AS expenses_pastoral
    FROM parish_analytics.vw_parish_monthly_financial_candidates_v2 f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    {where_sql}
    GROUP BY f.date_key
    ORDER BY f.date_key
"""

# Last-12-months rollups powering the vicariate bar chart and its per-parish
# drill-down. date_key is YYYYMM, so "- 100" is one calendar year back.
_AWS_VICARIATE_SQL = """
    SELECT COALESCE(NULLIF(TRIM(dp.vicariate), ''), 'Unassigned') AS vicariate,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses
    FROM parish_analytics.fact_parish_monthly_financials f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    WHERE f.date_key > (SELECT MAX(date_key) - 100 FROM parish_analytics.fact_parish_monthly_financials)
    GROUP BY 1
    ORDER BY 2 DESC
"""

_AWS_PARISH_TOTALS_SQL = """
    SELECT di.institution_name AS name,
           COALESCE(NULLIF(TRIM(dp.vicariate), ''), 'Unassigned') AS vicariate,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses
    FROM parish_analytics.fact_parish_monthly_financials f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
    WHERE f.date_key > (SELECT MAX(date_key) - 100 FROM parish_analytics.fact_parish_monthly_financials)
    GROUP BY 1, 2
    ORDER BY 3 DESC
"""


# Section D operating-expense groups + pastoral stipend, summed over the most
# recent 12 months — feeds the "Top Disbursement Categories" chart.
_AWS_DISB_CATEGORIES_SQL = """
    SELECT
      SUM(COALESCE(f.expenses_parish_salaries_wages_benefits, 0))::float8 AS "Salaries, Wages & Benefits",
      SUM(COALESCE(f.expenses_parish_government_contributions, 0))::float8 AS "Government Contributions",
      SUM(COALESCE(f.expenses_parish_utilities, 0))::float8 AS "Utilities",
      SUM(COALESCE(f.expenses_parish_communications, 0))::float8 AS "Communications",
      SUM(COALESCE(f.expenses_parish_other_rectory, 0))::float8 AS "Other Rectory Expenses",
      SUM(COALESCE(f.expenses_pastoral_mass_stipend, 0))::float8 AS "Pastoral & Mass Stipends"
    FROM parish_analytics.fact_parish_monthly_financials f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
    WHERE f.date_key > (SELECT MAX(date_key) - 100 FROM parish_analytics.fact_parish_monthly_financials)
    {scope_sql}
"""


def _fetch_and_process_aws_parish(
    institution_id: str,
    year: int | None,
    vicariates: list[str] | None = None,
    institution_ids: list[str] | None = None,
) -> dict[str, Any]:
    scope_all = institution_id == ALL_INSTITUTIONS
    where: list[str] = []
    params: list[Any] = []
    if not scope_all:
        where.append("f.institution_id = %s")
        params.append(institution_id)
    if vicariates:
        where.append("dp.vicariate = ANY(%s)")
        params.append(vicariates)
    if institution_ids:
        # Resolves the Class filter (and any District/Vicariate/Class combo),
        # computed client-side against the real diocese.institutions.class
        # column — the warehouse has no "class" dimension of its own, so the
        # frontend narrows to a concrete institution set before the request.
        where.append("f.institution_id = ANY(%s)")
        params.append(institution_ids)
    if year:
        where.append("f.date_key >= %s AND f.date_key < %s")
        params.extend([year * 100, (year + 1) * 100])
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = analytics_db.fetch_query(_AWS_TREND_SQL_TEMPLATE.format(where_sql=where_sql), params)
    if len(rows) < 3:
        return _insufficient(institution_id, "parish")

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date_key"].astype(str), format="%Y%m")

    result = _analyze(df, institution_id, "parish", extra_cols=_AWS_CATEGORY_COLS)
    result["source"] = "aws"

    if result.get("data_sufficient"):
        # Same scope as the trend query above: single parish, a vicariate/
        # district/class subset, or the whole diocese.
        if not scope_all:
            disb_scope_sql, disb_params = "AND di.institution_id = %s", [institution_id]
        elif institution_ids:
            disb_scope_sql, disb_params = "AND di.institution_id = ANY(%s)", [institution_ids]
        elif vicariates:
            disb_scope_sql, disb_params = "AND dp.vicariate = ANY(%s)", [vicariates]
        else:
            disb_scope_sql, disb_params = "", []

        # Vicariate/parish rollups are diocese-wide-only breakdowns (used for
        # the drill-down bar chart) — not meaningful once already scoped to a
        # vicariate/district/class subset or a single parish.
        include_rollups = scope_all and not vicariates and not institution_ids

        # These queries are independent of each other and of the main trend
        # query above (already done) — running them one after another was
        # stacking each one's own AWS RDS round-trip on top of the last, the
        # single biggest contributor to how long the diocese-wide "all"
        # request took. The connection pool allows up to 8 concurrent
        # connections, so firing 1-3 queries at once is well within budget.
        jobs: dict[str, Callable[[], list[dict]]] = {
            "disb": lambda: analytics_db.fetch_query(
                _AWS_DISB_CATEGORIES_SQL.format(scope_sql=disb_scope_sql), disb_params
            ),
        }
        if include_rollups:
            jobs["vicariate"] = lambda: analytics_db.fetch_query(_AWS_VICARIATE_SQL)
            jobs["parish"] = lambda: analytics_db.fetch_query(_AWS_PARISH_TOTALS_SQL)

        with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
            futures = {name: pool.submit(fn) for name, fn in jobs.items()}
            job_results = {name: future.result() for name, future in futures.items()}

        cat_rows = job_results["disb"]
        if cat_rows:
            result["disbursement_categories"] = sorted(
                ({"category": k, "amount": round(float(v or 0), 2)} for k, v in cat_rows[0].items()),
                key=lambda x: -x["amount"],
            )

        if include_rollups:
            result["vicariate_totals"] = [
                {
                    "vicariate": r["vicariate"],
                    "total_receipts": round(float(r["total_receipts"]), 2),
                    "total_expenses": round(float(r["total_expenses"]), 2),
                }
                for r in job_results["vicariate"]
            ]
            result["parish_totals"] = [
                {
                    "name": r["name"],
                    "vicariate": r["vicariate"],
                    "total_receipts": round(float(r["total_receipts"]), 2),
                    "total_expenses": round(float(r["total_expenses"]), 2),
                }
                for r in job_results["parish"]
            ]
    return result


def _fetch_and_process_supabase_all() -> dict[str, Any]:
    """Diocese-wide Supabase fallback: totals only (no category breakdown)."""
    schema, receipt_cols, expense_cols, select_cols = _dedup_select_cols("parish")

    inst_res = (
        get_table("diocese", "institutions")
        .select("id, name, vicariate, institution_type")
        .eq("institution_type", "parish")
        .execute()
    )
    institutions = inst_res.data or []
    if not institutions:
        return _insufficient(ALL_INSTITUTIONS, "parish")

    def _worker(inst: dict) -> dict | None:
        res = (
            get_table(schema, "financial_records")
            .select(", ".join(select_cols))
            .eq("institution_id", inst["id"])
            .eq("is_current_version", True)
            .is_("deleted_at", "null")
            .order("year")
            .execute()
        )
        if not res.data:
            return None
        df = pd.DataFrame(res.data)
        df = build_date_index(df)
        for col in receipt_cols + expense_cols:
            if col not in df.columns:
                df[col] = 0.0
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        df["total_receipts"] = df[receipt_cols].sum(axis=1)
        df["total_expenses"] = df[expense_cols].sum(axis=1)
        return {"inst": inst, "df": df[["date", "total_receipts", "total_expenses"]]}

    results = run_parallel(_worker, institutions)
    if not results:
        return _insufficient(ALL_INSTITUTIONS, "parish")

    combined = pd.concat([r["df"] for r in results])
    monthly = combined.groupby("date", as_index=False)[["total_receipts", "total_expenses"]].sum()
    monthly = monthly.sort_values("date").reset_index(drop=True)
    if len(monthly) < 3:
        return _insufficient(ALL_INSTITUTIONS, "parish")

    result = _analyze(monthly, ALL_INSTITUTIONS, "parish")
    result["source"] = "supabase"

    cutoff = monthly["date"].max() - pd.DateOffset(months=12)
    vicariate_totals: dict[str, dict[str, float]] = {}
    parish_totals: list[dict[str, Any]] = []
    for r in results:
        recent = r["df"][r["df"]["date"] > cutoff]
        receipts = float(recent["total_receipts"].sum())
        expenses = float(recent["total_expenses"].sum())
        vic = (r["inst"].get("vicariate") or "Unassigned").strip() or "Unassigned"
        agg = vicariate_totals.setdefault(vic, {"total_receipts": 0.0, "total_expenses": 0.0})
        agg["total_receipts"] += receipts
        agg["total_expenses"] += expenses
        parish_totals.append(
            {
                "name": r["inst"].get("name") or "",
                "vicariate": vic,
                "total_receipts": round(receipts, 2),
                "total_expenses": round(expenses, 2),
            }
        )
    result["vicariate_totals"] = sorted(
        (
            {"vicariate": v, "total_receipts": round(t["total_receipts"], 2), "total_expenses": round(t["total_expenses"], 2)}
            for v, t in vicariate_totals.items()
        ),
        key=lambda x: -x["total_receipts"],
    )
    result["parish_totals"] = sorted(parish_totals, key=lambda x: -x["total_receipts"])
    return result


def _apply_timeframe(result: dict[str, Any], timeframe: str | None) -> dict[str, Any]:
    window = {"6m": 6, "12m": 12}.get(timeframe or "")
    if window and result.get("data_sufficient"):
        result["monthly_series"] = result["monthly_series"][-window:]
        result["anomaly_flags"] = result["anomaly_flags"][-window:]
    return result


async def get_financial_trend(
    institution_id: str,
    entity_type: str,
    year: int | None = None,
    timeframe: str | None = None,
    vicariates: list[str] | None = None,
    institution_ids: list[str] | None = None,
) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")

    if entity_type == "parish" and analytics_db.enabled():
        try:
            result = await asyncio.to_thread(
                _fetch_and_process_aws_parish, institution_id, year, vicariates, institution_ids
            )
            if result.get("data_sufficient"):
                return _apply_timeframe(result, timeframe)
            if vicariates or institution_ids or year:
                # The Supabase "all" fallback below has no concept of vicariate
                # or year scoping — it aggregates whatever it has across every
                # institution and every year, regardless of what was asked
                # for. Silently ignoring the filter and returning that as if
                # it satisfied a scoped request is worse than admitting there
                # was no real data: the AWS path is the only source that
                # understands "no data for year 2026 yet" as distinct from
                # "the diocese collected nothing," and it already said so.
                return _apply_timeframe(result, timeframe)
        except Exception:
            logger.exception("AWS financial trend read failed; falling back to Supabase")

    if entity_type == "parish" and institution_id == ALL_INSTITUTIONS:
        result = await asyncio.to_thread(_fetch_and_process_supabase_all)
    else:
        result = await asyncio.to_thread(_fetch_and_process, institution_id, entity_type)
    return _apply_timeframe(result, timeframe)
