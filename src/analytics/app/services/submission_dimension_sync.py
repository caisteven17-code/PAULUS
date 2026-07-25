"""Incremental Supabase-to-AWS submission-dimension synchronization.

Populates shared_analytics.dim_submission, replacing the retired portable
migration 130's dim_submission block (excluded from the AWS deployment
manifest because it read the retired AWS operational mirror — see
docs/HYBRID_DATABASE_TARGET_ARCHITECTURE.md). education_financial_sync.py's
_submission_key() and parish_analytics.vw_parish_monthly_financial_candidates
both depend on this table being populated; until this sync runs, every Gold
fact row's submission_key is NULL.

Supabase is authoritative. Source: operations.submission_batches joined to
whichever of parishes/schools/seminaries.financial_records has a matching,
non-deleted submission_batch_id. Four independent watermarks (one for the
batch table, one per entity's financial_records table) are needed under one
pipeline name rather than a single watermark: batch verification
(validation_status) only touches the batch row, while resubmission re-linking
(submission_batch_id) only touches the financial_record row. Neither table's
updated_at alone is a complete trigger source.

A submission_batches row with no linked, non-deleted financial_record is
skipped entirely (not inserted with a NULL financial_record_id) — this
matches the retired SQL's JOIN, not LEFT JOIN, semantics, and is what every
consumer already expects (a missing dim_submission row and a row with a NULL
financial_record_id are treated identically downstream).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime
from typing import Any

from psycopg.types.json import Jsonb

from app.config import WAREHOUSE_SUBMISSION_POLL_SECONDS
from app.services import analytics_db
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

PIPELINE_NAME = "submission_dimension_incremental_v1"
BATCH_SCHEMA = "operations"
BATCH_TABLE = "submission_batches"
ENTITY_TABLES: dict[str, tuple[str, str]] = {
    "parish": ("parishes", "financial_records"),
    "school": ("schools", "financial_records"),
    "seminary": ("seminaries", "financial_records"),
}
PAGE_SIZE = 500
ZERO_UUID = "00000000-0000-0000-0000-000000000000"
EPOCH = "1970-01-01T00:00:00+00:00"

SOURCE_COLUMNS_BATCH = (
    "id,institution_type,source_file_name,submitted_by,submitted_at,"
    "verified_by,verified_at,validation_status,updated_at"
)
SOURCE_COLUMNS_RECORD = "id,submission_batch_id,version_no,is_current_version,updated_at,deleted_at"


def _timestamp_text(value: str | datetime | None) -> str:
    if value is None:
        return EPOCH
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _watermark(schema: str, table: str) -> dict[str, Any]:
    rows = analytics_db.fetch_query(
        """
        SELECT last_source_updated_at, last_source_id
        FROM warehouse_control.etl_watermarks
        WHERE pipeline_name = %s AND source_schema = %s AND source_table = %s
        """,
        (PIPELINE_NAME, schema, table),
        pool=analytics_db.get_etl_pool(),
    )
    return rows[0] if rows else {"last_source_updated_at": EPOCH, "last_source_id": ZERO_UUID}


def _set_watermark(schema: str, table: str, updated_at: str | datetime, source_id: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_watermarks
          (pipeline_name, source_schema, source_table, last_source_updated_at, last_source_id)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (pipeline_name, source_schema, source_table) DO UPDATE
        SET last_source_updated_at = EXCLUDED.last_source_updated_at,
            last_source_id = EXCLUDED.last_source_id,
            updated_at = now()
        """,
        (PIPELINE_NAME, schema, table, updated_at, source_id),
        pool=analytics_db.get_etl_pool(),
    )


def _fetch_changes(schema: str, table: str, columns: str, watermark: dict[str, Any]) -> list[dict[str, Any]]:
    updated_at = _timestamp_text(watermark.get("last_source_updated_at"))
    last_pair = (updated_at, str(watermark.get("last_source_id") or ZERO_UUID))
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        response = (
            get_table(schema, table)
            .select(columns)
            .gte("updated_at", updated_at)
            .order("updated_at")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(row for row in page if (_timestamp_text(row.get("updated_at")), str(row["id"])) > last_pair)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    rows.sort(key=lambda row: (_timestamp_text(row.get("updated_at")), str(row["id"])))
    return rows


def _current_record_for_batch(batch: dict[str, Any]) -> dict[str, Any] | None:
    """The one non-deleted financial_records row linked to this batch, if any."""
    entity = ENTITY_TABLES.get(batch.get("institution_type"))
    if entity is None:
        logger.warning("Unknown institution_type %r on batch %s", batch.get("institution_type"), batch["id"])
        return None
    schema, table = entity
    response = (
        get_table(schema, table)
        .select("id,version_no,is_current_version,updated_at")
        .eq("submission_batch_id", batch["id"])
        .is_("deleted_at", "null")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _fetch_batch(batch_id: str) -> dict[str, Any] | None:
    response = (
        get_table(BATCH_SCHEMA, BATCH_TABLE)
        .select("id,source_file_name,submitted_by,submitted_at,verified_by,verified_at,validation_status")
        .eq("id", batch_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _dimension_row(batch: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    """Allowlisted projection. status comes from the batch (validation_status),
    never the record's own status column — different concepts. version_no /
    is_current_version come from the record — the batch has no versioning."""
    return {
        "submission_batch_id": batch["id"],
        "financial_record_id": record["id"],
        "source_file_name": batch.get("source_file_name"),
        "submitted_by": batch.get("submitted_by"),
        "submitted_at": batch.get("submitted_at"),
        "verified_by": batch.get("verified_by"),
        "verified_at": batch.get("verified_at"),
        "status": batch.get("validation_status"),
        "version_no": record.get("version_no"),
        "is_current_version": bool(record.get("is_current_version", True)),
    }


def _start_run() -> str:
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, 'incremental', '{"target":"shared_analytics.dim_submission"}'::jsonb)
        RETURNING run_id
        """,
        (PIPELINE_NAME,),
        pool=analytics_db.get_etl_pool(),
    )
    if not row:
        raise RuntimeError("Failed to create submission-dimension ETL run")
    return str(row["run_id"])


def _finish_run(run_id: str, status: str, extracted: int, loaded: int, error: str | None = None) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s,
            extracted_count = %s,
            loaded_count = %s,
            failed_count = %s,
            table_counts = jsonb_build_object('shared_analytics.dim_submission', %s),
            error_summary = %s,
            finished_at = now()
        WHERE run_id = %s
        """,
        (status, extracted, loaded, 1 if error else 0, loaded, error, run_id),
        pool=analytics_db.get_etl_pool(),
    )


def _record_failure(run_id: str, source_schema: str, source_table: str, source_id: str | None, exc: Exception) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_failures
          (run_id, source_schema, source_table, source_id, error_code, error_message)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (run_id, source_schema, source_table, source_id, type(exc).__name__, str(exc)),
        pool=analytics_db.get_etl_pool(),
    )


def _record_reconciliation(run_id: str, passed: bool, details: dict[str, int]) -> None:
    # Deviates from institution_dimension_sync's template intentionally: not
    # every fetched change results in an upsert here (orphan batches, draft
    # records, and soft-deleted records are normal, expected outcomes, not
    # failures) — so "passed" tracks whether the run raised, and the skip
    # breakdown goes in details for observability instead of a
    # loaded == extracted equality check.
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_reconciliation_results
          (run_id, check_name, status, details)
        VALUES (%s, 'submission_dimension_upsert', %s, %s)
        """,
        (run_id, "passed" if passed else "failed", Jsonb(details)),
        pool=analytics_db.get_etl_pool(),
    )


def run_once() -> dict[str, Any]:
    run_id = _start_run()
    extracted = 0
    loaded = 0
    skipped = {"no_linked_record": 0, "unlinked_draft_record": 0, "soft_deleted_record": 0}
    current_schema, current_table, current_source_id = BATCH_SCHEMA, BATCH_TABLE, None
    try:
        # Phase A: batch-driven — catches verification/validation_status changes.
        batch_changes = _fetch_changes(BATCH_SCHEMA, BATCH_TABLE, SOURCE_COLUMNS_BATCH, _watermark(BATCH_SCHEMA, BATCH_TABLE))
        extracted += len(batch_changes)
        for batch in batch_changes:
            current_source_id = str(batch["id"])
            record = _current_record_for_batch(batch)
            if record is not None:
                analytics_db.upsert_row(
                    "shared_analytics", "dim_submission", _dimension_row(batch, record),
                    "submission_batch_id", pool=analytics_db.get_etl_pool(),
                )
                loaded += 1
            else:
                skipped["no_linked_record"] += 1
            _set_watermark(BATCH_SCHEMA, BATCH_TABLE, batch["updated_at"], current_source_id)

        # Phase B: entity-driven, once per entity type — catches resubmission
        # re-links (submission_batch_id changes) that don't touch the batch row.
        for schema, table in ENTITY_TABLES.values():
            current_schema, current_table = schema, table
            record_changes = _fetch_changes(schema, table, SOURCE_COLUMNS_RECORD, _watermark(schema, table))
            extracted += len(record_changes)
            for record in record_changes:
                current_source_id = str(record["id"])
                batch_id = record.get("submission_batch_id")
                if not batch_id:
                    skipped["unlinked_draft_record"] += 1
                elif record.get("deleted_at"):
                    skipped["soft_deleted_record"] += 1
                else:
                    batch = _fetch_batch(batch_id)
                    if batch is not None:
                        analytics_db.upsert_row(
                            "shared_analytics", "dim_submission", _dimension_row(batch, record),
                            "submission_batch_id", pool=analytics_db.get_etl_pool(),
                        )
                        loaded += 1
                    else:
                        skipped["no_linked_record"] += 1
                _set_watermark(schema, table, record["updated_at"], current_source_id)

        _record_reconciliation(run_id, passed=True, details=skipped)
        _finish_run(run_id, "succeeded", extracted, loaded)
        return {"run_id": run_id, "extracted": extracted, "loaded": loaded, "skipped": skipped}
    except Exception as exc:
        logger.exception("Submission dimension synchronization failed")
        _record_failure(run_id, current_schema, current_table, current_source_id, exc)
        _record_reconciliation(run_id, passed=False, details=skipped)
        _finish_run(run_id, "failed", extracted, loaded, str(exc))
        raise


async def run_forever(stop_event: asyncio.Event) -> None:
    logger.info("Starting submission dimension worker, poll=%ds", WAREHOUSE_SUBMISSION_POLL_SECONDS)
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            logger.exception("Submission dimension poll failed; watermark was not advanced past the failure")
            analytics_db.discard_etl_pool()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=WAREHOUSE_SUBMISSION_POLL_SECONDS)
        except TimeoutError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize the AWS submission dimension")
    parser.add_argument("--once", action="store_true", help="Run one incremental batch")
    parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        print(run_once())
    finally:
        analytics_db.close_etl_pool()


if __name__ == "__main__":
    main()
