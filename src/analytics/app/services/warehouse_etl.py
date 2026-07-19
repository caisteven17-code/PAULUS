"""Supabase-to-AWS bronze loader for warehouse master data and parish pilots.

The existing AWS domain schemas are the bronze layer. This module deliberately
does not refresh silver or gold objects.

Usage:
  python -m app.services.warehouse_etl minimal
  python -m app.services.warehouse_etl dry-run --institution-id <uuid> --year 2021
  python -m app.services.warehouse_etl pilot --institution-id <uuid> --year 2021
"""

from __future__ import annotations

import argparse
import logging
from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb

from app.services import analytics_db
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

_PAGE_SIZE = 1000
_PIPELINE_NAME = "parish_bronze"

_FINANCIAL_AMOUNT_COLUMNS = (
    "sacraments_total",
    "confirmation_total",
    "mass_intentions_total",
    "mass_intentions_claimed",
    "mass_intentions_unclaimed",
    "mass_collection_weekday",
    "mass_collection_sunday",
    "mass_collection_saturday",
    "consumable_collections",
    "other_collections_total",
    "donations",
    "interest_income",
    "subsidy_inflow",
    "special_collections",
    "second_collections",
    "charge_over_above",
    "other_receipts",
    "priest_share",
    "mass_stipend",
    "other_pastoral_expenses",
    "salaries_wages_benefits",
    "govt_contributions",
    "utilities",
    "communications",
    "other_rectory_expenses",
    "construction_receipts",
    "construction_expenses",
    "remittance_to_diocese",
    "bishops_fund_share",
    "special_collections_remittance",
    "beginning_balance",
    "ending_balance_before_remit",
    "ending_balance_after_remit",
    "net_receipts",
    "pastoral_parish_fund_total_net_receipts",
)

_TRIGGERS = {
    ("diocese", "institutions"): (
        "audit_change",
        "set_updated_at_institutions",
        "trg_institution_code",
    ),
    ("parishes", "details"): ("audit_change", "set_updated_at_parish_details"),
    ("parishes", "iafr_account_titles"): (
        "audit_change",
        "set_updated_at_parish_account_titles",
    ),
    ("operations", "submission_batches"): (
        "audit_change",
        "set_updated_at_submission_batches",
    ),
    ("parishes", "financial_records"): (
        "audit_change",
        "set_updated_at_parish_financial_records",
        "trg_financial_records_balance_sync",
    ),
    ("parishes", "iafr_line_items"): (
        "audit_change",
        "set_updated_at_parish_line_items",
        "trg_iafr_line_items_sync",
    ),
}


def _fetch_all(
    schema: str,
    table: str,
    filters: dict[str, Any] | None = None,
    *,
    order_by: str | None = None,
) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = get_table(schema, table).select("*")
        for column, value in (filters or {}).items():
            if value is None:
                query = query.is_(column, "null")
            elif isinstance(value, (list, tuple, set)):
                query = query.in_(column, list(value))
            else:
                query = query.eq(column, value)
        if order_by:
            query = query.order(order_by)
        response = query.range(offset, offset + _PAGE_SIZE - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return rows


def _set_triggers(schema: str, table: str, enabled: bool) -> None:
    action = "ENABLE" if enabled else "DISABLE"
    for trigger in _TRIGGERS.get((schema, table), ()):
        analytics_db.execute(f'ALTER TABLE "{schema}"."{table}" {action} TRIGGER "{trigger}"')


def _mirror_rows(schema: str, table: str, rows: list[dict], conflict_col: str) -> int:
    if not rows:
        return 0
    _set_triggers(schema, table, False)
    try:
        return analytics_db.upsert_rows(schema, table, rows, conflict_cols=conflict_col)
    finally:
        _set_triggers(schema, table, True)


def mirror_table(schema: str, table: str, conflict_col: str = "id", disable_triggers: list[str] = ()) -> int:
    rows = _fetch_all(schema, table)
    original = _TRIGGERS.get((schema, table), ())
    if disable_triggers:
        _TRIGGERS[(schema, table)] = tuple(dict.fromkeys((*original, *disable_triggers)))
    try:
        count = _mirror_rows(schema, table, rows, conflict_col)
    finally:
        if disable_triggers:
            _TRIGGERS[(schema, table)] = original
    logger.info("Mirror %s.%s: %d row(s)", schema, table, count)
    return count


def run() -> dict[str, int]:
    """Retain the original minimal master-data mirror as the default mode."""
    results = {}
    results["diocese.roles"] = mirror_table("diocese", "roles")
    results["diocese.institutions"] = mirror_table("diocese", "institutions")
    results["diocese.profiles"] = mirror_table("diocese", "profiles", disable_triggers=["trg_profile_code"])
    return results


def _start_run(mode: str, scope: dict[str, Any]) -> str:
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, %s, %s)
        RETURNING run_id
        """,
        (_PIPELINE_NAME, mode, Jsonb(scope)),
    )
    if not row:
        raise RuntimeError("Failed to create ETL run")
    return str(row["run_id"])


def _finish_run(
    run_id: str,
    status: str,
    counts: dict[str, Any],
    *,
    extracted: int,
    loaded: int,
    failed: int = 0,
    error: str | None = None,
) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s,
            extracted_count = %s,
            loaded_count = %s,
            failed_count = %s,
            table_counts = %s,
            error_summary = %s,
            finished_at = now()
        WHERE run_id = %s
        """,
        (status, extracted, loaded, failed, Jsonb(counts), error, run_id),
    )


def _extract_pilot(institution_id: str, year: int) -> dict[str, list[dict]]:
    institutions = _fetch_all("diocese", "institutions", {"id": institution_id})
    if len(institutions) != 1:
        raise ValueError(f"Expected one institution for {institution_id}, found {len(institutions)}")
    if institutions[0].get("institution_type") != "parish":
        raise ValueError(f"Institution {institution_id} is not a parish")

    records = _fetch_all(
        "parishes",
        "financial_records",
        {
            "institution_id": institution_id,
            "year": year,
            "is_current_version": True,
            "deleted_at": None,
        },
    )
    record_ids = [row["id"] for row in records]
    line_items = _fetch_all("parishes", "iafr_line_items", {"financial_record_id": record_ids}) if record_ids else []
    batch_ids = sorted({row["submission_batch_id"] for row in records if row.get("submission_batch_id")})

    return {
        "diocese.institutions": institutions,
        "parishes.details": _fetch_all("parishes", "details", {"institution_id": institution_id}),
        "parishes.iafr_account_titles": _fetch_all("parishes", "iafr_account_titles"),
        "operations.submission_batches": (
            _fetch_all("operations", "submission_batches", {"id": batch_ids}) if batch_ids else []
        ),
        "parishes.financial_records": records,
        "parishes.iafr_line_items": line_items,
    }


def _extract_record(record_id: str) -> dict[str, list[dict]]:
    records = _fetch_all("parishes", "financial_records", {"id": record_id})
    if len(records) != 1:
        raise ValueError(f"Expected one financial record for {record_id}, found {len(records)}")
    record = records[0]
    institution_id = record["institution_id"]
    batch_ids = [record["submission_batch_id"]] if record.get("submission_batch_id") else []
    return {
        "diocese.institutions": _fetch_all("diocese", "institutions", {"id": institution_id}),
        "parishes.details": _fetch_all("parishes", "details", {"institution_id": institution_id}),
        "parishes.iafr_account_titles": _fetch_all("parishes", "iafr_account_titles"),
        "operations.submission_batches": (
            _fetch_all("operations", "submission_batches", {"id": batch_ids}) if batch_ids else []
        ),
        "parishes.financial_records": records,
        "parishes.iafr_line_items": _fetch_all("parishes", "iafr_line_items", {"financial_record_id": record_id}),
    }


def _catalog_needs_alignment(source_rows: list[dict]) -> bool:
    target = analytics_db.fetch_query("SELECT id::text AS id, account_code FROM parishes.iafr_account_titles")
    target_by_code = {row["account_code"]: row["id"] for row in target}
    return any(target_by_code.get(row["account_code"]) not in (None, row["id"]) for row in source_rows)


def _align_account_catalog(source_rows: list[dict]) -> None:
    if not source_rows:
        raise RuntimeError("Supabase account catalog is empty")
    if not _catalog_needs_alignment(source_rows):
        _mirror_rows("parishes", "iafr_account_titles", source_rows, "id")
        return

    with analytics_db.get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM parishes.iafr_line_items")
            line_count = cur.fetchone()[0]
            cur.execute(
                """
                SELECT
                  (SELECT count(*) FROM parish_analytics.fact_parish_financial_breakdowns) +
                  (SELECT count(*) FROM parish_analytics.fact_parish_financial_forecasts
                   WHERE iafr_account_key IS NOT NULL) +
                  (SELECT count(*) FROM parish_analytics.fact_parish_anomaly_alerts
                   WHERE iafr_account_key IS NOT NULL)
                """
            )
            account_fact_count = cur.fetchone()[0]
            if line_count or account_fact_count:
                raise RuntimeError(
                    "AWS account IDs differ from Supabase and cannot be aligned after financial data exists "
                    f"(line_items={line_count}, account_facts={account_fact_count})"
                )

            # Gold is deferred in Phases 0-2. Remove its independently seeded
            # account UUIDs before aligning the exact bronze source catalog.
            cur.execute("DELETE FROM parish_analytics.dim_iafr_account")
            cur.execute("DELETE FROM parishes.iafr_account_titles")
            columns = list(source_rows[0])
            placeholders = ", ".join(["%s"] * len(columns))
            column_sql = ", ".join(f'"{column}"' for column in columns)
            values = [
                [
                    Jsonb(row.get(column)) if isinstance(row.get(column), (dict, list)) else row.get(column)
                    for column in columns
                ]
                for row in source_rows
            ]
            cur.executemany(
                f"INSERT INTO parishes.iafr_account_titles ({column_sql}) VALUES ({placeholders})",
                values,
            )
        conn.commit()


def _decimal_sum(rows: list[dict], column: str) -> Decimal:
    return sum((Decimal(str(row.get(column) or 0)) for row in rows), Decimal("0"))


def _replace_line_items(record_id: str, rows: list[dict]) -> int:
    _set_triggers("parishes", "iafr_line_items", False)
    try:
        analytics_db.execute(
            "DELETE FROM parishes.iafr_line_items WHERE financial_record_id = %s",
            (record_id,),
        )
        return analytics_db.upsert_rows("parishes", "iafr_line_items", rows, conflict_cols="id")
    finally:
        _set_triggers("parishes", "iafr_line_items", True)


def _target_rows(table: str, institution_id: str, year: int, record_ids: list[str]) -> list[dict]:
    if table == "parishes.financial_records":
        return analytics_db.fetch_query(
            """
            SELECT * FROM parishes.financial_records
            WHERE institution_id = %s AND year = %s AND is_current_version = true AND deleted_at IS NULL
            """,
            (institution_id, year),
        )
    if table == "parishes.iafr_line_items" and record_ids:
        return analytics_db.fetch_query(
            "SELECT * FROM parishes.iafr_line_items WHERE financial_record_id = ANY(%s::uuid[])",
            (record_ids,),
        )
    return []


def _record_check(
    run_id: str,
    name: str,
    source: Any,
    target: Any,
    tolerance: Decimal | None = None,
) -> bool:
    if tolerance is None:
        passed = source == target
        difference = None if passed else "different"
    else:
        difference_decimal = Decimal(str(target)) - Decimal(str(source))
        passed = abs(difference_decimal) <= tolerance
        difference = str(difference_decimal)
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_reconciliation_results
          (run_id, check_name, source_value, target_value, difference_value, status)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (run_id, name, str(source), str(target), difference, "passed" if passed else "failed"),
    )
    return passed


def _reconcile(run_id: str, extracted: dict[str, list[dict]], institution_id: str, year: int) -> bool:
    source_records = extracted["parishes.financial_records"]
    source_lines = extracted["parishes.iafr_line_items"]
    record_ids = [row["id"] for row in source_records]
    target_records = _target_rows("parishes.financial_records", institution_id, year, record_ids)
    target_lines = _target_rows("parishes.iafr_line_items", institution_id, year, record_ids)

    checks = [
        _record_check(run_id, "financial_record_count", len(source_records), len(target_records)),
        _record_check(run_id, "line_item_count", len(source_lines), len(target_lines)),
        _record_check(
            run_id,
            "financial_record_ids",
            sorted(row["id"] for row in source_records),
            sorted(str(row["id"]) for row in target_records),
        ),
        _record_check(
            run_id,
            "line_item_ids",
            sorted(row["id"] for row in source_lines),
            sorted(str(row["id"]) for row in target_lines),
        ),
        _record_check(
            run_id,
            "line_item_amount_sum",
            _decimal_sum(source_lines, "amount"),
            _decimal_sum(target_lines, "amount"),
            Decimal("0.01"),
        ),
    ]
    for column in _FINANCIAL_AMOUNT_COLUMNS:
        checks.append(
            _record_check(
                run_id,
                f"financial_sum_{column}",
                _decimal_sum(source_records, column),
                _decimal_sum(target_records, column),
                Decimal("0.01"),
            )
        )
    return all(checks)


def _reconcile_record(run_id: str, extracted: dict[str, list[dict]], record_id: str) -> bool:
    source_record = extracted["parishes.financial_records"]
    source_lines = extracted["parishes.iafr_line_items"]
    target_record = analytics_db.fetch_query(
        "SELECT * FROM parishes.financial_records WHERE id = %s",
        (record_id,),
    )
    target_lines = analytics_db.fetch_query(
        "SELECT * FROM parishes.iafr_line_items WHERE financial_record_id = %s",
        (record_id,),
    )
    checks = [
        _record_check(run_id, "financial_record_count", len(source_record), len(target_record)),
        _record_check(run_id, "line_item_count", len(source_lines), len(target_lines)),
        _record_check(
            run_id,
            "line_item_ids",
            sorted(row["id"] for row in source_lines),
            sorted(str(row["id"]) for row in target_lines),
        ),
        _record_check(
            run_id,
            "line_item_amount_sum",
            _decimal_sum(source_lines, "amount"),
            _decimal_sum(target_lines, "amount"),
            Decimal("0.01"),
        ),
    ]
    for column in _FINANCIAL_AMOUNT_COLUMNS:
        checks.append(
            _record_check(
                run_id,
                f"financial_sum_{column}",
                _decimal_sum(source_record, column),
                _decimal_sum(target_record, column),
                Decimal("0.01"),
            )
        )
    return all(checks)


def _record_failure(run_id: str, record_id: str, error: Exception) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_failures
          (run_id, source_schema, source_table, source_id, error_code, error_message)
        VALUES (%s, 'parishes', 'financial_records', %s, %s, %s)
        """,
        (run_id, record_id, type(error).__name__, str(error)),
    )


def run_record_sync(record_id: str) -> dict[str, Any]:
    """Idempotently sync one source record and its complete bronze dependency set."""
    run_id = _start_run("incremental", {"record_id": record_id})
    counts: dict[str, Any] = {}
    loaded = 0
    try:
        extracted = _extract_record(record_id)
        counts = {table: len(rows) for table, rows in extracted.items()}
        extracted_count = sum(counts.values())
        _align_account_catalog(extracted["parishes.iafr_account_titles"])
        loaded += len(extracted["parishes.iafr_account_titles"])
        for schema, table, conflict_col in (
            ("diocese", "institutions", "id"),
            ("parishes", "details", "institution_id"),
            ("operations", "submission_batches", "id"),
            ("parishes", "financial_records", "id"),
        ):
            loaded += _mirror_rows(schema, table, extracted[f"{schema}.{table}"], conflict_col)
        loaded += _replace_line_items(record_id, extracted["parishes.iafr_line_items"])
        if not _reconcile_record(run_id, extracted, record_id):
            raise RuntimeError(f"Incremental reconciliation failed for ETL run {run_id}")
        analytics_db.execute(
            """
            UPDATE warehouse_control.etl_failures
            SET status = 'resolved', resolved_at = now()
            WHERE source_schema = 'parishes'
              AND source_table = 'financial_records'
              AND source_id = %s
              AND status = 'open'
            """,
            (record_id,),
        )
        _finish_run(run_id, "succeeded", counts, extracted=extracted_count, loaded=loaded)
        return {"run_id": run_id, "record_id": record_id, "counts": counts, "loaded": loaded}
    except Exception as exc:
        _record_failure(run_id, record_id, exc)
        _finish_run(
            run_id,
            "failed",
            counts,
            extracted=sum(counts.values()) if counts else 0,
            loaded=loaded,
            failed=1,
            error=str(exc),
        )
        raise


def run_pilot(institution_id: str, year: int, *, dry_run: bool) -> dict[str, Any]:
    mode = "dry_run" if dry_run else "pilot"
    scope = {"institution_id": institution_id, "year": year}
    run_id = _start_run(mode, scope)
    counts: dict[str, Any] = {}
    loaded = 0
    try:
        extracted = _extract_pilot(institution_id, year)
        counts = {table: len(rows) for table, rows in extracted.items()}
        extracted_count = sum(counts.values())
        if dry_run:
            _finish_run(run_id, "succeeded", counts, extracted=extracted_count, loaded=0)
            return {"run_id": run_id, "mode": mode, "counts": counts, "loaded": 0}

        _align_account_catalog(extracted["parishes.iafr_account_titles"])
        loaded += len(extracted["parishes.iafr_account_titles"])
        load_order = (
            ("diocese", "institutions", "id"),
            ("parishes", "details", "institution_id"),
            ("operations", "submission_batches", "id"),
            ("parishes", "financial_records", "id"),
            ("parishes", "iafr_line_items", "id"),
        )
        for schema, table, conflict_col in load_order:
            loaded += _mirror_rows(schema, table, extracted[f"{schema}.{table}"], conflict_col)

        reconciled = _reconcile(run_id, extracted, institution_id, year)
        if not reconciled:
            raise RuntimeError(f"Pilot reconciliation failed for ETL run {run_id}")
        _finish_run(run_id, "succeeded", counts, extracted=extracted_count, loaded=loaded)
        return {"run_id": run_id, "mode": mode, "counts": counts, "loaded": loaded}
    except Exception as exc:
        _finish_run(
            run_id,
            "failed",
            counts,
            extracted=sum(counts.values()) if counts else 0,
            loaded=loaded,
            failed=1,
            error=str(exc),
        )
        raise


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Supabase-to-AWS bronze loader")
    parser.add_argument("mode", nargs="?", choices=("minimal", "dry-run", "pilot"), default="minimal")
    parser.add_argument("--institution-id")
    parser.add_argument("--year", type=int)
    args = parser.parse_args()
    if args.mode in {"dry-run", "pilot"} and (not args.institution_id or not args.year):
        parser.error("dry-run and pilot modes require --institution-id and --year")
    return args


def main() -> None:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        if args.mode == "minimal":
            result: dict[str, Any] = run()
        else:
            result = run_pilot(args.institution_id, args.year, dry_run=args.mode == "dry-run")
        print(f"Bronze {args.mode} complete:")
        for key, value in result.items():
            print(f"  {key}: {value}")
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
