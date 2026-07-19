"""AWS pre-flight check for the liturgical calendar refresh workflow."""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta, timezone

import psycopg

QUARTERLY_MONTHS = {2, 5, 8, 11}
RETRY_WINDOW_DAYS = 30
RUN_TTL_HOURS = 3
STALE_ALERT_DAYS = 45


def _set_output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as output:
            output.write(f"{key}={value}\n")
    else:
        print(f"{key}={value}")


def main() -> int:
    today = date.today()
    is_quarterly_day = today.month in QUARTERLY_MONTHS and today.day == 1
    is_preload_week = today.month == 11 and 8 <= today.day <= 14
    if is_quarterly_day or is_preload_week:
        print(f"Scheduled refresh day ({today}).")
        _set_output("needed", "true")
        return 0

    database_url = os.environ.get("ANALYTICS_DB_URL", "")
    if not database_url:
        print("::error::ANALYTICS_DB_URL is required for calendar checks.")
        _set_output("needed", "true")
        return 1

    cutoff = datetime.combine(today - timedelta(days=RETRY_WINDOW_DAYS), datetime.min.time(), timezone.utc)
    ttl_cutoff = datetime.now(timezone.utc) - timedelta(hours=RUN_TTL_HOURS)
    try:
        with psycopg.connect(database_url) as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXISTS (
                  SELECT 1 FROM reference.liturgical_calendar_runs
                  WHERE started_at >= %s
                    AND (status IN ('failed', 'partial')
                      OR (status = 'running' AND started_at < %s))
                )
                """,
                (cutoff, ttl_cutoff),
            )
            if cur.fetchone()[0]:
                print("Failed, partial, or orphaned run found; retry needed.")
                _set_output("needed", "true")
                return 0

            cur.execute("SELECT max(updated_at) FROM reference.liturgical_calendar")
            last_updated = cur.fetchone()[0]
            stale_cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_ALERT_DAYS)
            if last_updated and last_updated < stale_cutoff:
                print("::error::Liturgical calendar data is critically stale.")
                _set_output("needed", "true")
                return 1
    except Exception as exc:
        print(f"::error::AWS calendar check failed: {type(exc).__name__}")
        _set_output("needed", "true")
        return 1

    print(f"No refresh needed today ({today}).")
    _set_output("needed", "false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
