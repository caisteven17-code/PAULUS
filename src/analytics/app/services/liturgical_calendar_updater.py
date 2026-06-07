"""
Philippine Liturgical Calendar Updater
======================================
Refresh orchestration for the calendar reference table.

Default behavior:
  - During the 2nd week of November, preloads next year's PH calendar.
  - During quarterly refresh months, re-checks current and next year.
  - Daily fallback: retries years from recent failed/partial/orphaned runs.
  - Use --force to run outside those windows.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
QUARTERLY_REFRESH_MONTHS = {2, 5, 8, 11}
RETRY_WINDOW_DAYS = 30
RUN_TTL_HOURS = 3


def _today() -> date:
    return date.today()


def target_years(today: date | None = None, force: bool = False) -> list[int]:
    today = today or _today()
    years: set[int] = set()

    is_second_week_of_november = today.month == 11 and 8 <= today.day <= 14
    is_quarterly_refresh = today.month in QUARTERLY_REFRESH_MONTHS

    if force or is_second_week_of_november:
        years.add(today.year + 1)

    if force or is_quarterly_refresh:
        years.add(today.year)
        years.add(today.year + 1)

    return sorted(years)


def _stale_years(today: date | None = None) -> list[int]:
    """Return years still needing refresh from recent failed, partial, or orphaned runs."""
    today = today or _today()
    try:
        from app.services.supabase_client import get_table

        table = get_table("reference", "liturgical_calendar_runs")
        cutoff = (today - timedelta(days=RETRY_WINDOW_DAYS)).isoformat()
        ttl_cutoff = (datetime.now(timezone.utc) - timedelta(hours=RUN_TTL_HOURS)).isoformat()

        failed_resp = (
            table.select("years, completed_years, started_at")
            .in_("status", ["failed", "partial"])
            .gte("started_at", cutoff)
            .execute()
        )
        orphaned_resp = (
            table.select("years, completed_years, started_at")
            .eq("status", "running")
            .lt("started_at", ttl_cutoff)
            .gte("started_at", cutoff)
            .execute()
        )

        problem_runs = (failed_resp.data or []) + (orphaned_resp.data or [])
        if not problem_runs:
            return []

        needs_retry: set[int] = set()
        for run in problem_runs:
            all_years = set(run.get("years") or [])
            done_years = set(run.get("completed_years") or [])
            needs_retry.update(all_years - done_years)

        if not needs_retry:
            return []

        oldest_failure = min(run["started_at"] for run in problem_runs)
        successes = (
            table.select("years, completed_years, status")
            .in_("status", ["success", "partial"])
            .gte("started_at", oldest_failure)
            .execute()
        )
        refreshed: set[int] = set()
        for run in successes.data or []:
            if run.get("status") == "success":
                refreshed.update(run.get("years") or [])
            else:
                refreshed.update(run.get("completed_years") or [])

        return sorted(needs_retry - refreshed)
    except Exception as exc:
        logger.warning("Could not query stale years: %s", exc)
        return []


def _create_run_record(years: list[int]) -> Optional[str]:
    try:
        from app.services.supabase_client import get_table

        resp = (
            get_table("reference", "liturgical_calendar_runs")
            .insert({
                "years": years,
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            })
            .execute()
        )
        return resp.data[0]["id"] if resp.data else None
    except Exception as exc:
        logger.warning("Could not create run record: %s", exc)
        return None


def _update_run_record(
    run_id: Optional[str],
    status: str,
    clean_count: int,
    review_count: int,
    error_detail: Optional[str] = None,
    completed_years: Optional[list[int]] = None,
) -> None:
    if not run_id:
        return
    try:
        from app.services.supabase_client import get_table

        get_table("reference", "liturgical_calendar_runs").update({
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "clean_count": clean_count,
            "review_count": review_count,
            "error_detail": error_detail,
            "completed_years": completed_years or [],
        }).eq("id", run_id).execute()
    except Exception as exc:
        logger.warning("Could not update run record: %s", exc)


def update(out_dir: Path = DEFAULT_OUT_DIR, load: bool = False, force: bool = False) -> dict:
    from app.services.liturgical_calendar_collector import collect

    years = sorted(set(target_years(force=force)) | set(_stale_years()))
    if not years:
        logger.info("No calendar refresh needed today. Use --force to run manually.")
        return {"years": [], "clean_count": 0, "review_count": 0, "loaded_count": 0}

    run_id = _create_run_record(years)
    clean_count = 0
    review_count = 0
    loaded_count = 0
    completed_years: list[int] = []
    try:
        for year in years:
            year_out_dir = out_dir / str(year)
            result = collect(start_year=year, end_year=year, out_dir=year_out_dir)
            clean_count += len(result["clean"]["records"])
            review_count += len(result["review"]["records"])

            if load:
                from app.services.liturgical_calendar_loader import load_from_file

                loaded_count += load_from_file(
                    year_out_dir / "liturgical_calendar_clean.json", run_id=run_id
                )
                loaded_count += load_from_file(
                    year_out_dir / "liturgical_calendar_review.json", run_id=run_id
                )

            completed_years.append(year)

        _update_run_record(run_id, "success", clean_count, review_count, completed_years=completed_years)
    except Exception as exc:
        status = "partial" if completed_years else "failed"
        _update_run_record(
            run_id, status, clean_count, review_count,
            error_detail=str(exc), completed_years=completed_years,
        )
        raise

    return {
        "years": years,
        "clean_count": clean_count,
        "review_count": review_count,
        "loaded_count": loaded_count,
    }


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Refresh Philippine liturgical calendar data")
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--load", action="store_true", help="Load generated rows into Supabase")
    parser.add_argument("--force", action="store_true", help="Run even outside the scheduled refresh window")
    args = parser.parse_args()

    result = update(out_dir=Path(args.out), load=args.load, force=args.force)
    print(
        f"Calendar updater years={result['years']} "
        f"clean={result['clean_count']} review={result['review_count']} loaded={result['loaded_count']}"
    )
