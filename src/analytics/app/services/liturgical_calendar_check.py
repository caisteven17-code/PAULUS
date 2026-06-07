"""
Lightweight pre-flight check for the liturgical calendar refresh workflow.
Uses stdlib only — no pip install needed.

Writes needed=true/false to $GITHUB_OUTPUT.
Exits 1 if calendar data is critically stale (> STALE_ALERT_DAYS) so
the check job fails and triggers the failure notification even on no-op days.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

QUARTERLY_MONTHS = {2, 5, 8, 11}
RETRY_WINDOW_DAYS = 30
RUN_TTL_HOURS = 3
STALE_ALERT_DAYS = 45


def _set_output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            f.write(f"{key}={value}\n")
    else:
        print(f"{key}={value}")


def _supabase_get(base_url: str, key: str, table: str, params: str) -> list:
    url = f"{base_url.rstrip('/')}/rest/v1/{table}?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept-Profile": "reference",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        print(f"::warning::Supabase check failed ({table}): {exc}")
        return []


def main() -> int:
    today = date.today()

    # Scheduled day — no DB query needed.
    # Matches the cron triggers: 1st of Feb/May/Aug/Nov, and the Nov 8–14 preload window.
    is_quarterly_day = today.month in QUARTERLY_MONTHS and today.day == 1
    is_preload_week = today.month == 11 and 8 <= today.day <= 14
    if is_quarterly_day or is_preload_week:
        print(f"Scheduled refresh day ({today}).")
        _set_output("needed", "true")
        return 0

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_key:
        print("::warning::No Supabase credentials — skipping DB checks.")
        _set_output("needed", "false")
        return 0

    cutoff = (today - timedelta(days=RETRY_WINDOW_DAYS)).isoformat()
    ttl_cutoff = (datetime.now(timezone.utc) - timedelta(hours=RUN_TTL_HOURS)).isoformat()

    # Failed runs within retry window
    failed = _supabase_get(
        supabase_url, supabase_key,
        "liturgical_calendar_runs",
        f"select=id&status=eq.failed&started_at=gte.{cutoff}&limit=1",
    )

    # Orphaned running runs older than TTL (crash survivors)
    orphaned = _supabase_get(
        supabase_url, supabase_key,
        "liturgical_calendar_runs",
        f"select=id&status=eq.running&started_at=lt.{ttl_cutoff}&started_at=gte.{cutoff}&limit=1",
    )

    if failed or orphaned:
        print("Failed or orphaned run found — retry needed.")
        _set_output("needed", "true")
        return 0

    # Critical staleness check — independent of retry window
    recent = _supabase_get(
        supabase_url, supabase_key,
        "liturgical_calendar",
        "select=updated_at&order=updated_at.desc&limit=1",
    )
    if recent:
        last_updated = recent[0].get("updated_at", "")
        stale_cutoff = (today - timedelta(days=STALE_ALERT_DAYS)).isoformat()
        if last_updated and last_updated < stale_cutoff:
            print(f"::error::Liturgical calendar data is critically stale — last updated {last_updated[:10]}.")
            _set_output("needed", "true")
            return 1  # fail the job to trigger failure notification

    print(f"No refresh needed today ({today}).")
    _set_output("needed", "false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
