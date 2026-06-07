"""
Philippine Liturgical Calendar Updater
======================================
Refresh orchestration for the calendar reference table.

Default behavior:
  - During the 2nd week of November, preloads next year's PH calendar.
  - During quarterly refresh months, re-checks current and next year.
  - Use --force to run outside those windows.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
QUARTERLY_REFRESH_MONTHS = {2, 5, 8, 11}


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


def update(out_dir: Path = DEFAULT_OUT_DIR, load: bool = False, force: bool = False) -> dict:
    from app.services.liturgical_calendar_collector import collect

    years = target_years(force=force)
    if not years:
        logger.info("No calendar refresh needed today. Use --force to run manually.")
        return {"years": [], "clean_count": 0, "review_count": 0, "loaded_count": 0}

    clean_count = 0
    review_count = 0
    loaded_count = 0
    for year in years:
        year_out_dir = out_dir / str(year)
        result = collect(start_year=year, end_year=year, out_dir=year_out_dir)
        clean_count += len(result["clean"]["records"])
        review_count += len(result["review"]["records"])

        if load:
            from app.services.liturgical_calendar_loader import load_from_file

            loaded_count += load_from_file(year_out_dir / "liturgical_calendar_clean.json")
            loaded_count += load_from_file(year_out_dir / "liturgical_calendar_review.json")

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
