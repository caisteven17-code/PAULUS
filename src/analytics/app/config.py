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
WAREHOUSE_PILOT_SYNC_ENABLED: bool = os.getenv("WAREHOUSE_PILOT_SYNC_ENABLED", "false").lower() == "true"
WAREHOUSE_PILOT_INSTITUTION_IDS: list[str] = [
    value.strip() for value in os.getenv("WAREHOUSE_PILOT_INSTITUTION_IDS", "").split(",") if value.strip()
]
WAREHOUSE_PILOT_POLL_SECONDS: int = max(10, int(os.getenv("WAREHOUSE_PILOT_POLL_SECONDS", "30")))
WAREHOUSE_BRONZE_COMPARISON_ENABLED: bool = os.getenv("WAREHOUSE_BRONZE_COMPARISON_ENABLED", "true").lower() == "true"
WAREHOUSE_SYNC_ALL_PARISHES: bool = os.getenv("WAREHOUSE_SYNC_ALL_PARISHES", "false").lower() == "true"
