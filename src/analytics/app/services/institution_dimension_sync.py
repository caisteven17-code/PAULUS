"""Incremental Supabase-to-AWS institution-dimension synchronization.

Supabase is authoritative. The AWS dimension is a minimal, idempotently
rebuildable analytical projection and does not require a local operational
``diocese.institutions`` row.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.config import WAREHOUSE_INSTITUTION_POLL_SECONDS
from app.services import analytics_db
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

PIPELINE_NAME = "institution_dimension_incremental_v1"
SOURCE_SCHEMA = "diocese"
SOURCE_TABLE = "institutions"
PAGE_SIZE = 500
ZERO_UUID = "00000000-0000-0000-0000-000000000000"
EPOCH = "1970-01-01T00:00:00+00:00"

SOURCE_COLUMNS = (
    "id,name,institution_code,institution_type,vicariate,district,cluster,class,"
    "subsidy_type,latitude,longitude,is_active,updated_at,deleted_at"
)


def _timestamp_text(value: str | datetime | None) -> str:
    if value is None:
        return EPOCH
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _watermark() -> dict[str, Any]:
    rows = analytics_db.fetch_query(
        """
        SELECT last_source_updated_at, last_source_id
        FROM warehouse_control.etl_watermarks
        WHERE pipeline_name = %s
          AND source_schema = %s
          AND source_table = %s
        """,
        (PIPELINE_NAME, SOURCE_SCHEMA, SOURCE_TABLE),
        pool=analytics_db.get_etl_pool(),
    )
    return (
        rows[0]
        if rows
        else {
            "last_source_updated_at": EPOCH,
            "last_source_id": ZERO_UUID,
        }
    )


def _set_watermark(updated_at: str | datetime, source_id: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_watermarks
          (pipeline_name, source_schema, source_table,
           last_source_updated_at, last_source_id)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (pipeline_name, source_schema, source_table) DO UPDATE
        SET last_source_updated_at = EXCLUDED.last_source_updated_at,
            last_source_id = EXCLUDED.last_source_id,
            updated_at = now()
        """,
        (PIPELINE_NAME, SOURCE_SCHEMA, SOURCE_TABLE, updated_at, source_id),
        pool=analytics_db.get_etl_pool(),
    )


def _fetch_changes(watermark: dict[str, Any]) -> list[dict[str, Any]]:
    updated_at = _timestamp_text(watermark.get("last_source_updated_at"))
    last_pair = (updated_at, str(watermark.get("last_source_id") or ZERO_UUID))
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        response = (
            get_table(SOURCE_SCHEMA, SOURCE_TABLE)
            .select(SOURCE_COLUMNS)
            .gte("updated_at", updated_at)
            .order("updated_at")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(row for row in batch if (_timestamp_text(row.get("updated_at")), str(row["id"])) > last_pair)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    rows.sort(key=lambda row: (_timestamp_text(row.get("updated_at")), str(row["id"])))
    return rows


def _dimension_row(source: dict[str, Any]) -> dict[str, Any]:
    """Allowlist the analytical projection; private operational fields never pass through."""
    deleted_at = source.get("deleted_at")
    return {
        "institution_id": source["id"],
        "institution_code": source.get("institution_code"),
        "institution_name": source["name"],
        "institution_type": source["institution_type"],
        "vicariate": source.get("vicariate"),
        "district": source.get("district"),
        "cluster": source.get("cluster"),
        "class": source.get("class"),
        "subsidy_type": source.get("subsidy_type"),
        "latitude": source.get("latitude"),
        "longitude": source.get("longitude"),
        "is_active": bool(source.get("is_active", True)) and deleted_at is None,
        "source_updated_at": source.get("updated_at"),
        "source_deleted_at": deleted_at,
        "warehouse_updated_at": datetime.now(timezone.utc),
    }


def _start_run() -> str:
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, 'incremental', '{"target":"shared_analytics.dim_institutions"}'::jsonb)
        RETURNING run_id
        """,
        (PIPELINE_NAME,),
        pool=analytics_db.get_etl_pool(),
    )
    if not row:
        raise RuntimeError("Failed to create institution-dimension ETL run")
    return str(row["run_id"])


def _finish_run(run_id: str, status: str, extracted: int, loaded: int, error: str | None = None) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s,
            extracted_count = %s,
            loaded_count = %s,
            failed_count = %s,
            table_counts = jsonb_build_object('shared_analytics.dim_institutions', %s),
            error_summary = %s,
            finished_at = now()
        WHERE run_id = %s
        """,
        (status, extracted, loaded, 1 if error else 0, loaded, error, run_id),
        pool=analytics_db.get_etl_pool(),
    )


def _record_failure(run_id: str, source_id: str | None, exc: Exception) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_failures
          (run_id, source_schema, source_table, source_id, error_code, error_message)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (run_id, SOURCE_SCHEMA, SOURCE_TABLE, source_id, type(exc).__name__, str(exc)),
        pool=analytics_db.get_etl_pool(),
    )


def _record_reconciliation(run_id: str, passed: bool) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_reconciliation_results
          (run_id, check_name, status, details)
        VALUES (%s, 'institution_dimension_upsert', %s, '{"values_exposed":false}'::jsonb)
        """,
        (run_id, "passed" if passed else "failed"),
        pool=analytics_db.get_etl_pool(),
    )


def run_once() -> dict[str, Any]:
    run_id = _start_run()
    changes: list[dict[str, Any]] = []
    loaded = 0
    current_id: str | None = None
    try:
        changes = _fetch_changes(_watermark())
        for source in changes:
            current_id = str(source["id"])
            analytics_db.upsert_row(
                "shared_analytics",
                "dim_institutions",
                _dimension_row(source),
                "institution_id",
                pool=analytics_db.get_etl_pool(),
            )
            loaded += 1
            _set_watermark(source["updated_at"], current_id)

        _record_reconciliation(run_id, passed=loaded == len(changes))
        _finish_run(run_id, "succeeded", len(changes), loaded)
        return {"run_id": run_id, "extracted": len(changes), "loaded": loaded}
    except Exception as exc:
        logger.exception("Institution dimension synchronization failed")
        _record_failure(run_id, current_id, exc)
        _record_reconciliation(run_id, passed=False)
        _finish_run(run_id, "failed", len(changes), loaded, str(exc))
        raise


async def run_forever(stop_event: asyncio.Event) -> None:
    logger.info("Starting institution dimension worker, poll=%ds", WAREHOUSE_INSTITUTION_POLL_SECONDS)
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            logger.exception("Institution dimension poll failed; watermark was not advanced past the failure")
            analytics_db.discard_etl_pool()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=WAREHOUSE_INSTITUTION_POLL_SECONDS)
        except TimeoutError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize the AWS institution dimension")
    parser.add_argument("--once", action="store_true", help="Run one incremental batch")
    parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        print(run_once())
    finally:
        analytics_db.close_etl_pool()


if __name__ == "__main__":
    main()
