"""Immutable RDS Bronze archive and workflow lineage for weather ingestion."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from psycopg.types.json import Jsonb

from app.config import WEATHER_BRONZE_ENABLED
from app.services import analytics_db

logger = logging.getLogger(__name__)


def archive_file(
    path: Path,
    *,
    run_id: Optional[str],
    run_mode: str,
    period_start: date,
    period_end: date,
    artifact_type: str,
) -> Optional[str]:
    """Persist an immutable JSON artifact before any Silver database load.

    Returns the Bronze UUID, or ``None`` when Bronze is disabled. A
    Bronze-enabled run fails closed: Silver must not load when raw archival
    fails.
    """
    if not WEATHER_BRONZE_ENABLED:
        return None
    if not path.exists():
        raise FileNotFoundError(path)

    effective_run_id = run_id or str(uuid4())
    payload_bytes = path.read_bytes()
    payload = json.loads(payload_bytes)
    checksum = hashlib.sha256(payload_bytes).hexdigest()
    extracted_at = datetime.now(timezone.utc)

    analytics_db.execute(
        """
        INSERT INTO operations.weather_ingestion_runs (
          run_id, run_mode, status, period_start, period_end, started_at,
          bronze_object_count
        ) VALUES (%s, %s, 'bronze_loaded', %s, %s, %s, 0)
        ON CONFLICT (run_id) DO UPDATE SET
          status = 'bronze_loaded',
          updated_at = now()
        """,
        (effective_run_id, run_mode, period_start, period_end, extracted_at),
    )
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO reference_bronze.weather_api_raw (
          run_id, artifact_type, source_name, municipality,
          period_start, period_end, extracted_at, source_filename,
          raw_payload, payload_checksum, metadata
        ) VALUES (%s, %s, 'multi_source', %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (run_id, source_filename, payload_checksum)
        DO UPDATE SET raw_weather_id =
          reference_bronze.weather_api_raw.raw_weather_id
        RETURNING raw_weather_id
        """,
        (
            effective_run_id,
            artifact_type,
            payload.get("municipality"),
            period_start,
            period_end,
            extracted_at,
            path.name,
            Jsonb(payload),
            checksum,
            Jsonb({"local_filename": path.name}),
        ),
    )
    bronze_id = str(row["raw_weather_id"])
    analytics_db.execute(
        """
        INSERT INTO operations.weather_ingestion_items (
          run_id, artifact_type, source_name, municipality,
          bronze_weather_id, payload_checksum, extracted_at,
          processing_status, metadata
        ) VALUES (%s, %s, 'multi_source', %s, %s, %s, %s, 'bronze_loaded', %s)
        ON CONFLICT (run_id, bronze_weather_id) WHERE bronze_weather_id IS NOT NULL
        DO NOTHING
        """,
        (
            effective_run_id,
            artifact_type,
            payload.get("municipality"),
            bronze_id,
            checksum,
            extracted_at,
            Jsonb({"local_filename": path.name}),
        ),
    )
    analytics_db.execute(
        """
        UPDATE operations.weather_ingestion_runs run
        SET bronze_object_count = (
              SELECT count(*) FROM operations.weather_ingestion_items item
              WHERE item.run_id = run.run_id
                AND item.bronze_weather_id IS NOT NULL
            ),
            updated_at = now()
        WHERE run.run_id = %s
        """,
        (effective_run_id,),
    )
    logger.info("Weather Bronze archived in RDS: %s", bronze_id)
    return bronze_id


def mark_completed(
    run_id: Optional[str],
    *,
    silver_rows: int,
    gold_rows: int,
    error_detail: Optional[str] = None,
) -> None:
    if not WEATHER_BRONZE_ENABLED or not run_id:
        return
    status = "failed" if error_detail else "completed"
    analytics_db.execute(
        """
        UPDATE operations.weather_ingestion_runs
        SET status = %s, silver_row_count = %s, gold_row_count = %s,
            error_summary = %s, finished_at = now(), updated_at = now()
        WHERE run_id = %s
        """,
        (status, silver_rows, gold_rows, error_detail, run_id),
    )
