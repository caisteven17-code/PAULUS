"""Idempotent Supabase-to-AWS migration for liturgical calendar data.

The command preserves source identifiers and audit timestamps, loads parent
records before children, and records reconciliation without printing row data.

Usage:
  python -m app.services.liturgical_calendar_migration
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from postgrest.exceptions import APIError
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.services import analytics_db
from app.services.supabase_client import get_table

_PIPELINE_NAME = "liturgical_calendar_supabase_to_aws"
_PAGE_SIZE = 500


@dataclass(frozen=True)
class TableSpec:
    schema: str
    table: str
    columns: tuple[str, ...]
    hash_exclusions: tuple[str, ...] = ()

    @property
    def qualified_name(self) -> str:
        return f"{self.schema}.{self.table}"


RUNS = TableSpec(
    "reference",
    "liturgical_calendar_runs",
    (
        "id",
        "started_at",
        "finished_at",
        "years",
        "completed_years",
        "status",
        "clean_count",
        "review_count",
        "error_detail",
        "created_at",
    ),
)

CALENDAR = TableSpec(
    "reference",
    "liturgical_calendar",
    (
        "id",
        "date",
        "year",
        "month",
        "day",
        "weekday",
        "celebration_name",
        "rank",
        "liturgical_season",
        "source_name",
        "source_url",
        "source_reference",
        "raw_payload",
        "validation_status",
        "validation_reason",
        "gcatholic_match_status",
        "romcal_match_status",
        "litcal_match_status",
        "gcatholic_celebration_name",
        "romcal_celebration_name",
        "litcal_celebration_name",
        "review_status",
        "reviewed_by",
        "reviewed_at",
        "review_notes",
        "revision_payload",
        "created_at",
        "updated_at",
    ),
    # AWS's update trigger owns this timestamp after a changed row is replayed.
    hash_exclusions=("updated_at",),
)

STAGING = TableSpec(
    "staging",
    "liturgical_calendar",
    (
        "id",
        "run_id",
        "date",
        "year",
        "month",
        "day",
        "weekday",
        "celebration_name",
        "rank",
        "liturgical_season",
        "source_name",
        "source_url",
        "source_reference",
        "raw_payload",
        "validation_status",
        "validation_reason",
        "gcatholic_match_status",
        "romcal_match_status",
        "litcal_match_status",
        "gcatholic_celebration_name",
        "romcal_celebration_name",
        "litcal_celebration_name",
        "revision_payload",
        "review_status",
        "review_notes",
        "action",
        "promoted_record_id",
        "applied_at",
        "created_at",
    ),
)


def _fetch_source(spec: TableSpec) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    columns = ",".join(spec.columns)
    while True:
        response = (
            get_table(spec.schema, spec.table)
            .select(columns)
            .order("id")
            .range(start, start + _PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        start += _PAGE_SIZE


def _json_default(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _normalize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, str) and "T" in value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            pass
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize(item) for item in value]
    return value


def _digest(rows: list[dict[str, Any]], spec: TableSpec) -> str:
    included = [column for column in spec.columns if column not in spec.hash_exclusions]
    normalized = [{column: _normalize(row.get(column)) for column in included} for row in rows]
    payload = json.dumps(normalized, sort_keys=True, separators=(",", ":"), default=_json_default)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _adapt(value: Any) -> Any:
    return Jsonb(value) if isinstance(value, dict) else value


def _upsert(cur, spec: TableSpec, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    identifiers = [sql.Identifier(column) for column in spec.columns]
    assignments = [
        sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(column), sql.Identifier(column))
        for column in spec.columns
        if column != "id"
    ]
    compared_columns = [column for column in spec.columns if column != "id"]
    current_values = sql.SQL(", ").join(
        sql.Identifier(spec.table, column) for column in compared_columns
    )
    incoming_values = sql.SQL(", ").join(
        sql.SQL("EXCLUDED.{}").format(sql.Identifier(column)) for column in compared_columns
    )
    statement = sql.SQL(
        "INSERT INTO {}.{} ({}) VALUES ({}) "
        "ON CONFLICT ({}) DO UPDATE SET {} "
        "WHERE ({}) IS DISTINCT FROM ({})"
    ).format(
        sql.Identifier(spec.schema),
        sql.Identifier(spec.table),
        sql.SQL(", ").join(identifiers),
        sql.SQL(", ").join(sql.Placeholder() * len(spec.columns)),
        sql.Identifier("id"),
        sql.SQL(", ").join(assignments),
        current_values,
        incoming_values,
    )
    cur.executemany(statement, [[_adapt(row.get(column)) for column in spec.columns] for row in rows])


def _fetch_target(cur, spec: TableSpec) -> list[dict[str, Any]]:
    statement = sql.SQL("SELECT {} FROM {}.{} ORDER BY id").format(
        sql.SQL(", ").join(sql.Identifier(column) for column in spec.columns),
        sql.Identifier(spec.schema),
        sql.Identifier(spec.table),
    )
    cur.execute(statement)
    return list(cur.fetchall())


def _record_check(
    cur,
    run_id: str,
    name: str,
    source_value: str | int,
    target_value: str | int,
    status: str,
    details: dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO warehouse_control.etl_reconciliation_results (
          run_id, check_name, source_value, target_value,
          difference_value, status, details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            run_id,
            name,
            str(source_value),
            str(target_value),
            str(target_value - source_value)
            if isinstance(source_value, int) and isinstance(target_value, int)
            else None,
            status,
            Jsonb(details or {}),
        ),
    )


def migrate() -> dict[str, Any]:
    source: dict[str, list[dict[str, Any]]] = {}
    staging_available = True
    for spec in (RUNS, CALENDAR):
        source[spec.qualified_name] = _fetch_source(spec)
    try:
        source[STAGING.qualified_name] = _fetch_source(STAGING)
    except APIError as exc:
        if getattr(exc, "code", None) != "PGRST106":
            raise
        staging_available = False
        source[STAGING.qualified_name] = []

    summary: dict[str, Any] = {"tables": {}, "staging_source_available": staging_available}
    with analytics_db.get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
                VALUES (%s, 'backfill', %s)
                RETURNING run_id
                """,
                (_PIPELINE_NAME, Jsonb({"calendar_only": True, "preserve_source_ids": True})),
            )
            run_id = str(cur.fetchone()["run_id"])
            try:
                specs = (RUNS, CALENDAR, STAGING) if staging_available else (RUNS, CALENDAR)
                for spec in specs:
                    _upsert(cur, spec, source[spec.qualified_name])

                failed = False
                loaded_count = 0
                for spec in specs:
                    source_rows = source[spec.qualified_name]
                    target_rows = _fetch_target(cur, spec)
                    source_digest = _digest(source_rows, spec)
                    target_digest = _digest(target_rows, spec)
                    count_status = "passed" if len(source_rows) == len(target_rows) else "failed"
                    hash_status = "passed" if source_digest == target_digest else "failed"
                    failed = failed or count_status == "failed" or hash_status == "failed"
                    loaded_count += len(source_rows)
                    _record_check(
                        cur,
                        run_id,
                        f"{spec.qualified_name}.row_count",
                        len(source_rows),
                        len(target_rows),
                        count_status,
                    )
                    _record_check(
                        cur,
                        run_id,
                        f"{spec.qualified_name}.content_hash",
                        source_digest,
                        target_digest,
                        hash_status,
                        {"excluded_columns": list(spec.hash_exclusions)},
                    )
                    summary["tables"][spec.qualified_name] = {
                        "source_count": len(source_rows),
                        "target_count": len(target_rows),
                        "count_status": count_status,
                        "hash_status": hash_status,
                    }

                cur.execute(
                    """
                    SELECT
                      count(*) FILTER (WHERE s.run_id IS NOT NULL AND r.id IS NULL)::int AS run_orphans,
                      count(*) FILTER (WHERE s.promoted_record_id IS NOT NULL AND c.id IS NULL)::int AS calendar_orphans
                    FROM staging.liturgical_calendar s
                    LEFT JOIN reference.liturgical_calendar_runs r ON r.id = s.run_id
                    LEFT JOIN reference.liturgical_calendar c ON c.id = s.promoted_record_id
                    """
                )
                orphans = cur.fetchone()
                orphan_count = int(orphans["run_orphans"] or 0) + int(orphans["calendar_orphans"] or 0)
                orphan_status = "passed" if orphan_count == 0 else "failed"
                failed = failed or orphan_count > 0
                _record_check(cur, run_id, "liturgical_calendar.foreign_key_orphans", 0, orphan_count, orphan_status)

                if not staging_available:
                    _record_check(
                        cur,
                        run_id,
                        "staging.liturgical_calendar.source_api_access",
                        "available",
                        "unavailable",
                        "warning",
                        {"reason": "Supabase staging schema is not exposed through PostgREST"},
                    )

                status = "failed" if failed else ("partial" if not staging_available else "succeeded")
                cur.execute(
                    """
                    UPDATE warehouse_control.etl_runs
                    SET status = %s, extracted_count = %s, loaded_count = %s,
                        table_counts = %s, finished_at = now()
                    WHERE run_id = %s
                    """,
                    (status, loaded_count, loaded_count, Jsonb(summary["tables"]), run_id),
                )
                summary["status"] = status
                summary["run_id"] = run_id
                if failed:
                    raise RuntimeError("Liturgical calendar reconciliation failed")
            except Exception as exc:
                cur.execute(
                    """
                    UPDATE warehouse_control.etl_runs
                    SET status = 'failed', failed_count = 1,
                        error_summary = %s, finished_at = now()
                    WHERE run_id = %s
                    """,
                    (type(exc).__name__, run_id),
                )
                raise
        conn.commit()
    return summary


def main() -> None:
    summary = migrate()
    print(f"status={summary['status']}")
    for table_name, result in summary["tables"].items():
        print(
            f"{table_name}: source={result['source_count']} target={result['target_count']} "
            f"count={result['count_status']} content={result['hash_status']}"
        )
    staging_status = "available" if summary["staging_source_available"] else "not_exposed"
    print(f"staging_source={staging_status}")


if __name__ == "__main__":
    main()
