"""Pilot-only polling worker for automatic Supabase-to-AWS bronze sync."""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.config import (
    WAREHOUSE_GOLD_INCREMENTAL_ENABLED,
    WAREHOUSE_PILOT_INSTITUTION_IDS,
    WAREHOUSE_PILOT_POLL_SECONDS,
    WAREHOUSE_SYNC_ALL_PARISHES,
)
from app.services import analytics_db
from app.services.parish_gold_candidates import recover_record_memo_metrics
from app.services.parish_gold_loader import refresh_incremental
from app.services.silver_etl import run_silver_record
from app.services.supabase_client import get_table
from app.services.warehouse_monitor import (
    claim_due_retries,
    cleanup_history,
    complete_retry,
    fail_retry,
    queue_retry,
)

logger = logging.getLogger(__name__)

_PIPELINE_PREFIX = "parish_bronze_incremental"
_GLOBAL_PIPELINE_NAME = "parish_silver_incremental"
_PAGE_SIZE = 1000
_last_cleanup_at: datetime | None = None


def _pipeline_name(institution_id: str) -> str:
    return f"{_PIPELINE_PREFIX}:{institution_id}"


def _get_pipeline_watermark(pipeline_name: str) -> dict[str, Any] | None:
    rows = analytics_db.fetch_query(
        """
        SELECT last_source_updated_at, last_source_id
        FROM warehouse_control.etl_watermarks
        WHERE pipeline_name = %s
          AND source_schema = 'parishes'
          AND source_table = 'financial_records'
        """,
        (pipeline_name,),
    )
    return rows[0] if rows else None


def _set_pipeline_watermark(pipeline_name: str, updated_at: str | datetime, record_id: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_watermarks
          (pipeline_name, source_schema, source_table, last_source_updated_at, last_source_id)
        VALUES (%s, 'parishes', 'financial_records', %s, %s)
        ON CONFLICT (pipeline_name, source_schema, source_table) DO UPDATE
        SET last_source_updated_at = EXCLUDED.last_source_updated_at,
            last_source_id = EXCLUDED.last_source_id,
            updated_at = now()
        """,
        (pipeline_name, updated_at, record_id),
    )


def _touch_pipeline_watermark(pipeline_name: str) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_watermarks
        SET updated_at = now()
        WHERE pipeline_name = %s
          AND source_schema = 'parishes'
          AND source_table = 'financial_records'
        """,
        (pipeline_name,),
    )


def _fetch_source_tip(institution_id: str) -> dict[str, Any] | None:
    response = (
        get_table("parishes", "financial_records")
        .select("id, updated_at")
        .eq("institution_id", institution_id)
        .order("updated_at", desc=True)
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _get_watermark(institution_id: str) -> dict[str, Any] | None:
    return _get_pipeline_watermark(_pipeline_name(institution_id))


def _set_watermark(institution_id: str, updated_at: str | datetime, record_id: str) -> None:
    _set_pipeline_watermark(_pipeline_name(institution_id), updated_at, record_id)


def initialize_global_watermark() -> bool:
    """Start global polling from the exact source snapshot used by the backfill."""
    if _get_pipeline_watermark(_GLOBAL_PIPELINE_NAME):
        return False
    rows = analytics_db.fetch_query(
        """
        SELECT source_updated_at, source_record_id::text AS id
        FROM warehouse_control.etl_backfill_items
        WHERE backfill_name = 'parish_finance_direct_v1' AND status = 'succeeded'
        ORDER BY source_updated_at DESC, source_record_id DESC
        LIMIT 1
        """
    )
    if rows:
        _set_pipeline_watermark(_GLOBAL_PIPELINE_NAME, rows[0]["source_updated_at"], rows[0]["id"])
    else:
        raise RuntimeError("Global parish sync requires a completed direct-silver backfill")
    logger.info("Initialized global silver watermark from the completed backfill snapshot")
    return True


def _fetch_global_changes(watermark: dict[str, Any]) -> list[dict]:
    updated_at = watermark["last_source_updated_at"]
    updated_at_text = updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at)
    last_pair = (updated_at_text, str(watermark["last_source_id"]))
    rows: list[dict] = []
    offset = 0
    while True:
        response = (
            get_table("parishes", "financial_records")
            .select("id, institution_id, updated_at")
            .gte("updated_at", updated_at_text)
            .order("updated_at")
            .order("id")
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(row for row in batch if (row["updated_at"], row["id"]) > last_pair)
        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return rows


def _candidate_grains(source_record_id: str) -> list[tuple[int, int]]:
    rows = analytics_db.fetch_query(
        """
        SELECT parish_key, date_key
        FROM parish_analytics.vw_parish_monthly_financial_candidates
        WHERE source_record_id = %s
          AND parish_key IS NOT NULL
          AND date_key IS NOT NULL
        """,
        (source_record_id,),
    )
    return [(int(row["parish_key"]), int(row["date_key"])) for row in rows]


def _sync_change(change: dict[str, Any]) -> dict[str, Any]:
    previous_grains = _candidate_grains(change["id"]) if WAREHOUSE_GOLD_INCREMENTAL_ENABLED else []
    silver_result = run_silver_record(change["id"])
    is_active = bool(silver_result.get("counts", {}).get("silver_records"))
    memo_metrics = recover_record_memo_metrics(change["id"]) if is_active else None
    gold_result = None
    if WAREHOUSE_GOLD_INCREMENTAL_ENABLED:
        current_grains = _candidate_grains(change["id"])
        gold_result = refresh_incremental(change["id"], previous_grains + current_grains)
    return {
        "bronze": None,
        "silver": silver_result,
        "memo_metrics": memo_metrics,
        "gold": gold_result,
    }


def _process_due_retries() -> dict[str, int]:
    result = {"claimed": 0, "succeeded": 0, "rescheduled": 0, "dead_letter": 0}
    for retry in claim_due_retries():
        result["claimed"] += 1
        source_record_id = retry["source_record_id"]
        try:
            _sync_change({"id": source_record_id})
            complete_retry(source_record_id)
            result["succeeded"] += 1
        except Exception as exc:
            logger.exception("Incremental retry failed")
            status = fail_retry(
                source_record_id,
                int(retry["attempt_count"]),
                int(retry["max_attempts"]),
                str(exc),
            )
            result["dead_letter" if status == "dead_letter" else "rescheduled"] += 1
    return result


def _cleanup_if_due() -> dict[str, int] | None:
    global _last_cleanup_at
    now = datetime.now(timezone.utc)
    if _last_cleanup_at is not None and (now - _last_cleanup_at).total_seconds() < 86400:
        return None
    result = cleanup_history()
    _last_cleanup_at = now
    return result


def _run_global_once() -> dict[str, Any]:
    results: dict[str, Any] = {
        "initialized": [], "synced": [], "failed": [],
        "retries": _process_due_retries(), "cleanup": _cleanup_if_due(),
    }
    if initialize_global_watermark():
        results["initialized"].append(_GLOBAL_PIPELINE_NAME)
    watermark = _get_pipeline_watermark(_GLOBAL_PIPELINE_NAME)
    if not watermark:
        return results
    for change in _fetch_global_changes(watermark):
        try:
            results["synced"].append(_sync_change(change))
            _set_pipeline_watermark(_GLOBAL_PIPELINE_NAME, change["updated_at"], change["id"])
        except Exception as exc:
            logger.exception("Global silver sync failed for %s", change["id"])
            queue_retry(change["id"], str(exc))
            _set_pipeline_watermark(_GLOBAL_PIPELINE_NAME, change["updated_at"], change["id"])
            results["failed"].append({"queued_for_retry": True, "error_type": type(exc).__name__})
    _touch_pipeline_watermark(_GLOBAL_PIPELINE_NAME)
    return results


def initialize_watermark(institution_id: str) -> bool:
    """Start at the source tip; Phase 3 must not become an accidental backfill."""
    if _get_watermark(institution_id):
        return False
    tip = _fetch_source_tip(institution_id)
    if tip:
        _set_watermark(institution_id, tip["updated_at"], tip["id"])
    else:
        _set_watermark(institution_id, datetime.now(timezone.utc), "00000000-0000-0000-0000-000000000000")
    logger.info("Initialized pilot watermark for %s without backfilling", institution_id)
    return True


def _fetch_changes(institution_id: str, watermark: dict[str, Any]) -> list[dict]:
    updated_at = watermark["last_source_updated_at"]
    response = (
        get_table("parishes", "financial_records")
        .select("id, updated_at")
        .eq("institution_id", institution_id)
        .gte("updated_at", updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at))
        .order("updated_at")
        .order("id")
        .execute()
    )
    last_pair = (
        updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at),
        str(watermark["last_source_id"]),
    )
    return [row for row in (response.data or []) if (row["updated_at"], row["id"]) > last_pair]


def run_once(institution_ids: list[str] | None = None) -> dict[str, Any]:
    if institution_ids is None and WAREHOUSE_SYNC_ALL_PARISHES:
        return _run_global_once()
    allowlist = institution_ids if institution_ids is not None else WAREHOUSE_PILOT_INSTITUTION_IDS
    results: dict[str, Any] = {
        "initialized": [], "synced": [], "failed": [],
        "retries": _process_due_retries(), "cleanup": _cleanup_if_due(),
    }
    for institution_id in allowlist:
        if initialize_watermark(institution_id):
            results["initialized"].append(institution_id)
            continue
        watermark = _get_watermark(institution_id)
        if not watermark:
            continue
        for change in _fetch_changes(institution_id, watermark):
            try:
                sync_result = _sync_change(change)
                _set_watermark(institution_id, change["updated_at"], change["id"])
                results["synced"].append(sync_result)
            except Exception as exc:
                logger.exception("Pilot bronze sync failed for %s", change["id"])
                queue_retry(change["id"], str(exc))
                _set_watermark(institution_id, change["updated_at"], change["id"])
                results["failed"].append({"queued_for_retry": True, "error_type": type(exc).__name__})
        _touch_pipeline_watermark(_pipeline_name(institution_id))
    return results


async def run_forever(stop_event: asyncio.Event) -> None:
    logger.info(
        "Starting parish silver worker, scope=%s, poll=%ds",
        "all" if WAREHOUSE_SYNC_ALL_PARISHES else f"{len(WAREHOUSE_PILOT_INSTITUTION_IDS)} pilot institution(s)",
        WAREHOUSE_PILOT_POLL_SECONDS,
    )
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            logger.exception("Pilot bronze poll failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=WAREHOUSE_PILOT_POLL_SECONDS)
        except TimeoutError:
            pass


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pilot parish bronze polling worker")
    parser.add_argument("--once", action="store_true", help="Poll the allowlist once")
    parser.add_argument("--record-id", help="Force one idempotent record sync for testing")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        if args.record_id:
            result = _sync_change({"id": args.record_id})
        else:
            result = run_once()
        print(result)
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
