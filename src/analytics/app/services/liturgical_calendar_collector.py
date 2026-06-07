"""
Philippine Liturgical Calendar Collector
========================================
Bulk extraction and validation pipeline for reference.liturgical_calendar.

Sources:
  Primary (stored as DB records):
    1. Romcal Philippines - one record per day, PH-specific npm package

  Validators (cross-check order, not stored as DB records):
    1. GCatholic Philippines - PH-specific iCal, year-by-year historical
    2. LitCal universal - universal Roman calendar, all years
    3. Universalis Philippines - PH-specific rolling feed, current/future only

Output:
  liturgical_calendar_output/liturgical_calendar_clean.json
  liturgical_calendar_output/liturgical_calendar_review.json
  liturgical_calendar_output/liturgical_calendar_source_report.json
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
ROMCAL_HELPER = Path(__file__).with_name("liturgical_romcal_helper.mjs")
USER_AGENT = "PAULUS-liturgical-calendar-ingestion/1.0"


def _today() -> date:
    return date.today()


def _fetch_text(url: str, accept: str = "*/*", timeout: int = 30, retries: int = 3) -> str:
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": accept,
                },
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                logger.debug("Fetch attempt %d/%d failed for %s: %s", attempt + 1, retries, url, exc)
                time.sleep(2 ** (attempt + 1))
    raise last_exc


def _fetch_json(url: str) -> dict[str, Any]:
    return json.loads(_fetch_text(url, accept="application/json"))


def _preflight_check() -> None:
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True, timeout=10)
    except Exception as exc:
        raise RuntimeError(f"Node.js is required but not found: {exc}")
    romcal_dir = PROJECT_ROOT / "node_modules" / "@romcal"
    if not romcal_dir.exists():
        raise RuntimeError("@romcal packages not found — run npm install from the project root.")


def _clean_spaces(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def _review_key(value: Optional[str]) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower()
    value = re.sub(r"\b(saint|st|sts|blessed|the|of|and|or|a|an)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _weekday(date_str: str) -> str:
    return date.fromisoformat(date_str).strftime("%A")


def _base_record(
    *,
    date_str: str,
    celebration_name: str,
    rank: Optional[str],
    liturgical_season: Optional[str],
    psalter_week: Optional[str],
    source_name: str,
    source_url: str,
    source_reference: Optional[str],
    raw_payload: dict[str, Any],
) -> dict[str, Any]:
    parsed = date.fromisoformat(date_str)
    return {
        "date": date_str,
        "year": parsed.year,
        "month": parsed.month,
        "day": parsed.day,
        "weekday": _weekday(date_str),
        "celebration_name": _clean_spaces(celebration_name) or "Unknown celebration",
        "rank": _clean_spaces(rank),
        "liturgical_season": _clean_spaces(liturgical_season),
        "psalter_week": psalter_week,
        "source_name": source_name,
        "source_url": source_url,
        "source_reference": source_reference,
        "raw_payload": raw_payload,
        "review_status": "pending",
        "reviewed_by": None,
        "reviewed_at": None,
        "review_notes": None,
        "revision_payload": None,
    }


def fetch_romcal(year: int) -> list[dict[str, Any]]:
    """Fetch one primary event per day from the Romcal Philippines calendar."""
    command = ["node", str(ROMCAL_HELPER), str(year)]
    completed = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    source_url = "npm:@romcal/calendar.philippines"
    rows = []
    for event in json.loads(completed.stdout):
        rows.append(
            _base_record(
                date_str=event["date"],
                celebration_name=event["celebration_name"],
                rank=event.get("rank"),
                liturgical_season=event.get("liturgical_season"),
                psalter_week=event.get("psalter_week"),
                source_name="romcal",
                source_url=source_url,
                source_reference=event.get("source_reference"),
                raw_payload=event.get("raw_payload") or event,
            )
        )
    return rows


def _rank_from_gcatholic_summary(summary: str) -> Optional[str]:
    rank_map = {
        "S": "SOLEMNITY",
        "F": "FEAST",
        "M": "MEMORIAL",
        "m": "OPTIONAL_MEMORIAL",
    }
    match = re.search(r"\[([A-Za-z])\]", summary)
    return rank_map.get(match.group(1)) if match else None


def _rank_priority(rank: Optional[str]) -> int:
    priority = {
        "SOLEMNITY": 1,
        "FEAST": 2,
        "MEMORIAL": 3,
        "OPTIONAL_MEMORIAL": 4,
        "WEEKDAY": 5,
    }
    return priority.get(rank or "", 9)


def _name_from_gcatholic_summary(summary: str) -> str:
    if re.search(r"\[[A-Za-z]\]", summary):
        summary = re.sub(r"^[^\[]*", "", summary)
        summary = re.sub(r"^\[[A-Za-z]\]\s*", "", summary)
    else:
        summary = re.sub(r"^[^\w]+", "", summary)
    return _clean_spaces(summary.replace("\\,", ",")) or "Unknown celebration"


def _parse_ics(text: str) -> list[dict[str, str]]:
    """Minimal iCalendar parser with folded-line support."""
    unfolded: list[str] = []
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw_line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += raw_line[1:]
        else:
            unfolded.append(raw_line)

    events: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in unfolded:
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        key, value = line.split(":", 1)
        current[key.split(";", 1)[0]] = value.replace("\\n", "\n").replace("\\,", ",")
    return events


def fetch_gcatholic(year: int) -> list[dict[str, Any]]:
    """Fetch GCatholic Philippines iCal data used as validator."""
    source_url = f"https://gcatholic.org/calendar/ics/{year}-en-PH.ics?v=3"
    text = _fetch_text(source_url, accept="text/calendar")
    best_by_date: dict[str, dict[str, Any]] = {}
    for event in _parse_ics(text):
        raw_date = event.get("DTSTART")
        summary = event.get("SUMMARY")
        if not raw_date or not summary:
            continue
        date_str = f"{raw_date[0:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
        rank = _rank_from_gcatholic_summary(summary)
        row = _base_record(
            date_str=date_str,
            celebration_name=_name_from_gcatholic_summary(summary),
            rank=rank,
            liturgical_season=None,
            psalter_week=None,
            source_name="gcatholic",
            source_url=source_url,
            source_reference=event.get("UID"),
            raw_payload=event,
        )
        current = best_by_date.get(date_str)
        if not current or _rank_priority(row["rank"]) < _rank_priority(current["rank"]):
            best_by_date[date_str] = row
    return [best_by_date[key] for key in sorted(best_by_date)]


def _normalize_litcal_event(event: dict[str, Any], year: int, source_url: str) -> Optional[dict[str, Any]]:
    date_value = event.get("date") or event.get("event_date") or event.get("start")
    if isinstance(date_value, int):
        date_str = datetime.utcfromtimestamp(date_value).date().isoformat()
    elif isinstance(date_value, str):
        match = re.search(r"\d{4}-\d{2}-\d{2}", date_value)
        date_str = match.group(0) if match else None
    else:
        date_str = None

    if not date_str or not date_str.startswith(str(year)):
        return None

    name = event.get("name") or event.get("event") or event.get("title")
    if isinstance(name, dict):
        name = name.get("en") or next(iter(name.values()), None)

    return _base_record(
        date_str=date_str,
        celebration_name=str(name or "Unknown celebration"),
        rank=event.get("grade_display") or event.get("grade") or event.get("rank"),
        liturgical_season=event.get("liturgical_season") or event.get("season"),
        psalter_week=None,
        source_name="litcal",
        source_url=source_url,
        source_reference=str(event.get("event_key") or event.get("id") or event.get("key") or ""),
        raw_payload=event,
    )


def fetch_litcal(year: int) -> tuple[list[dict[str, Any]], Optional[str]]:
    """
    Fetch the universal Roman Catholic calendar from LitCal.
    Philippines is not a supported national calendar in LitCal, so we use the
    universal endpoint. This covers all universal feasts and liturgical seasons
    that the Philippines follows; PH-specific saints are covered by GCatholic/Universalis.
    """
    params = urllib.parse.urlencode({"year": year, "locale": "en", "return_type": "JSON", "year_type": "CIVIL"})
    source_url = f"https://litcal.johnromanodorazio.com/api/v5/calendar?{params}"
    try:
        payload = _fetch_json(source_url)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return [], f"LitCal unavailable for {year}: HTTP {exc.code} {detail[:300]}"
    except Exception as exc:
        return [], f"LitCal unavailable for {year}: {type(exc).__name__} {exc}"

    events = payload.get("litcal") or payload.get("events") or payload.get("data") or []
    rows = []
    if isinstance(events, dict):
        events = list(events.values())
    for event in events:
        if isinstance(event, dict):
            row = _normalize_litcal_event(event, year, source_url)
            if row:
                rows.append(row)
    return rows, None


def _apply_cross_validation_fallback(
    record: dict[str, Any],
    litcal_by_date: dict[str, dict[str, Any]],
    universalis_by_date: dict[str, dict[str, Any]],
    gcatholic_result: str,
    gcatholic_celebration_name: Optional[str] = None,
) -> None:
    """Try LitCal then Universalis when GCatholic is absent or mismatched."""
    mismatches: dict[str, str] = {}

    for validator_source, validator_by_date in [("litcal", litcal_by_date), ("universalis", universalis_by_date)]:
        validator = validator_by_date.get(record["date"])
        if not validator:
            continue
        source_key = _review_key(record["celebration_name"])
        validator_key = _review_key(validator["celebration_name"])
        if source_key and validator_key and (source_key in validator_key or validator_key in source_key):
            record["review_status"] = "pending"
            record["review_notes"] = (
                f"GCatholic {gcatholic_result}; matched {validator_source} cross-validator "
                "by normalized name; awaiting human approval."
            )
            record["revision_payload"] = {
                "primary_source": record["source_name"],
                "validator_source": validator_source,
                "comparison_result": "matched_wording",
                "primary_celebration_name": record["celebration_name"],
                "validator_celebration_name": validator["celebration_name"],
                "gcatholic_result": gcatholic_result,
                "gcatholic_celebration_name": gcatholic_celebration_name,
            }
            return
        else:
            mismatches[validator_source] = validator["celebration_name"]

    # No cross-validator matched — route to review with all available context
    if gcatholic_result == "validator_missing" and not mismatches:
        record["review_status"] = "pending"
        record["review_notes"] = "No GCatholic, LitCal, or Universalis validator found for this date; needs human review."
        record["revision_payload"] = {
            "primary_source": record["source_name"],
            "validator_source": None,
            "comparison_result": "validator_missing",
            "primary_celebration_name": record["celebration_name"],
            "validator_celebration_name": None,
            "gcatholic_result": gcatholic_result,
        }
    else:
        gcatholic_detail = (
            f"GCatholic: {gcatholic_celebration_name}" if gcatholic_celebration_name else f"GCatholic: {gcatholic_result}"
        )
        mismatch_detail = "; ".join(f"{src}: {name}" for src, name in mismatches.items())
        all_detail = "; ".join(filter(None, [gcatholic_detail, mismatch_detail]))
        record["review_status"] = "pending"
        record["review_notes"] = f"No cross-validator matched ({all_detail}); needs human review."
        record["revision_payload"] = {
            "primary_source": record["source_name"],
            "validator_source": None,
            "comparison_result": "different_wording",
            "primary_celebration_name": record["celebration_name"],
            "gcatholic_result": gcatholic_result,
            "gcatholic_celebration_name": gcatholic_celebration_name,
            **{f"{src}_celebration_name": name for src, name in mismatches.items()},
        }


def _validate_against_gcatholic(
    records: list[dict[str, Any]],
    gcatholic_by_date: dict[str, dict[str, Any]],
    litcal_by_date: Optional[dict[str, dict[str, Any]]] = None,
    universalis_by_date: Optional[dict[str, dict[str, Any]]] = None,
) -> None:
    litcal_by_date = litcal_by_date or {}
    universalis_by_date = universalis_by_date or {}
    for record in records:
        validator = gcatholic_by_date.get(record["date"])
        if not validator:
            _apply_cross_validation_fallback(
                record, litcal_by_date, universalis_by_date, gcatholic_result="validator_missing"
            )
            continue

        source_key = _review_key(record["celebration_name"])
        validator_key = _review_key(validator["celebration_name"])
        if source_key and validator_key and (source_key in validator_key or validator_key in source_key):
            record["review_status"] = "pending"
            record["review_notes"] = "Matched GCatholic validator by normalized celebration name; awaiting human approval."
            record["revision_payload"] = {
                "primary_source": record["source_name"],
                "validator_source": "gcatholic",
                "comparison_result": "matched_wording",
                "primary_celebration_name": record["celebration_name"],
                "validator_celebration_name": validator["celebration_name"],
            }
        else:
            _apply_cross_validation_fallback(
                record,
                litcal_by_date,
                universalis_by_date,
                gcatholic_result="different_wording",
                gcatholic_celebration_name=validator["celebration_name"],
            )


def fetch_universalis() -> tuple[list[dict[str, Any]], Optional[str]]:
    """
    Fetch Universalis Philippines rolling iCal feed.
    Philippines-specific; used as tertiary validator after GCatholic and LitCal.
    Only contains data from roughly today forward — historical years return 0 rows.
    """
    source_url = "https://universalis.com/Philippines/vcalendar.ics"
    try:
        text = _fetch_text(source_url, accept="text/calendar")
    except Exception as exc:
        return [], f"Universalis unavailable: {type(exc).__name__} {exc}"

    best_by_date: dict[str, dict[str, Any]] = {}
    for event in _parse_ics(text):
        raw_date = event.get("DTSTART")
        summary = event.get("SUMMARY")
        if not raw_date or not summary:
            continue
        date_str = f"{raw_date[0:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
        row = _base_record(
            date_str=date_str,
            celebration_name=_clean_spaces(summary) or "Unknown celebration",
            rank=None,
            liturgical_season=None,
            psalter_week=None,
            source_name="universalis",
            source_url=source_url,
            source_reference=event.get("UID"),
            raw_payload=event,
        )
        best_by_date[date_str] = row
    return [best_by_date[key] for key in sorted(best_by_date)], None


def collect(
    start_year: int = 2023,
    end_year: Optional[int] = None,
    out_dir: Path = DEFAULT_OUT_DIR,
) -> dict[str, Any]:
    end_year = end_year or _today().year
    if start_year > end_year:
        raise ValueError("start_year cannot be greater than end_year")

    _preflight_check()
    out_dir.mkdir(parents=True, exist_ok=True)

    lock_path = out_dir / ".collect.lock"
    if lock_path.exists():
        raise RuntimeError(f"Another collect() run is already in progress. Delete {lock_path} to reset.")
    lock_path.write_text("locked")
    try:
        clean_rows: list[dict[str, Any]] = []
        review_rows: list[dict[str, Any]] = []
        report_rows: list[dict[str, Any]] = []

        logger.info("Collecting Philippine liturgical calendar %s -> %s", start_year, end_year)

        universalis_rows, universalis_error = fetch_universalis()
        universalis_by_date = {row["date"]: row for row in universalis_rows}
        if universalis_error:
            logger.warning("Universalis unavailable: %s", universalis_error)

        for year in range(start_year, end_year + 1):
            logger.info("Year %s", year)
            try:
                gcatholic_rows = fetch_gcatholic(year)
                gcatholic_error = None
            except Exception as exc:
                gcatholic_rows = []
                gcatholic_error = f"{type(exc).__name__}: {exc}"
                logger.warning("GCatholic unavailable for %s: %s", year, gcatholic_error)

            gcatholic_by_date = {row["date"]: row for row in gcatholic_rows}

            source_results: dict[str, list[dict[str, Any]]] = {}
            source_errors: dict[str, Optional[str]] = {"gcatholic": gcatholic_error}

            source_results["romcal"] = fetch_romcal(year)
            if len(source_results["romcal"]) < 300:
                raise RuntimeError(
                    f"Year {year}: Romcal returned only {len(source_results['romcal'])} records, "
                    f"expected ~365. Aborting to prevent incomplete data."
                )
            source_errors["romcal"] = None

            litcal_rows, litcal_error = fetch_litcal(year)
            litcal_by_date = {row["date"]: row for row in litcal_rows}

            for source_name, records in source_results.items():
                _validate_against_gcatholic(records, gcatholic_by_date, litcal_by_date, universalis_by_date)
                matched_rows = [
                    row
                    for row in records
                    if (row.get("revision_payload") or {}).get("comparison_result") == "matched_wording"
                ]
                clean_rows.extend(matched_rows)
                review_rows.extend([row for row in records if row not in matched_rows])
                report_rows.append(
                    {
                        "year": year,
                        "source": source_name,
                        "record_count": len(records),
                        "matched_count": len(matched_rows),
                        "pending_count": sum(1 for row in records if row["review_status"] == "pending"),
                        "error": source_errors.get(source_name),
                    }
                )

            for validator_source, validator_rows, validator_error in [
                ("gcatholic", gcatholic_rows, gcatholic_error),
                ("litcal", litcal_rows, litcal_error),
                ("universalis", [r for r in universalis_rows if r["date"].startswith(str(year))], universalis_error),
            ]:
                report_rows.append(
                    {
                        "year": year,
                        "source": validator_source,
                        "record_count": len(validator_rows),
                        "validator_only": True,
                        "error": validator_error,
                    }
                )
            time.sleep(0.5)

        generated_at = datetime.now(timezone.utc).isoformat()
        clean_payload = {
            "generated_at": generated_at,
            "start_year": start_year,
            "end_year": end_year,
            "records": clean_rows,
        }
        review_payload = {
            "generated_at": generated_at,
            "start_year": start_year,
            "end_year": end_year,
            "records": review_rows,
        }
        report_payload = {
            "generated_at": generated_at,
            "start_year": start_year,
            "end_year": end_year,
            "sources": report_rows,
        }

        (out_dir / "liturgical_calendar_clean.json").write_text(json.dumps(clean_payload, indent=2), encoding="utf-8")
        (out_dir / "liturgical_calendar_review.json").write_text(json.dumps(review_payload, indent=2), encoding="utf-8")
        (out_dir / "liturgical_calendar_source_report.json").write_text(
            json.dumps(report_payload, indent=2), encoding="utf-8"
        )

        logger.info("Clean rows: %d; review rows: %d", len(clean_rows), len(review_rows))
        return {"clean": clean_payload, "review": review_payload, "report": report_payload}
    finally:
        lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Collect Philippine liturgical calendar reference data")
    parser.add_argument("--start-year", type=int, default=2023)
    parser.add_argument("--end-year", type=int, default=_today().year)
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--load", action="store_true", help="Load clean output into Supabase after collecting")
    parser.add_argument("--load-review", action="store_true", help="Also load pending review rows into Supabase")
    args = parser.parse_args()

    result = collect(start_year=args.start_year, end_year=args.end_year, out_dir=Path(args.out))
    print(
        f"Collected {len(result['clean']['records'])} clean rows and "
        f"{len(result['review']['records'])} review rows."
    )

    if args.load:
        from app.services.liturgical_calendar_loader import load_from_file

        loaded = load_from_file(Path(args.out) / "liturgical_calendar_clean.json")
        if args.load_review:
            loaded += load_from_file(Path(args.out) / "liturgical_calendar_review.json")
        print(f"Loaded {loaded} rows into reference.liturgical_calendar")
