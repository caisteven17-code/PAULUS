"""Operational monitoring, retries, alerts, and ETL-history retention."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import (
    WAREHOUSE_ETL_FAILURE_RETENTION_DAYS,
    WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS,
    WAREHOUSE_RETRY_BASE_SECONDS,
    WAREHOUSE_RETRY_BATCH_SIZE,
    WAREHOUSE_RETRY_MAX_ATTEMPTS,
    WAREHOUSE_WATERMARK_STALE_SECONDS,
)
from app.services import analytics_db

_GLOBAL_PIPELINE_NAME = "parish_silver_incremental"


def open_alert(
    alert_key: str,
    *,
    pipeline_name: str,
    alert_type: str,
    severity: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_alerts (
          alert_key, pipeline_name, alert_type, severity, message, details
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (alert_key) DO UPDATE SET
          pipeline_name = EXCLUDED.pipeline_name,
          alert_type = EXCLUDED.alert_type,
          severity = EXCLUDED.severity,
          status = 'open',
          message = EXCLUDED.message,
          details = EXCLUDED.details,
          last_seen_at = now(),
          resolved_at = NULL,
          updated_at = now()
        """,
        (alert_key, pipeline_name, alert_type, severity, message, Jsonb(details or {})),
    )


def resolve_alert(alert_key: str) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_alerts
        SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE alert_key = %s AND status = 'open'
        """,
        (alert_key,),
    )


def queue_retry(source_record_id: str, error: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_retry_queue (
          source_record_id, pipeline_name, status, attempt_count,
          max_attempts, next_attempt_at, last_error
        )
        VALUES (%s, %s, 'pending', 1, %s, now(), %s)
        ON CONFLICT (source_record_id) DO UPDATE SET
          pipeline_name = EXCLUDED.pipeline_name,
          status = 'pending',
          attempt_count = CASE
            WHEN warehouse_control.etl_retry_queue.status = 'succeeded' THEN 1
            ELSE LEAST(warehouse_control.etl_retry_queue.attempt_count + 1,
                       warehouse_control.etl_retry_queue.max_attempts)
          END,
          next_attempt_at = now(),
          last_error = EXCLUDED.last_error,
          resolved_at = NULL,
          updated_at = now()
        """,
        (source_record_id, _GLOBAL_PIPELINE_NAME, WAREHOUSE_RETRY_MAX_ATTEMPTS, error[:2000]),
    )
    open_alert(
        f"retry:{source_record_id}",
        pipeline_name=_GLOBAL_PIPELINE_NAME,
        alert_type="incremental_retry",
        severity="warning",
        message="Incremental parish record is awaiting retry.",
        details={"source_record_id": source_record_id},
    )


def force_retry(source_record_id: str) -> dict[str, Any]:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_retry_queue (
          source_record_id, pipeline_name, status, attempt_count,
          max_attempts, next_attempt_at
        )
        VALUES (%s, %s, 'pending', 0, %s, now())
        ON CONFLICT (source_record_id) DO UPDATE SET
          status = 'pending', attempt_count = 0, max_attempts = EXCLUDED.max_attempts,
          next_attempt_at = now(), last_error = NULL, resolved_at = NULL,
          updated_at = now()
        """,
        (source_record_id, _GLOBAL_PIPELINE_NAME, WAREHOUSE_RETRY_MAX_ATTEMPTS),
    )
    resolve_alert(f"retry:{source_record_id}")
    return {"queued": True, "source_record_id": source_record_id}


def claim_due_retries() -> list[dict[str, Any]]:
    with analytics_db.get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                WITH due AS (
                  SELECT source_record_id
                  FROM warehouse_control.etl_retry_queue
                  WHERE status = 'pending' AND next_attempt_at <= now()
                  ORDER BY next_attempt_at, updated_at
                  FOR UPDATE SKIP LOCKED
                  LIMIT %s
                )
                UPDATE warehouse_control.etl_retry_queue queue
                SET status = 'processing', last_attempt_at = now(), updated_at = now()
                FROM due
                WHERE queue.source_record_id = due.source_record_id
                RETURNING queue.source_record_id::text AS source_record_id,
                          queue.attempt_count, queue.max_attempts
                """,
                (WAREHOUSE_RETRY_BATCH_SIZE,),
            )
            rows = cur.fetchall()
        conn.commit()
    return rows


def complete_retry(source_record_id: str) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_retry_queue
        SET status = 'succeeded', resolved_at = now(), last_error = NULL,
            updated_at = now()
        WHERE source_record_id = %s
        """,
        (source_record_id,),
    )
    resolve_alert(f"retry:{source_record_id}")


def fail_retry(source_record_id: str, attempt_count: int, max_attempts: int, error: str) -> str:
    next_attempt = attempt_count + 1
    status = "dead_letter" if next_attempt >= max_attempts else "pending"
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_retry_queue
        SET status = %s,
            attempt_count = %s,
            next_attempt_at = CASE
              WHEN %s = 'dead_letter' THEN next_attempt_at
              ELSE now() + make_interval(
                secs => LEAST(%s * power(2, GREATEST(%s - 1, 0)), 3600)::integer
              )
            END,
            last_error = %s,
            updated_at = now()
        WHERE source_record_id = %s
        """,
        (
            status,
            next_attempt,
            status,
            WAREHOUSE_RETRY_BASE_SECONDS,
            next_attempt,
            error[:2000],
            source_record_id,
        ),
    )
    open_alert(
        f"retry:{source_record_id}",
        pipeline_name=_GLOBAL_PIPELINE_NAME,
        alert_type="incremental_dead_letter" if status == "dead_letter" else "incremental_retry",
        severity="critical" if status == "dead_letter" else "warning",
        message=(
            "Incremental parish record exhausted automatic retries."
            if status == "dead_letter"
            else "Incremental parish record retry failed and was rescheduled."
        ),
        details={"source_record_id": source_record_id, "attempt_count": next_attempt},
    )
    return status


def health() -> dict[str, Any]:
    summary = analytics_db.fetch_query(
        """
        SELECT
          count(*) FILTER (WHERE status = 'pending') AS pending_retries,
          count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_retries
        FROM warehouse_control.etl_retry_queue
        """
    )[0]
    alerts = analytics_db.fetch_query(
        """
        SELECT
          count(*) FILTER (WHERE status = 'open' AND severity = 'warning') AS warning_alerts,
          count(*) FILTER (WHERE status = 'open' AND severity = 'critical') AS critical_alerts
        FROM warehouse_control.etl_alerts
        """
    )[0]
    latest_runs = analytics_db.fetch_query(
        """
        SELECT pipeline_name, run_mode, status, started_at, finished_at,
               extracted_count, loaded_count, failed_count
        FROM warehouse_control.v_pipeline_latest_runs
        WHERE pipeline_name IN (
          'parish_silver_direct', 'parish_gold_phase_5e',
          'parish_gold_candidate_validation'
        )
        ORDER BY pipeline_name
        """
    )
    watermark_rows = analytics_db.fetch_query(
        """
        SELECT last_source_updated_at, updated_at,
               EXTRACT(EPOCH FROM (now() - updated_at))::bigint AS heartbeat_age_seconds
        FROM warehouse_control.etl_watermarks
        WHERE pipeline_name = %s
          AND source_schema = 'parishes'
          AND source_table = 'financial_records'
        """,
        (_GLOBAL_PIPELINE_NAME,),
    )
    watermark = watermark_rows[0] if watermark_rows else None
    heartbeat_age = int(watermark["heartbeat_age_seconds"]) if watermark else None
    stale = heartbeat_age is None or heartbeat_age > WAREHOUSE_WATERMARK_STALE_SECONDS
    critical = int(alerts["critical_alerts"]) > 0 or int(summary["dead_letter_retries"]) > 0
    degraded = critical or stale or int(summary["pending_retries"]) > 0 or int(alerts["warning_alerts"]) > 0
    return {
        "status": "unhealthy" if critical else "degraded" if degraded else "healthy",
        "pending_retries": int(summary["pending_retries"]),
        "dead_letter_retries": int(summary["dead_letter_retries"]),
        "warning_alerts": int(alerts["warning_alerts"]),
        "critical_alerts": int(alerts["critical_alerts"]),
        "watermark_present": watermark is not None,
        "worker_heartbeat_age_seconds": heartbeat_age,
        "worker_heartbeat_stale": stale,
        "latest_runs": latest_runs,
        "checked_at": datetime.now(timezone.utc),
    }


def cleanup_history() -> dict[str, int]:
    result = analytics_db.execute_returning_one(
        """
        WITH removed_success AS (
          DELETE FROM warehouse_control.etl_runs
          WHERE status = 'succeeded'
            AND finished_at < now() - make_interval(days => %s)
          RETURNING 1
        ), removed_failure AS (
          DELETE FROM warehouse_control.etl_runs
          WHERE status IN ('failed', 'partial')
            AND finished_at < now() - make_interval(days => %s)
          RETURNING 1
        ), removed_retries AS (
          DELETE FROM warehouse_control.etl_retry_queue
          WHERE status = 'succeeded'
            AND resolved_at < now() - make_interval(days => %s)
          RETURNING 1
        ), removed_alerts AS (
          DELETE FROM warehouse_control.etl_alerts
          WHERE status = 'resolved'
            AND resolved_at < now() - make_interval(days => %s)
          RETURNING 1
        )
        SELECT
          (SELECT count(*) FROM removed_success) AS succeeded_runs,
          (SELECT count(*) FROM removed_failure) AS failed_runs,
          (SELECT count(*) FROM removed_retries) AS retry_entries,
          (SELECT count(*) FROM removed_alerts) AS alerts
        """,
        (
            WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS,
            WAREHOUSE_ETL_FAILURE_RETENTION_DAYS,
            WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS,
            WAREHOUSE_ETL_FAILURE_RETENTION_DAYS,
        ),
    )
    return {key: int(value) for key, value in (result or {}).items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Warehouse operational controls")
    parser.add_argument("mode", choices=("health", "retry", "cleanup"))
    parser.add_argument("--record-id")
    args = parser.parse_args()
    try:
        if args.mode == "health":
            result = health()
        elif args.mode == "cleanup":
            result = cleanup_history()
        else:
            if not args.record_id:
                parser.error("retry requires --record-id")
            result = force_retry(args.record_id)
        print(result)
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
