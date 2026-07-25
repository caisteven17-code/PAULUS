"""AWS gold-layer readers shared by the diagnostic, predictive, and
prescriptive services.

Every function returns None when the warehouse is disabled, unreachable, or has
no rows for the request — callers then fall back to their existing Supabase
path. Returned DataFrames are date-sorted and always carry `date`,
`year`, `month_num`, `month` (Jan-style name), `total_receipts`, and
`total_expenses`, so downstream statistical code is identical for both sources.
"""

from __future__ import annotations

import logging

import pandas as pd

from app.services import analytics_db
from app.services.data_definitions import MONTH_ORDER

logger = logging.getLogger(__name__)

# Warehouse expense-breakdown columns keyed by the Supabase financial_records
# column names the services (and the frontend) already use as category keys.
EXPENSE_CATEGORY_COLS = {
    "salaries_wages_benefits": "expenses_parish_salaries_wages_benefits",
    "govt_contributions": "expenses_parish_government_contributions",
    "utilities": "expenses_parish_utilities",
    "communications": "expenses_parish_communications",
    "other_rectory_expenses": "expenses_parish_other_rectory",
    "mass_stipend": "expenses_pastoral_mass_stipend",
}

_CATEGORY_SELECTS = ",\n           ".join(
    f'SUM(COALESCE(f.{src}, 0))::float8 AS "{alias}"' for alias, src in EXPENSE_CATEGORY_COLS.items()
)

_ONE_PARISH_SQL = f"""
    SELECT f.date_key,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses,
           {_CATEGORY_SELECTS}
    FROM parish_analytics.fact_parish_monthly_financials f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
    WHERE di.institution_id = %s
    GROUP BY f.date_key
    ORDER BY f.date_key
"""

    # subsidy: account B.3.03 "Subsidy from Diocese" pulled from the
    # account-level breakdown fact table — the monthly fact table's
    # total_collections already blends subsidy into the diocese-wide total,
    # so this is the only way to isolate it per parish-month. Used by
    # parish_cluster.py / cluster_forecast.py to exclude subsidy from
    # net_margin (see _parish_quadrant.compute_features's docstring).
_ALL_PARISHES_SQL = """
    SELECT di.institution_id,
           di.institution_name,
           f.date_key,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses,
           COALESCE(subsidy.amount, 0)::float8 AS subsidy_receipts
    FROM parish_analytics.fact_parish_monthly_financials f
    JOIN parish_analytics.dim_parishes dp ON dp.parish_key = f.parish_key
    JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
    LEFT JOIN (
        SELECT dp2.institution_key, b.date_key, SUM(b.amount)::float8 AS amount
        FROM parish_analytics.fact_parish_financial_breakdowns b
        JOIN parish_analytics.dim_parishes dp2 ON dp2.parish_key = b.parish_key
        JOIN parish_analytics.dim_iafr_account a ON a.iafr_account_key = b.iafr_account_key
        WHERE a.account_code = 'B.3.03'
        GROUP BY dp2.institution_key, b.date_key
    ) subsidy ON subsidy.institution_key = di.institution_key AND subsidy.date_key = f.date_key
    GROUP BY di.institution_id, di.institution_name, f.date_key, subsidy.amount
    ORDER BY di.institution_id, f.date_key
"""


def _finalize(df: pd.DataFrame) -> pd.DataFrame:
    df["date"] = pd.to_datetime(df["date_key"].astype(str), format="%Y%m")
    df["year"] = df["date"].dt.year
    df["month_num"] = df["date"].dt.month
    df["month"] = df["month_num"].map(lambda m: MONTH_ORDER[m - 1])
    return df.sort_values("date").reset_index(drop=True)


def parish_monthly_df(institution_id: str) -> pd.DataFrame | None:
    """Monthly series for one parish, including expense category columns
    (named after their Supabase counterparts). None → caller falls back."""
    if not analytics_db.enabled():
        return None
    try:
        rows = analytics_db.fetch_query(_ONE_PARISH_SQL, [institution_id])
    except Exception:
        logger.exception("AWS monthly series read failed for %s; falling back to Supabase", institution_id)
        return None
    if not rows:
        return None
    return _finalize(pd.DataFrame(rows))


# Multi-institution monthly totals from the v2 candidates view (institution_id
# is a raw column there — no dim_institutions join needed). Hoisted out of
# health_scoring.py so its batch endpoint and financial_trend.py's
# decline-monitor batch share one fetch instead of near-duplicate SQL.
_MANY_PARISHES_TOTALS_SQL = """
    SELECT f.institution_id,
           f.date_key,
           SUM(COALESCE(f.total_collections, 0))::float8 AS total_receipts,
           SUM(COALESCE(f.total_expenses, 0))::float8 AS total_expenses
    FROM parish_analytics.vw_parish_monthly_financial_candidates_v2 f
    {where_sql}
    GROUP BY f.institution_id, f.date_key
    ORDER BY f.institution_id, f.date_key
"""


def parish_monthly_totals(institution_ids: list[str], year: int | None = None) -> pd.DataFrame:
    """Monthly totals for N institutions in one round trip. Returns a df with
    institution_id (str), date_key, total_receipts, total_expenses, year,
    month (Jan-style name) — empty df when nothing matches."""
    where: list[str] = []
    params: list = []
    if len(institution_ids) == 1:
        where.append("f.institution_id = %s")
        params.append(institution_ids[0])
    else:
        where.append("f.institution_id = ANY(%s)")
        params.append(institution_ids)
    if year:
        where.append("f.date_key >= %s AND f.date_key < %s")
        params.extend([year * 100, (year + 1) * 100])

    rows = analytics_db.fetch_query(_MANY_PARISHES_TOTALS_SQL.format(where_sql="WHERE " + " AND ".join(where)), params)
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["institution_id"] = df["institution_id"].astype(str)
    df["year"] = df["date_key"] // 100
    df["month"] = (df["date_key"] % 100 - 1).map(lambda i: MONTH_ORDER[i])
    return df


def all_parish_monthly_dfs() -> list[tuple[str, pd.DataFrame]] | None:
    """(institution_id, monthly df) for every parish in the warehouse, one
    round trip. Each df keeps an `institution_name` column so callers that
    display names (parish clustering) don't need a second lookup. None →
    caller falls back to per-parish Supabase reads."""
    if not analytics_db.enabled():
        return None
    try:
        rows = analytics_db.fetch_query(_ALL_PARISHES_SQL)
    except Exception:
        logger.exception("AWS all-parish series read failed; falling back to Supabase")
        return None
    if not rows:
        return None
    df = pd.DataFrame(rows)
    return [(str(iid), _finalize(g.drop(columns=["institution_id"]))) for iid, g in df.groupby("institution_id")]
