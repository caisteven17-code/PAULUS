"""Direct Supabase-to-AWS-silver parish finance transformation."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb

from app.services import analytics_db
from app.services.supabase_client import get_table

_PIPELINE_NAME = "parish_silver_direct"
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
_AMOUNT_COLUMNS = (
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


def _clean_text(value: Any, *, case: str | None = None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if case == "lower":
        return cleaned.lower()
    if case == "upper":
        return cleaned.upper()
    return cleaned


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _fetch_source(record_id: str) -> tuple[dict[str, Any] | None, list[dict], dict[str, dict]]:
    record_response = get_table("parishes", "financial_records").select("*").eq("id", record_id).limit(1).execute()
    record = (record_response.data or [None])[0]
    if not record:
        return None, [], {}
    lines_response = (
        get_table("parishes", "iafr_line_items")
        .select("*")
        .eq("financial_record_id", record_id)
        .is_("deleted_at", "null")
        .execute()
    )
    accounts_response = get_table("parishes", "iafr_account_titles").select("*").execute()
    accounts = {str(row["id"]): row for row in (accounts_response.data or [])}
    return record, lines_response.data or [], accounts


def _record_check(run_id: str, name: str, source: Any, target: Any) -> bool:
    passed = source == target
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_reconciliation_results
          (run_id, check_name, source_value, target_value, difference_value, status)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (run_id, name, str(source), str(target), None if passed else "different", "passed" if passed else "failed"),
    )
    return passed


def _finish_run(run_id: str, status: str, counts: dict[str, Any], error: str | None = None) -> None:
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
        (
            status,
            counts.get("source_records", 0) + counts.get("source_lines", 0),
            counts.get("silver_records", 0) + counts.get("silver_lines", 0),
            1 if status == "failed" else 0,
            Jsonb(counts),
            error,
            run_id,
        ),
    )


def _record_failure(run_id: str, record_id: str, error: Exception) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_failures
          (run_id, source_schema, source_table, source_id, error_code, error_message)
        VALUES (%s, 'parish_silver_direct', 'financial_records', %s, %s, %s)
        """,
        (run_id, record_id, type(error).__name__, str(error)),
    )


def _upsert_rows(cursor, table: str, rows: list[dict], conflict_column: str) -> None:
    if not rows:
        return
    columns = list(rows[0])
    column_sql = ", ".join(f'"{column}"' for column in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ", ".join(f'"{column}" = EXCLUDED."{column}"' for column in columns if column != conflict_column)
    cursor.executemany(
        f"""INSERT INTO parish_silver.{table} ({column_sql})
            VALUES ({placeholders})
            ON CONFLICT ("{conflict_column}") DO UPDATE SET {updates}""",
        [[row[column] for column in columns] for row in rows],
    )


def _build_line_rows(record: dict[str, Any], lines: list[dict], accounts: dict[str, dict], run_id: str) -> list[dict]:
    month_number = _MONTH_NUMBERS[record["month"]]
    reporting_month = datetime(int(record["year"]), month_number, 1).date()
    transformed_at = datetime.now(timezone.utc)
    rows = []
    for line in lines:
        account = accounts.get(str(line.get("account_title_id")))
        flags = []
        if not account:
            flags.append("UNMAPPED_ACCOUNT")
        if _decimal(line.get("amount")) < 0:
            flags.append("NEGATIVE_AMOUNT")
        if account and line.get("section_code") != account.get("section_code"):
            flags.append("SECTION_MISMATCH")
        if account and line.get("item_type") != account.get("account_type"):
            flags.append("ACCOUNT_TYPE_MISMATCH")
        if account and (not account.get("is_active") or account.get("deleted_at") is not None):
            flags.append("INACTIVE_ACCOUNT")
        quality_status = "failed" if "UNMAPPED_ACCOUNT" in flags else "warning" if flags else "passed"
        rows.append(
            {
                "source_line_item_id": line["id"],
                "source_record_id": record["id"],
                "institution_id": record["institution_id"],
                "reporting_month": reporting_month,
                "source_account_title_id": line.get("account_title_id"),
                "account_code": _clean_text(account.get("account_code")) if account else None,
                "account_name": _clean_text(account.get("account_name")) if account else None,
                "section_code": account.get("section_code") if account else line["section_code"],
                "subsection_code": _clean_text(
                    account.get("subsection_code") if account else line.get("subsection_code")
                ),
                "account_type": account.get("account_type") if account else line["item_type"],
                "classification": _clean_text(account.get("classification")) if account else None,
                "amount": _decimal(line.get("amount")),
                "tax_rate": None if line.get("tax_rate") is None else _decimal(line["tax_rate"]),
                "is_remittable": bool(line.get("is_remittable")),
                "event_date": line.get("event_date"),
                "item_code": _clean_text(line.get("item_code")),
                "item_label": _clean_text(line.get("item_label")) or "Unknown",
                "notes": _clean_text(line.get("notes")),
                "source_row_number": line.get("source_row_number"),
                "source_label": _clean_text(line.get("source_label")),
                "quality_status": quality_status,
                "quality_flags": flags,
                "source_created_at": line["created_at"],
                "source_updated_at": line["updated_at"],
                "transformed_at": transformed_at,
                "etl_run_id": run_id,
            }
        )
    return rows


def _build_record_row(record: dict[str, Any], line_rows: list[dict], run_id: str) -> dict:
    flags = []
    if record.get("submission_batch_id") is None:
        flags.append("MISSING_SUBMISSION_BATCH")
    if _clean_text(record.get("prepared_by")) is None:
        flags.append("MISSING_PREPARED_BY")
    if _clean_text(record.get("certified_by")) is None:
        flags.append("MISSING_CERTIFIED_BY")
    if _clean_text(record.get("validation_status")) is None:
        flags.append("MISSING_VALIDATION_STATUS")
    if _clean_text(record.get("validation_status"), case="lower") == "failed":
        flags.append("SOURCE_VALIDATION_FAILED")
    if _clean_text(record.get("status"), case="lower") == "draft":
        flags.append("DRAFT_RECORD")
    if not line_rows:
        flags.append("NO_LINE_ITEMS")
    if any(row["quality_status"] == "failed" for row in line_rows):
        flags.append("FAILED_LINE_ITEMS")
    if any(row["quality_status"] == "warning" for row in line_rows):
        flags.append("WARNING_LINE_ITEMS")
    quality_status = (
        "failed"
        if "SOURCE_VALIDATION_FAILED" in flags or "FAILED_LINE_ITEMS" in flags
        else "warning"
        if flags
        else "passed"
    )
    month_number = _MONTH_NUMBERS[record["month"]]
    row = {
        "source_record_id": record["id"],
        "institution_id": record["institution_id"],
        "submission_batch_id": record.get("submission_batch_id"),
        "reporting_month": datetime(int(record["year"]), month_number, 1).date(),
        "reporting_year": int(record["year"]),
        "reporting_month_number": month_number,
        "institution_class": _clean_text(record.get("institution_class"), case="upper"),
        "record_status": _clean_text(record.get("status"), case="lower") or "unknown",
        "prepared_by": _clean_text(record.get("prepared_by")),
        "certified_by": _clean_text(record.get("certified_by")),
        "submitted_at": record.get("submitted_at"),
        "record_timestamp": record.get("record_timestamp"),
        "source_version_no": int(record.get("version_no") or 1),
        "source_validation_status": _clean_text(record.get("validation_status"), case="lower"),
        "line_item_count": len(line_rows),
        "line_item_amount_total": sum((row["amount"] for row in line_rows), Decimal("0")),
        "quality_status": quality_status,
        "quality_flags": flags,
        "source_created_at": record["created_at"],
        "source_updated_at": record["updated_at"],
        "transformed_at": datetime.now(timezone.utc),
        "etl_run_id": run_id,
    }
    row.update({column: _decimal(record.get(column)) for column in _AMOUNT_COLUMNS})
    return row


def _load_snapshot(record: dict[str, Any], record_row: dict, line_rows: list[dict]) -> None:
    with analytics_db.get_pool().connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM parish_silver.financial_records
                WHERE institution_id = %s
                  AND reporting_month = %s
                  AND source_record_id <> %s
                """,
                (record_row["institution_id"], record_row["reporting_month"], record["id"]),
            )
            _upsert_rows(cursor, "financial_records", [record_row], "source_record_id")
            cursor.execute(
                "DELETE FROM parish_silver.financial_line_items WHERE source_record_id = %s",
                (record["id"],),
            )
            _upsert_rows(cursor, "financial_line_items", line_rows, "source_line_item_id")
        conn.commit()


def _update_reporting_coverage(record: dict[str, Any], active: bool) -> None:
    reporting_month = datetime(
        int(record["year"]),
        _MONTH_NUMBERS[record["month"]],
        1,
    ).date()
    if active:
        analytics_db.execute(
            """
            INSERT INTO parish_silver.reporting_coverage (
              institution_id, reporting_month, availability_status,
              source_record_id, source_updated_at
            ) VALUES (%s, %s, 'available', %s, %s)
            ON CONFLICT (institution_id, reporting_month) DO UPDATE SET
              availability_status = 'available',
              source_record_id = EXCLUDED.source_record_id,
              source_updated_at = EXCLUDED.source_updated_at,
              missing_reason = NULL,
              confirmation_source = NULL,
              confirmed_at = NULL,
              assessed_at = now()
            """,
            (
                record["institution_id"],
                reporting_month,
                record["id"],
                record["updated_at"],
            ),
        )
        return

    replacements = (
        get_table("parishes", "financial_records")
        .select("id")
        .eq("institution_id", record["institution_id"])
        .eq("year", record["year"])
        .eq("month", record["month"])
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if replacements.data:
        return
    analytics_db.execute(
        """
        INSERT INTO parish_silver.reporting_coverage (
          institution_id, reporting_month, availability_status
        ) VALUES (%s, %s, 'unreviewed_missing')
        ON CONFLICT (institution_id, reporting_month) DO UPDATE SET
          availability_status = 'unreviewed_missing',
          source_record_id = NULL,
          source_updated_at = NULL,
          missing_reason = NULL,
          confirmation_source = NULL,
          confirmed_at = NULL,
          assessed_at = now()
        """,
        (record["institution_id"], reporting_month),
    )


def run_silver_record(record_id: str) -> dict[str, Any]:
    """Idempotently transform one Supabase source snapshot directly to AWS silver."""
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, 'incremental', %s)
        RETURNING run_id
        """,
        (_PIPELINE_NAME, Jsonb({"record_id": record_id})),
    )
    if not row:
        raise RuntimeError("Failed to create direct silver ETL run")
    run_id = str(row["run_id"])
    counts: dict[str, Any] = {}
    try:
        record, lines, accounts = _fetch_source(record_id)
        active = bool(record and record.get("is_current_version") and record.get("deleted_at") is None)
        if not active:
            analytics_db.execute(
                "DELETE FROM parish_silver.financial_records WHERE source_record_id = %s",
                (record_id,),
            )
            lines = []
            quality_status = "passed"
        else:
            line_rows = _build_line_rows(record, lines, accounts, run_id)
            record_row = _build_record_row(record, line_rows, run_id)
            _load_snapshot(record, record_row, line_rows)
            quality_status = record_row["quality_status"]
        if record:
            _update_reporting_coverage(record, active)

        target = analytics_db.fetch_query(
            """
            SELECT
              count(*) AS record_count,
              COALESCE((SELECT count(*) FROM parish_silver.financial_line_items
                        WHERE source_record_id = %s), 0) AS line_count,
              COALESCE((SELECT sum(amount) FROM parish_silver.financial_line_items
                        WHERE source_record_id = %s), 0) AS amount_total,
              COALESCE((SELECT array_agg(source_line_item_id::text ORDER BY source_line_item_id)
                        FROM parish_silver.financial_line_items
                        WHERE source_record_id = %s), ARRAY[]::text[]) AS line_ids
            FROM parish_silver.financial_records
            WHERE source_record_id = %s
            """,
            (record_id, record_id, record_id, record_id),
        )[0]
        source_record_count = 1 if active else 0
        source_line_ids = sorted(str(line["id"]) for line in lines) if active else []
        source_amount = sum((_decimal(line.get("amount")) for line in lines), Decimal("0")) if active else Decimal("0")
        checks = [
            _record_check(run_id, "direct_silver_record_count", source_record_count, target["record_count"]),
            _record_check(run_id, "direct_silver_line_count", len(source_line_ids), target["line_count"]),
            _record_check(run_id, "direct_silver_line_ids", source_line_ids, target["line_ids"]),
            _record_check(
                run_id,
                "direct_silver_line_amount_sum",
                source_amount,
                Decimal(str(target["amount_total"])),
            ),
        ]
        if not all(checks):
            raise RuntimeError(f"Direct silver reconciliation failed for ETL run {run_id}")
        counts = {
            "source_records": source_record_count,
            "source_lines": len(source_line_ids),
            "silver_records": int(target["record_count"]),
            "silver_lines": int(target["line_count"]),
        }
        analytics_db.execute(
            """
            UPDATE warehouse_control.etl_failures
            SET status = 'resolved', resolved_at = now()
            WHERE source_schema = 'parish_silver_direct'
              AND source_table = 'financial_records'
              AND source_id = %s
              AND status = 'open'
            """,
            (record_id,),
        )
        _finish_run(run_id, "succeeded", counts)
        return {
            "run_id": run_id,
            "record_id": record_id,
            "quality_status": quality_status,
            "counts": counts,
        }
    except Exception as exc:
        _record_failure(run_id, record_id, exc)
        _finish_run(run_id, "failed", counts, str(exc))
        raise


def run_silver_institution(institution_id: str) -> list[dict[str, Any]]:
    """Refresh every current Supabase record for one parish directly to silver."""
    response = (
        get_table("parishes", "financial_records")
        .select("id, year, month")
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .execute()
    )
    rows = sorted(response.data or [], key=lambda item: (int(item["year"]), _MONTH_NUMBERS[item["month"]], item["id"]))
    return [run_silver_record(row["id"]) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description="Direct Supabase-to-AWS-silver transformer")
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--record-id")
    scope.add_argument("--institution-id")
    args = parser.parse_args()
    try:
        result = run_silver_record(args.record_id) if args.record_id else run_silver_institution(args.institution_id)
        print(result)
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
