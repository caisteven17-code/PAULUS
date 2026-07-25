"""Resumable full-history Supabase-to-AWS-silver backfill."""

from __future__ import annotations

import argparse
import hashlib
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb

from app.services import analytics_db
from app.services.silver_etl import (
    _build_line_rows,
    _build_record_row,
    _record_check,
    _resolve_institution_keys,
    _upsert_rows,
)
from app.services.warehouse_etl import _fetch_all

_BACKFILL_NAME = "parish_finance_direct_v1"
_PIPELINE_NAME = "parish_silver_backfill"
_PILOT_INSTITUTION_ID = "aec32176-c296-4928-880f-180985f9a376"
_MONTH_NUMBERS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


def _digest(values: list[str]) -> str:
    return hashlib.sha256("\n".join(sorted(values)).encode()).hexdigest()


def fetch_source_contract() -> tuple[list[dict], dict[str, dict]]:
    records = _fetch_all(
        "parishes",
        "financial_records",
        {"is_current_version": True, "deleted_at": None},
        order_by="id",
    )
    records = list({str(row["id"]): row for row in records}.values())
    accounts = {str(row["id"]): row for row in _fetch_all("parishes", "iafr_account_titles", order_by="id")}
    records.sort(
        key=lambda row: (
            str(row["institution_id"]),
            int(row["year"]),
            _MONTH_NUMBERS[row["month"]],
            str(row["id"]),
        )
    )
    return records, accounts


def fetch_source_lines(record_ids: list[str], *, chunk_size: int = 50) -> list[dict]:
    rows: list[dict] = []
    for offset in range(0, len(record_ids), chunk_size):
        rows.extend(
            _fetch_all(
                "parishes",
                "iafr_line_items",
                {
                    "financial_record_id": record_ids[offset : offset + chunk_size],
                    "deleted_at": None,
                },
                order_by="id",
            )
        )
    return list({str(row["id"]): row for row in rows}.values())


def queue_records(records: list[dict], backfill_name: str = _BACKFILL_NAME) -> None:
    sql = """
        INSERT INTO warehouse_control.etl_backfill_items (
          backfill_name, source_record_id, institution_id, source_updated_at
        ) VALUES (%s, %s, %s, %s)
        ON CONFLICT (backfill_name, source_record_id) DO UPDATE SET
          institution_id = EXCLUDED.institution_id,
          status = CASE
            WHEN warehouse_control.etl_backfill_items.source_updated_at
                 IS DISTINCT FROM EXCLUDED.source_updated_at THEN 'pending'
            ELSE warehouse_control.etl_backfill_items.status
          END,
          attempts = CASE
            WHEN warehouse_control.etl_backfill_items.source_updated_at
                 IS DISTINCT FROM EXCLUDED.source_updated_at THEN 0
            ELSE warehouse_control.etl_backfill_items.attempts
          END,
          error_message = CASE
            WHEN warehouse_control.etl_backfill_items.source_updated_at
                 IS DISTINCT FROM EXCLUDED.source_updated_at THEN NULL
            ELSE warehouse_control.etl_backfill_items.error_message
          END,
          completed_at = CASE
            WHEN warehouse_control.etl_backfill_items.source_updated_at
                 IS DISTINCT FROM EXCLUDED.source_updated_at THEN NULL
            ELSE warehouse_control.etl_backfill_items.completed_at
          END,
          source_updated_at = EXCLUDED.source_updated_at,
          updated_at = now()
    """
    with analytics_db.get_pool().connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                sql,
                [
                    (
                        backfill_name,
                        record["id"],
                        record["institution_id"],
                        record["updated_at"],
                    )
                    for record in records
                ],
            )
        conn.commit()


def populate_coverage(records: list[dict]) -> dict[str, int]:
    parishes = sorted({str(row["institution_id"]) for row in records})
    institution_keys = _resolve_institution_keys(parishes)
    years = range(min(int(row["year"]) for row in records), max(int(row["year"]) for row in records) + 1)
    actual = {(str(row["institution_id"]), int(row["year"]), _MONTH_NUMBERS[row["month"]]): row for row in records}
    now = datetime.now(timezone.utc)
    coverage_rows = []
    counts: Counter[str] = Counter()
    for institution_id in parishes:
        for year in years:
            for month in range(1, 13):
                source = actual.get((institution_id, year, month))
                reporting_month = datetime(year, month, 1).date()
                if source:
                    row = (
                        institution_id,
                        institution_keys[institution_id],
                        reporting_month,
                        "available",
                        source["id"],
                        source["updated_at"],
                        None,
                        None,
                        None,
                    )
                    counts["available"] += 1
                elif year == 2023:
                    row = (
                        institution_id,
                        institution_keys[institution_id],
                        reporting_month,
                        "confirmed_unavailable",
                        None,
                        None,
                        "Historical IAFR source file unavailable",
                        "User confirmation",
                        now,
                    )
                    counts["confirmed_unavailable"] += 1
                else:
                    row = (
                        institution_id,
                        institution_keys[institution_id],
                        reporting_month,
                        "unreviewed_missing",
                        None,
                        None,
                        None,
                        None,
                        None,
                    )
                    counts["unreviewed_missing"] += 1
                coverage_rows.append(row)

    with analytics_db.get_pool().connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO parish_silver.reporting_coverage (
                  institution_id, institution_key, reporting_month, availability_status,
                  source_record_id, source_updated_at, missing_reason,
                  confirmation_source, confirmed_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (institution_id, reporting_month) DO UPDATE SET
                  institution_key = EXCLUDED.institution_key,
                  availability_status = EXCLUDED.availability_status,
                  source_record_id = EXCLUDED.source_record_id,
                  source_updated_at = EXCLUDED.source_updated_at,
                  missing_reason = EXCLUDED.missing_reason,
                  confirmation_source = EXCLUDED.confirmation_source,
                  confirmed_at = EXCLUDED.confirmed_at,
                  assessed_at = now()
                """,
                coverage_rows,
            )
        conn.commit()
    return dict(counts)


def validation_cohort(records: list[dict]) -> list[str]:
    record_counts = Counter(str(row["institution_id"]) for row in records)
    incomplete = sorted(institution_id for institution_id, count in record_counts.items() if count < 60)
    complete = sorted(
        institution_id
        for institution_id, count in record_counts.items()
        if count == 60 and institution_id != _PILOT_INSTITUTION_ID
    )
    cohort = [_PILOT_INSTITUTION_ID, *incomplete[:2], *complete[:2]]
    return list(dict.fromkeys(cohort))


def _start_run(record_ids: list[str], backfill_name: str) -> str:
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, 'backfill', %s)
        RETURNING run_id
        """,
        (
            _PIPELINE_NAME,
            Jsonb(
                {
                    "backfill_name": backfill_name,
                    "batch_size": len(record_ids),
                    "first_record_id": record_ids[0],
                    "last_record_id": record_ids[-1],
                }
            ),
        ),
    )
    if not row:
        raise RuntimeError("Failed to create silver backfill run")
    return str(row["run_id"])


def _mark_running(record_ids: list[str], run_id: str, backfill_name: str) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_backfill_items
        SET status = 'running', attempts = attempts + 1, last_run_id = %s,
            started_at = now(), updated_at = now(), error_message = NULL
        WHERE backfill_name = %s AND source_record_id = ANY(%s::uuid[])
        """,
        (run_id, backfill_name, record_ids),
    )


def _finish_batch_run(
    run_id: str,
    status: str,
    source_records: int,
    source_lines: int,
    error: str | None = None,
) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s, extracted_count = %s, loaded_count = %s,
            failed_count = %s, table_counts = %s, error_summary = %s,
            finished_at = now()
        WHERE run_id = %s
        """,
        (
            status,
            source_records + source_lines,
            source_records + source_lines if status == "succeeded" else 0,
            0 if status == "succeeded" else source_records,
            Jsonb({"source_records": source_records, "source_lines": source_lines}),
            error,
            run_id,
        ),
    )


def process_batch(
    records: list[dict],
    accounts: dict[str, dict],
    *,
    backfill_name: str = _BACKFILL_NAME,
) -> dict[str, Any]:
    record_ids = [str(record["id"]) for record in records]
    run_id = _start_run(record_ids, backfill_name)
    _mark_running(record_ids, run_id, backfill_name)
    try:
        institution_keys = _resolve_institution_keys([str(record["institution_id"]) for record in records])
        source_lines = fetch_source_lines(record_ids)
        lines_by_record: dict[str, list[dict]] = defaultdict(list)
        for line in source_lines:
            lines_by_record[str(line["financial_record_id"])].append(line)

        record_rows = []
        line_rows = []
        for record in records:
            cleaned_lines = _build_line_rows(
                record,
                lines_by_record[str(record["id"])],
                accounts,
                run_id,
                institution_keys[str(record["institution_id"])],
            )
            line_rows.extend(cleaned_lines)
            record_rows.append(
                _build_record_row(
                    record,
                    cleaned_lines,
                    run_id,
                    institution_keys[str(record["institution_id"])],
                )
            )

        with analytics_db.get_pool().connection() as conn:
            with conn.cursor() as cursor:
                cursor.executemany(
                    """
                    DELETE FROM parish_silver.financial_records
                    WHERE institution_key = %s AND reporting_month = %s
                      AND source_record_id <> %s
                    """,
                    [
                        (
                            row["institution_key"],
                            row["reporting_month"],
                            row["source_record_id"],
                        )
                        for row in record_rows
                    ],
                )
                _upsert_rows(cursor, "financial_records", record_rows, "source_record_id")
                cursor.execute(
                    "DELETE FROM parish_silver.financial_line_items WHERE source_record_id = ANY(%s::uuid[])",
                    (record_ids,),
                )
                _upsert_rows(cursor, "financial_line_items", line_rows, "source_line_item_id")
            conn.commit()

        target_records = analytics_db.fetch_query(
            """
            SELECT source_record_id::text AS id
            FROM parish_silver.financial_records
            WHERE source_record_id = ANY(%s::uuid[])
            """,
            (record_ids,),
        )
        target_lines = analytics_db.fetch_query(
            """
            SELECT source_line_item_id::text AS id, amount
            FROM parish_silver.financial_line_items
            WHERE source_record_id = ANY(%s::uuid[])
            """,
            (record_ids,),
        )
        source_line_ids = [str(row["id"]) for row in source_lines]
        target_record_ids = [row["id"] for row in target_records]
        target_line_ids = [row["id"] for row in target_lines]
        source_amount = sum((Decimal(str(row.get("amount") or 0)) for row in source_lines), Decimal("0"))
        target_amount = sum((Decimal(str(row["amount"])) for row in target_lines), Decimal("0"))
        checks = [
            _record_check(run_id, "backfill_record_count", len(record_ids), len(target_record_ids)),
            _record_check(run_id, "backfill_record_id_hash", _digest(record_ids), _digest(target_record_ids)),
            _record_check(run_id, "backfill_line_count", len(source_line_ids), len(target_line_ids)),
            _record_check(run_id, "backfill_line_id_hash", _digest(source_line_ids), _digest(target_line_ids)),
            _record_check(run_id, "backfill_line_amount_sum", source_amount, target_amount),
        ]
        if not all(checks):
            raise RuntimeError(f"Backfill reconciliation failed for run {run_id}")

        analytics_db.execute(
            """
            UPDATE warehouse_control.etl_backfill_items
            SET status = 'succeeded', completed_at = now(), updated_at = now(),
                error_message = NULL
            WHERE backfill_name = %s AND source_record_id = ANY(%s::uuid[])
            """,
            (backfill_name, record_ids),
        )
        _finish_batch_run(run_id, "succeeded", len(records), len(source_lines))
        return {
            "run_id": run_id,
            "records": len(records),
            "lines": len(source_lines),
            "amount": str(source_amount),
        }
    except Exception as exc:
        analytics_db.execute(
            """
            UPDATE warehouse_control.etl_backfill_items
            SET status = 'failed', error_message = %s, updated_at = now()
            WHERE backfill_name = %s AND source_record_id = ANY(%s::uuid[])
            """,
            (str(exc), backfill_name, record_ids),
        )
        _finish_batch_run(run_id, "failed", len(records), 0, str(exc))
        raise


def run_backfill(
    records: list[dict],
    accounts: dict[str, dict],
    *,
    institution_ids: list[str] | None = None,
    batch_size: int = 100,
    max_batches: int | None = None,
    backfill_name: str = _BACKFILL_NAME,
) -> list[dict[str, Any]]:
    source_by_id = {str(record["id"]): record for record in records}
    params: list[Any] = [backfill_name]
    filters = ["backfill_name = %s", "status IN ('pending', 'failed')", "attempts < 3"]
    if institution_ids:
        filters.append("institution_id = ANY(%s::uuid[])")
        params.append(institution_ids)
    work = analytics_db.fetch_query(
        f"""
        SELECT source_record_id::text AS id
        FROM warehouse_control.etl_backfill_items
        WHERE {" AND ".join(filters)}
        ORDER BY institution_id, source_record_id
        """,
        tuple(params),
    )
    work_records = [source_by_id[row["id"]] for row in work if row["id"] in source_by_id]
    results = []
    for batch_number, offset in enumerate(range(0, len(work_records), batch_size), start=1):
        if max_batches is not None and batch_number > max_batches:
            break
        results.append(
            process_batch(
                work_records[offset : offset + batch_size],
                accounts,
                backfill_name=backfill_name,
            )
        )
    return results


def summary(backfill_name: str = _BACKFILL_NAME) -> dict[str, Any]:
    rows = analytics_db.fetch_query(
        """
        SELECT status, count(*) AS rows, COALESCE(sum(attempts), 0) AS attempts
        FROM warehouse_control.etl_backfill_items
        WHERE backfill_name = %s GROUP BY status ORDER BY status
        """,
        (backfill_name,),
    )
    return {row["status"]: {"rows": int(row["rows"]), "attempts": int(row["attempts"])} for row in rows}


def main() -> None:
    parser = argparse.ArgumentParser(description="Resumable direct parish silver backfill")
    parser.add_argument("mode", choices=("plan", "validation", "full", "status"))
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--max-batches", type=int)
    parser.add_argument("--backfill-name", default=_BACKFILL_NAME)
    args = parser.parse_args()
    try:
        if args.mode == "status":
            print(summary(args.backfill_name))
            return
        records, accounts = fetch_source_contract()
        queue_records(records, args.backfill_name)
        coverage = populate_coverage(records)
        cohort = validation_cohort(records)
        if args.mode == "plan":
            print(
                {
                    "source_records": len(records),
                    "source_parishes": len({row["institution_id"] for row in records}),
                    "coverage": coverage,
                    "validation_cohort": cohort,
                    "queue": summary(args.backfill_name),
                }
            )
            return
        institution_ids = cohort if args.mode == "validation" else None
        results = run_backfill(
            records,
            accounts,
            institution_ids=institution_ids,
            batch_size=max(1, args.batch_size),
            max_batches=args.max_batches,
            backfill_name=args.backfill_name,
        )
        print({"batches": results, "queue": summary(args.backfill_name)})
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
