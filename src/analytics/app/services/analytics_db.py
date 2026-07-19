"""AWS RDS warehouse connection — the analytics-DB counterpart to supabase_client.py.

Call shapes deliberately mirror supabase-py (upsert_rows(...) ~ .upsert(rows,
on_conflict=...), fetch_all(...) ~ .select("*").range(...)) so repointing a
loader from Supabase to this module is a small, mechanical diff.
"""

from __future__ import annotations

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.config import ANALYTICS_DB_URL

_pool: ConnectionPool | None = None


def enabled() -> bool:
    return bool(ANALYTICS_DB_URL)


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not ANALYTICS_DB_URL:
            raise RuntimeError("ANALYTICS_DB_URL must be set in .env")
        _pool = ConnectionPool(ANALYTICS_DB_URL, min_size=0, max_size=4, open=True)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _adapt(value):
    return Jsonb(value) if isinstance(value, (dict, list)) else value


def execute(sql: str, params: dict | list | tuple | None = None) -> None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


def execute_returning_one(sql: str, params: dict | list | tuple | None = None) -> dict | None:
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
    return row


def fetch_query(sql: str, params: dict | list | tuple | None = None) -> list[dict]:
    with get_pool().connection() as conn:
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


def upsert_rows(schema: str, table: str, rows: list[dict], conflict_cols: list[str] | str) -> int:
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
    execute(sql, params)
    return len(rows)


def fetch_one(schema: str, table: str, where: dict, columns: str = "*") -> dict | None:
    conditions = " AND ".join(f'"{k}" = %s' for k in where)
    sql = f'SELECT {columns} FROM "{schema}"."{table}" WHERE {conditions} LIMIT 1'
    with get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, list(where.values()))
            return cur.fetchone()


def upsert_row(schema: str, table: str, row: dict, conflict_cols: list[str] | str, returning: str | None = None):
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

    with get_pool().connection() as conn:
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
