"""AWS RDS warehouse connection — the analytics-DB counterpart to supabase_client.py.

Call shapes deliberately mirror supabase-py (upsert_rows(...) ~ .upsert(rows,
on_conflict=...), fetch_all(...) ~ .select("*").range(...)) so repointing a
loader from Supabase to this module is a small, mechanical diff.
"""

from __future__ import annotations

from threading import RLock

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.config import ANALYTICS_DB_URL, WAREHOUSE_DB_STATEMENT_TIMEOUT_SECONDS

_pool: ConnectionPool | None = None
_pool_lock = RLock()
_etl_pool: ConnectionPool | None = None
_etl_pool_lock = RLock()


def enabled() -> bool:
    return bool(ANALYTICS_DB_URL)


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        if not ANALYTICS_DB_URL:
            raise RuntimeError("ANALYTICS_DB_URL must be set in .env")
        # min_size=0 meant every request after an idle gap paid for a fresh
        # TCP/TLS handshake to RDS with no connect timeout — under real
        # traffic (the frontend fires financial-trend + seasonality
        # concurrently on every filter change), several of these cold opens
        # would stack up and, if any one of them stalled, block the entire
        # single-worker service from accepting *any* request for 30-90s.
        # min_size keeps warm connections ready; connect_timeout caps how
        # long a bad connection attempt can block the pool. A real dashboard
        # page load fires several endpoints at once (financial-trend,
        # seasonality, projects, health-scores) and each of those internally
        # opens its own pool checkout (some via a ThreadPoolExecutor of 2-3
        # sub-queries) — under that concurrency, max_size=8 measurably
        # queued requests and pushed a few past the NestJS gateway's 20s
        # timeout, observed as "Python analytics batch call failed" fallback
        # log lines. RDS allows 81 connections total (~35 in use at peak
        # observed load across all services sharing the instance), so
        # max_size=20 gives real concurrency headroom without approaching
        # that ceiling.
        # check + max_idle: long-running callers (e.g. weather_collector.py,
        # which spends 30-40+ min fetching external APIs before ever
        # touching this pool) would get handed a connection RDS had already
        # silently closed after sitting idle — "server closed the connection
        # unexpectedly" on the very first query. check validates/repairs a
        # connection before handing it out; max_idle recycles connections
        # proactively instead of waiting for them to go stale.
        _pool = ConnectionPool(
            ANALYTICS_DB_URL,
            min_size=2,
            max_size=20,
            timeout=30,
            max_idle=120,
            kwargs={
                "connect_timeout": 10,
                "options": f"-c statement_timeout={WAREHOUSE_DB_STATEMENT_TIMEOUT_SECONDS * 1000}",
            },
            check=ConnectionPool.check_connection,
            open=True,
        )
    return _pool


# Separate, deliberately small pool for ETL/sync writers (parish_gold_loader,
# institution_dimension_sync, and similar warehouse_control.etl_runs-tracked
# jobs) — kept fully independent of the read-serving pool above. A slow or
# stuck ETL write (observed once holding a connection for 15+ minutes before
# its owning process was killed) used to compete for the *same* max_size=20
# budget every dashboard request also draws from; one heavy writer could
# leave live user-facing requests queued for the pool's own 30s timeout,
# which is indistinguishable from the whole service being down. A hard
# max_size=4 here means ETL work can never starve the read pool, regardless
# of how long any single ETL query runs.
def get_etl_pool() -> ConnectionPool:
    global _etl_pool
    if _etl_pool is not None:
        return _etl_pool
    with _etl_pool_lock:
        if _etl_pool is not None:
            return _etl_pool
        if not ANALYTICS_DB_URL:
            raise RuntimeError("ANALYTICS_DB_URL must be set in .env")
        _etl_pool = ConnectionPool(
            ANALYTICS_DB_URL,
            min_size=0,
            max_size=4,
            timeout=30,
            max_idle=120,
            kwargs={
                "connect_timeout": 10,
                "options": f"-c statement_timeout={WAREHOUSE_DB_STATEMENT_TIMEOUT_SECONDS * 1000}",
            },
            check=ConnectionPool.check_connection,
            open=True,
        )
    return _etl_pool


def close_pool() -> None:
    global _pool
    with _pool_lock:
        stale_pool = _pool
        _pool = None
    if stale_pool is not None:
        stale_pool.close(timeout=5)


def close_etl_pool() -> None:
    global _etl_pool
    with _etl_pool_lock:
        stale_pool = _etl_pool
        _etl_pool = None
    if stale_pool is not None:
        stale_pool.close(timeout=5)


def discard_pool() -> None:
    """Drop stale RDS connections; the next operation creates a fresh pool."""
    try:
        close_pool()
    except Exception:
        # The pool is already detached above. Recovery must not be prevented by
        # an error while closing sockets from the failed AWS connection.
        pass


def discard_etl_pool() -> None:
    """ETL-pool counterpart of discard_pool() — a connection recovery in an
    ETL worker must never tear down the read-serving pool live dashboard
    requests depend on."""
    try:
        close_etl_pool()
    except Exception:
        pass


def reap_stale_etl_runs() -> int:
    """Mark any warehouse_control.etl_runs row still 'running' as 'failed'.

    Call once at process startup. A pipeline run cannot span a process
    restart — anything still 'running' when a fresh process boots is
    guaranteed orphaned (its owning process was killed/crashed/redeployed
    before it could record a real outcome), never an actually-in-progress
    job. Without this, orphaned rows accumulate indefinitely and the
    etl_runs history stops reflecting reality. Returns the number of rows
    reaped.
    """
    with get_etl_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE warehouse_control.etl_runs
                SET status = 'failed',
                    finished_at = now(),
                    error_summary = 'Orphaned at startup: owning process exited before recording a real outcome.'
                WHERE status = 'running'
                """
            )
            count = cur.rowcount
        conn.commit()
    return count


def _adapt(value):
    return Jsonb(value) if isinstance(value, (dict, list)) else value


def execute(sql: str, params: dict | list | tuple | None = None, pool: ConnectionPool | None = None) -> None:
    with (pool or get_pool()).connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


def execute_returning_one(
    sql: str, params: dict | list | tuple | None = None, pool: ConnectionPool | None = None
) -> dict | None:
    with (pool or get_pool()).connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
    return row


def fetch_query(sql: str, params: dict | list | tuple | None = None, pool: ConnectionPool | None = None) -> list[dict]:
    with (pool or get_pool()).connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def fetch_all(schema: str, table: str, columns: str = "*", order_by: str | None = None) -> list[dict]:
    sql = f'SELECT {columns} FROM "{schema}"."{table}"'
    if order_by:
        sql += f' ORDER BY "{order_by}"'
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql)
            return cur.fetchall()


def upsert_rows(
    schema: str,
    table: str,
    rows: list[dict],
    conflict_cols: list[str] | str,
    pool: ConnectionPool | None = None,
) -> int:
    """INSERT ... ON CONFLICT (conflict_cols) DO UPDATE. Every row must share the
    same set of keys (all call sites in this codebase already build batches this way).
    """
    if not rows:
        return 0
    if isinstance(conflict_cols, str):
        conflict_cols = [c.strip() for c in conflict_cols.split(",")]

    columns = list(rows[0].keys())
    update_cols = [c for c in columns if c not in conflict_cols]

    col_list = ", ".join(f'"{c}"' for c in columns)
    conflict_list = ", ".join(f'"{c}"' for c in conflict_cols)
    update_list = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols) or conflict_list
    values_sql = ", ".join(["(" + ", ".join(["%s"] * len(columns)) + ")"] * len(rows))
    params = [_adapt(row.get(c)) for row in rows for c in columns]

    sql = (
        f'INSERT INTO "{schema}"."{table}" ({col_list}) VALUES {values_sql} '
        f"ON CONFLICT ({conflict_list}) DO UPDATE SET {update_list}"
    )
    execute(sql, params, pool=pool)
    return len(rows)


def fetch_one(schema: str, table: str, where: dict, columns: str = "*") -> dict | None:
    conditions = " AND ".join(f'"{k}" = %s' for k in where)
    sql = f'SELECT {columns} FROM "{schema}"."{table}" WHERE {conditions} LIMIT 1'
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, list(where.values()))
            return cur.fetchone()


def upsert_row(
    schema: str,
    table: str,
    row: dict,
    conflict_cols: list[str] | str,
    returning: str | None = None,
    pool: ConnectionPool | None = None,
):
    """Single-row INSERT ... ON CONFLICT DO UPDATE. With `returning`, always
    yields that column's value whether the row was inserted or already existed
    — the "find or create, give me the key" pattern used by dimension tables.
    """
    if isinstance(conflict_cols, str):
        conflict_cols = [c.strip() for c in conflict_cols.split(",")]

    columns = list(row.keys())
    update_cols = [c for c in columns if c not in conflict_cols]
    col_list = ", ".join(f'"{c}"' for c in columns)
    conflict_list = ", ".join(f'"{c}"' for c in conflict_cols)
    update_list = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols) or (
        f'"{conflict_cols[0]}" = EXCLUDED."{conflict_cols[0]}"'
    )
    placeholders = ", ".join(["%s"] * len(columns))
    params = [_adapt(row[c]) for c in columns]

    sql = (
        f'INSERT INTO "{schema}"."{table}" ({col_list}) VALUES ({placeholders}) '
        f"ON CONFLICT ({conflict_list}) DO UPDATE SET {update_list}"
    )
    if returning:
        sql += f' RETURNING "{returning}"'

    with (pool or get_pool()).connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            result = cur.fetchone() if returning else None
        conn.commit()
    return result[0] if result else None


def call_function(schema: str, func_name: str, **kwargs):
    arg_list = ", ".join(f"{k} => %({k})s" for k in kwargs)
    sql = f'SELECT "{schema}"."{func_name}"({arg_list})'
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, kwargs)
            row = cur.fetchone()
        conn.commit()
    return row[0] if row else None
