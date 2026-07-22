import os
from pathlib import Path

from dotenv import load_dotenv

# Walk up to repo root and load the single shared .env
_root = Path(__file__).resolve().parents[3]
load_dotenv(dotenv_path=_root / ".env")

SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or ""
SUPABASE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
PORT: int = int(os.getenv("ANALYTICS_PYTHON_PORT", "8000"))

# AWS RDS warehouse (silver/gold layers). Empty = feature off — everything
# falls back to the Supabase paths above. This is the demo-day kill switch.
ANALYTICS_DB_URL: str = os.getenv("ANALYTICS_DB_URL") or ""

# Phase 3 bronze pilot. Disabled by default and restricted to an explicit
# comma-separated institution allowlist.
WAREHOUSE_PILOT_SYNC_ENABLED: bool = os.getenv("WAREHOUSE_PILOT_SYNC_ENABLED", "true").lower() == "true"
WAREHOUSE_PILOT_INSTITUTION_IDS: list[str] = [
    value.strip() for value in os.getenv("WAREHOUSE_PILOT_INSTITUTION_IDS", "").split(",") if value.strip()
]
WAREHOUSE_PILOT_POLL_SECONDS: int = max(10, int(os.getenv("WAREHOUSE_PILOT_POLL_SECONDS", "30")))
WAREHOUSE_OUTBOX_SYNC_ENABLED: bool = os.getenv("WAREHOUSE_OUTBOX_SYNC_ENABLED", "false").lower() == "true"
WAREHOUSE_OUTBOX_BATCH_SIZE: int = max(1, min(100, int(os.getenv("WAREHOUSE_OUTBOX_BATCH_SIZE", "20"))))
WAREHOUSE_OUTBOX_LEASE_SECONDS: int = max(30, int(os.getenv("WAREHOUSE_OUTBOX_LEASE_SECONDS", "300")))
WAREHOUSE_OUTBOX_RETRY_MAX_SECONDS: int = max(30, int(os.getenv("WAREHOUSE_OUTBOX_RETRY_MAX_SECONDS", "900")))
WAREHOUSE_DB_STATEMENT_TIMEOUT_SECONDS: int = max(
    30, int(os.getenv("WAREHOUSE_DB_STATEMENT_TIMEOUT_SECONDS", "120"))
)
# Permanently retired after the direct-Silver cutover. Kept in status output as
# an explicit compatibility signal, but environment values cannot re-enable it.
WAREHOUSE_BRONZE_COMPARISON_ENABLED: bool = False
WAREHOUSE_SYNC_ALL_PARISHES: bool = os.getenv("WAREHOUSE_SYNC_ALL_PARISHES", "true").lower() == "true"
WAREHOUSE_GOLD_INCREMENTAL_ENABLED: bool = os.getenv("WAREHOUSE_GOLD_INCREMENTAL_ENABLED", "true").lower() == "true"
WAREHOUSE_RETRY_MAX_ATTEMPTS: int = max(1, int(os.getenv("WAREHOUSE_RETRY_MAX_ATTEMPTS", "5")))
WAREHOUSE_RETRY_BASE_SECONDS: int = max(10, int(os.getenv("WAREHOUSE_RETRY_BASE_SECONDS", "30")))
WAREHOUSE_RETRY_BATCH_SIZE: int = max(1, int(os.getenv("WAREHOUSE_RETRY_BATCH_SIZE", "20")))
WAREHOUSE_WATERMARK_STALE_SECONDS: int = max(60, int(os.getenv("WAREHOUSE_WATERMARK_STALE_SECONDS", "180")))
WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS: int = max(7, int(os.getenv("WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS", "30")))
WAREHOUSE_ETL_FAILURE_RETENTION_DAYS: int = max(30, int(os.getenv("WAREHOUSE_ETL_FAILURE_RETENTION_DAYS", "180")))

# Independent Supabase -> AWS institution dimension sync. This remains off
# until migration 068 has been deployed to AWS.
WAREHOUSE_INSTITUTION_SYNC_ENABLED: bool = os.getenv("WAREHOUSE_INSTITUTION_SYNC_ENABLED", "false").lower() == "true"
WAREHOUSE_INSTITUTION_POLL_SECONDS: int = max(10, int(os.getenv("WAREHOUSE_INSTITUTION_POLL_SECONDS", "60")))

# Direct Supabase -> AWS Silver/Gold for school and seminary finance.
WAREHOUSE_EDUCATION_SYNC_ENABLED: bool = os.getenv("WAREHOUSE_EDUCATION_SYNC_ENABLED", "false").lower() == "true"
WAREHOUSE_EDUCATION_POLL_SECONDS: int = max(30, int(os.getenv("WAREHOUSE_EDUCATION_POLL_SECONDS", "60")))

# Human-reviewed liturgical calendar records are operational master data in
# Supabase. AWS retains collection staging and an approved analytical copy.
LITURGICAL_CANONICAL_SOURCE: str = os.getenv("LITURGICAL_CANONICAL_SOURCE", "supabase").lower()
LITURGICAL_APPROVAL_SYNC_ENABLED: bool = os.getenv("LITURGICAL_APPROVAL_SYNC_ENABLED", "false").lower() == "true"
LITURGICAL_APPROVAL_POLL_SECONDS: int = max(30, int(os.getenv("LITURGICAL_APPROVAL_POLL_SECONDS", "300")))
