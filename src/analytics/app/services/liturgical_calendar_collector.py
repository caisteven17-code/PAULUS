"""
Philippine Liturgical Calendar Collector
========================================
Bulk extraction and validation pipeline for reference.liturgical_calendar.

Sources:
  Source of truth (stored as DB records):
    1. Local JSON files in liturgical_calendar_sources/

  Validators (cross-check order, not stored as DB records):
    1. GCatholic Philippines - PH-specific iCal, year-by-year historical
    2. Romcal Philippines - PH-specific npm package
    3. LitCal universal - final fallback only when GCatholic and Romcal fail

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
from difflib import SequenceMatcher
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output"
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "liturgical_calendar_sources"
ALIAS_CROSSWALK = Path(__file__).with_name("liturgical_alias_crosswalk.json")
ROMCAL_HELPER = Path(__file__).with_name("liturgical_romcal_helper.mjs")
USER_AGENT = "PAULUS-liturgical-calendar-ingestion/1.0"
FUZZY_AUTO_MATCH_THRESHOLD = 0.9
FUZZY_POSSIBLE_MATCH_THRESHOLD = 0.8


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
                logger.debug(
                    "Fetch attempt %d/%d failed for %s: %s",
                    attempt + 1,
                    retries,
                    url,
                    exc,
                )
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


def _create_run_record(years: list[int]) -> Optional[str]:
    try:
        from app.services.supabase_client import get_table

        resp = (
            get_table("reference", "liturgical_calendar_runs")
            .insert(
                {
                    "years": years,
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return resp.data[0]["id"] if resp.data else None
    except Exception as exc:
        logger.warning("Could not create liturgical calendar run record: %s", exc)
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

        get_table("reference", "liturgical_calendar_runs").update(
            {
                "status": status,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "clean_count": clean_count,
                "review_count": review_count,
                "error_detail": error_detail,
                "completed_years": completed_years or [],
            }
        ).eq("id", run_id).execute()
    except Exception as exc:
        logger.warning("Could not update liturgical calendar run record: %s", exc)


def _clean_spaces(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value)
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def _review_key(value: Optional[str]) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower()
    ordinal_map = {
        "1st": "first",
        "2nd": "second",
        "3rd": "third",
        "4th": "fourth",
        "5th": "fifth",
        "6th": "sixth",
        "7th": "seventh",
        "8th": "eighth",
        "9th": "ninth",
        "10th": "tenth",
        "11th": "eleventh",
        "12th": "twelfth",
        "13th": "thirteenth",
        "14th": "fourteenth",
        "15th": "fifteenth",
        "16th": "sixteenth",
        "17th": "seventeenth",
        "18th": "eighteenth",
        "19th": "nineteenth",
        "20th": "twentieth",
        "21st": "twenty first",
        "22nd": "twenty second",
        "23rd": "twenty third",
        "24th": "twenty fourth",
        "25th": "twenty fifth",
        "26th": "twenty sixth",
        "27th": "twenty seventh",
        "28th": "twenty eighth",
        "29th": "twenty ninth",
        "30th": "thirtieth",
        "31st": "thirty first",
        "32nd": "thirty second",
        "33rd": "thirty third",
        "34th": "thirty fourth",
    }
    for ordinal, word in ordinal_map.items():
        value = re.sub(rf"\b{ordinal}\b", word, value)
    value = value.replace("&", " and ")
    value = re.sub(r"\b(saint|st|sts|blessed|holy|the|of|and|or|a|an)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    tokens = re.sub(r"\s+", " ", value).strip().split()
    normalized_tokens = []
    for token in tokens:
        if len(token) > 4 and token.endswith("ies"):
            token = f"{token[:-3]}y"
        elif len(token) > 3 and token.endswith("s"):
            token = token[:-1]
        normalized_tokens.append(token)
    return " ".join(normalized_tokens)


def _weekday(date_str: str) -> str:
    return date.fromisoformat(date_str).strftime("%A")


def _season_label(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    key = str(value).strip()
    season_map = {
        "advent": "Advent",
        "christmas": "Christmas",
        "ordinary_time": "Ordinary Time",
        "ordinaryTimeFirst": "Ordinary Time",
        "ordinaryTimeSecond": "Ordinary Time",
        "lent": "Lent",
        "paschal_triduum": "Paschal Triduum",
        "paschalTriduum": "Paschal Triduum",
        "easter": "Easter",
    }
    return season_map.get(key, _clean_spaces(key.replace("_", " ").title()))


def _load_alias_crosswalk() -> dict[str, set[str]]:
    if not ALIAS_CROSSWALK.exists():
        return {}
    payload = json.loads(ALIAS_CROSSWALK.read_text(encoding="utf-8"))
    aliases: dict[str, set[str]] = {}
    for canonical_key, values in (payload.get("aliases") or {}).items():
        normalized_key = _review_key(canonical_key)
        alias_set = {normalized_key}
        for value in values or []:
            key = _review_key(value)
            if key:
                alias_set.add(key)
        aliases[normalized_key] = alias_set
    return aliases


_ALIAS_CROSSWALK_CACHE: dict[str, set[str]] | None = None


def _alias_crosswalk() -> dict[str, set[str]]:
    global _ALIAS_CROSSWALK_CACHE
    if _ALIAS_CROSSWALK_CACHE is None:
        _ALIAS_CROSSWALK_CACHE = _load_alias_crosswalk()
    return _ALIAS_CROSSWALK_CACHE


_ORDINAL_WORDS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
    "twenty first": 21,
    "twenty second": 22,
    "twenty third": 23,
    "twenty fourth": 24,
    "twenty fifth": 25,
    "twenty sixth": 26,
    "twenty seventh": 27,
    "twenty eighth": 28,
    "twenty ninth": 29,
    "thirtieth": 30,
    "thirty first": 31,
    "thirty second": 32,
    "thirty third": 33,
    "thirty fourth": 34,
}

_WEEKDAYS = {
    "monday": "monday",
    "tuesday": "tuesday",
    "wednesday": "wednesday",
    "thursday": "thursday",
    "friday": "friday",
    "saturday": "saturday",
    "sunday": "sunday",
}


def _week_number(value: str) -> Optional[int]:
    match = re.search(r"\b(\d{1,2})\b", value)
    if match:
        return int(match.group(1))
    for word, number in sorted(_ORDINAL_WORDS.items(), key=lambda item: len(item[0]), reverse=True):
        if re.search(rf"\b{re.escape(word)}\b", value):
            return number
    return None


def _weekday_token(value: str) -> Optional[str]:
    for token, weekday in _WEEKDAYS.items():
        if re.search(rf"\b{token}\b", value):
            return weekday
    return None


def _canonical_liturgical_pattern(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    normalized = _review_key(name)
    week = _week_number(normalized)
    weekday = _weekday_token(normalized)

    if "christma time" in normalized and "january" in normalized:
        day_match = re.search(r"\bjanuary (\d{1,2})\b", normalized)
        if day_match:
            return f"christmas_time_january_{int(day_match.group(1))}"
    if "christma time before epiphany" in normalized and weekday:
        return f"christmas_before_epiphany_{weekday}"

    if "ordinary time" in normalized and week and weekday:
        return f"ordinary_time_{week}_{weekday}"
    if "lent" in normalized and week and weekday:
        return f"lent_{week}_{weekday}"
    if "easter time" in normalized and week and weekday:
        return f"easter_time_{week}_{weekday}"
    if "easter" in normalized and week and weekday and "octave" not in normalized:
        return f"easter_time_{week}_{weekday}"

    if "ordinary time" in normalized and week and "sunday" in normalized:
        return f"ordinary_time_{week}_sunday"
    if "lent" in normalized and week and "sunday" in normalized:
        return f"lent_{week}_sunday"
    if "easter time" in normalized and week and "sunday" in normalized:
        return f"easter_time_{week}_sunday"
    if "easter" in normalized and week and "sunday" in normalized:
        return f"easter_time_{week}_sunday"

    if "within octave easter" in normalized and weekday:
        return f"easter_octave_{weekday}"
    if re.search(r"\beaster (monday|tuesday|wednesday|thursday|friday|saturday)\b", normalized):
        return f"easter_octave_{weekday}"

    return None


def _canonical_key_for_record(record: dict[str, Any]) -> str:
    source_reference = record.get("source_reference")
    raw_key = None
    raw_payload = record.get("raw_payload")
    if isinstance(raw_payload, dict):
        raw_celebration = raw_payload.get("celebration")
        if isinstance(raw_celebration, dict):
            raw_key = raw_celebration.get("key")
    return _review_key(source_reference or raw_key or record.get("celebration_name"))


def _canonical_alias_match(record: dict[str, Any], validator_name: Optional[str]) -> Optional[str]:
    validator_key = _review_key(validator_name)
    if not validator_key:
        return None

    source_pattern = _canonical_liturgical_pattern(record.get("celebration_name"))
    validator_pattern = _canonical_liturgical_pattern(validator_name)
    if source_pattern and validator_pattern and source_pattern == validator_pattern:
        return "canonical_pattern"

    canonical_key = _canonical_key_for_record(record)
    alias_set = _alias_crosswalk().get(canonical_key)
    if alias_set and validator_key in alias_set:
        return "alias_crosswalk"

    source_key = _review_key(record.get("celebration_name"))
    if source_key in _alias_crosswalk() and validator_key in _alias_crosswalk()[source_key]:
        return "alias_crosswalk"

    return None


def _fuzzy_similarity(source_name: Optional[str], validator_name: Optional[str]) -> float:
    source_key = _review_key(source_name)
    validator_key = _review_key(validator_name)
    if not source_key or not validator_key:
        return 0.0
    return SequenceMatcher(None, source_key, validator_key).ratio()


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


def _localized_title(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        return _clean_spaces(value.get("en") or next(iter(value.values()), None))
    return _clean_spaces(value)


def load_source_truth_year(year: int, source_dir: Path = DEFAULT_SOURCE_DIR) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read one source-of-truth JSON file and normalize its days[] records."""
    path = source_dir / f"{year}.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing source-of-truth file: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    days = payload.get("days")
    if not isinstance(days, list):
        raise ValueError(f"{path} does not contain a days[] array")

    rows: list[dict[str, Any]] = []
    for item in days:
        if not isinstance(item, dict):
            continue
        date_str = item.get("date")
        celebration = item.get("celebration") or {}
        if not date_str or not isinstance(celebration, dict):
            continue

        row = _base_record(
            date_str=date_str,
            celebration_name=_localized_title((celebration.get("title") or {})) or "Unknown celebration",
            rank=celebration.get("designation"),
            liturgical_season=_season_label(item.get("season")),
            psalter_week=None,
            source_name="source_of_truth",
            source_url="liturgical_calendar_sources",
            source_reference=celebration.get("key"),
            raw_payload=item,
        )
        row["revision_payload"] = {
            "source_of_truth": "liturgical_calendar_sources",
            "source_file": path.name,
            "source_year": payload.get("year"),
            "schemaVersion": payload.get("schemaVersion"),
            "provenance": payload.get("provenance"),
            "validatedThrough": payload.get("validatedThrough"),
            "contentHash": payload.get("contentHash"),
        }
        rows.append(row)

    expected_count = int(payload.get("dayCount") or 0)
    if expected_count and len(rows) != expected_count:
        raise ValueError(f"{path} normalized {len(rows)} rows, expected {expected_count}")

    return rows, payload


def _names_match(source_name: Optional[str], validator_name: Optional[str]) -> bool:
    source_key = _review_key(source_name)
    validator_key = _review_key(validator_name)
    if not source_key or not validator_key:
        return False
    if source_key == validator_key:
        return True

    source_tokens = source_key.split()
    validator_tokens = validator_key.split()
    shorter = source_tokens if len(source_tokens) <= len(validator_tokens) else validator_tokens

    # Avoid false positives such as "Epiphany" matching
    # "Saturday of Christmas Time before Epiphany".
    if len(shorter) < 2:
        return False

    return source_key in validator_key or validator_key in source_key


def _match_result(source: dict[str, Any], validator: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not validator:
        return {"status": "missing", "method": "missing", "similarity": None, "possible_match": False}

    source_name = source.get("celebration_name")
    validator_name = validator.get("celebration_name")
    if _names_match(source_name, validator_name):
        return {
            "status": "matched",
            "method": "normalized",
            "similarity": 1.0,
            "possible_match": False,
        }

    canonical_method = _canonical_alias_match(source, validator_name)
    if canonical_method:
        return {
            "status": "matched",
            "method": canonical_method,
            "similarity": 1.0,
            "possible_match": False,
        }

    similarity = _fuzzy_similarity(source_name, validator_name)
    if similarity >= FUZZY_AUTO_MATCH_THRESHOLD:
        return {
            "status": "matched",
            "method": "fuzzy",
            "similarity": round(similarity, 3),
            "possible_match": False,
        }

    return {
        "status": "mismatched",
        "method": "fuzzy_possible" if similarity >= FUZZY_POSSIBLE_MATCH_THRESHOLD else "mismatched",
        "similarity": round(similarity, 3),
        "possible_match": similarity >= FUZZY_POSSIBLE_MATCH_THRESHOLD,
    }


def _match_status(source: dict[str, Any], validator: Optional[dict[str, Any]]) -> str:
    return str(_match_result(source, validator)["status"])


def _is_simbang_gabi(record: dict[str, Any]) -> bool:
    values = [
        record.get("celebration_name"),
        record.get("source_reference"),
        (record.get("raw_payload") or {}).get("celebration", {}).get("key")
        if isinstance(record.get("raw_payload"), dict)
        else None,
    ]
    haystack = " ".join(str(value or "").lower() for value in values)
    return "simbang gabi" in haystack or "misa de aguinaldo" in haystack or "misa-de-aguinaldo" in haystack


def _overall_validation(gcatholic_status: str, romcal_status: str) -> str:
    if gcatholic_status == "matched" and romcal_status == "matched":
        return "matched_both"
    if gcatholic_status == "matched":
        return "matched_gcatholic_only"
    if romcal_status == "matched":
        return "matched_romcal_only"
    if gcatholic_status == "missing" and romcal_status == "missing":
        return "validator_missing"
    return "mismatched_all"


def _best_match_result(source: dict[str, Any], validators: list[dict[str, Any]]) -> tuple[dict[str, Any], Optional[dict[str, Any]]]:
    if not validators:
        return {"status": "missing", "method": "missing", "similarity": None, "possible_match": False}, None

    best_result: Optional[dict[str, Any]] = None
    best_validator: Optional[dict[str, Any]] = None
    for validator in validators:
        result = _match_result(source, validator)
        if result["status"] == "matched":
            return result, validator
        if best_result is None or (result.get("similarity") or 0) > (best_result.get("similarity") or 0):
            best_result = result
            best_validator = validator

    return best_result or {"status": "mismatched", "method": "mismatched", "similarity": 0.0, "possible_match": False}, best_validator


def _review_note(validation_status: str) -> str:
    notes = {
        "matched_both": "Source of truth matched with both GCatholic and Romcal.",
        "matched_gcatholic_only": "Source of truth matched with GCatholic only; Romcal differs or is missing.",
        "matched_romcal_only": "Source of truth matched with Romcal only; GCatholic differs or is missing.",
        "matched_litcal_only": "Source of truth matched with LitCal only after GCatholic and Romcal did not match.",
        "source_of_truth_only": (
            "Simbang Gabi is trusted from the source of truth; GCatholic/Romcal validation skipped."
        ),
        "mismatched_all": "Source of truth did not match GCatholic, Romcal, or LitCal; needs human review.",
        "validator_missing": "GCatholic and Romcal both have no validator data for this date; needs human review.",
    }
    return notes[validation_status]


def _validation_reason(
    source_name: str,
    gcatholic_name: Optional[str],
    romcal_name: Optional[str],
    litcal_name: Optional[str] = None,
    litcal_result: Optional[dict[str, Any]] = None,
) -> str:
    gcatholic_part = gcatholic_name if gcatholic_name else "missing"
    romcal_part = romcal_name if romcal_name else "missing"
    litcal_part = ""
    if litcal_result:
        litcal_status = litcal_result.get("status")
        litcal_method = litcal_result.get("method")
        if litcal_name:
            litcal_part = f"; LitCal fallback: {litcal_name} ({litcal_status} by {litcal_method})"
        else:
            litcal_part = f"; LitCal fallback: {litcal_status}"
    return (
        f"Source of truth: {source_name}; "
        f"GCatholic: {gcatholic_part}; "
        f"Romcal: {romcal_part}"
        f"{litcal_part}."
    )


def _apply_validator_results(
    records: list[dict[str, Any]],
    gcatholic_by_date: dict[str, dict[str, Any]],
    romcal_by_date: dict[str, dict[str, Any]],
    litcal_by_date: Optional[dict[str, list[dict[str, Any]]]] = None,
) -> None:
    litcal_by_date = litcal_by_date or {}
    for record in records:
        gcatholic = gcatholic_by_date.get(record["date"])
        romcal = romcal_by_date.get(record["date"])
        gcatholic_result = _match_result(record, gcatholic)
        romcal_result = _match_result(record, romcal)
        gcatholic_status = str(gcatholic_result["status"])
        romcal_status = str(romcal_result["status"])
        gcatholic_name = gcatholic.get("celebration_name") if gcatholic else None
        romcal_name = romcal.get("celebration_name") if romcal else None
        is_simbang_gabi = _is_simbang_gabi(record)
        litcal_result: Optional[dict[str, Any]] = None
        litcal: Optional[dict[str, Any]] = None
        litcal_name: Optional[str] = None

        if is_simbang_gabi:
            validation_status = "source_of_truth_only"
        else:
            validation_status = _overall_validation(gcatholic_status, romcal_status)
            if validation_status in {"mismatched_all", "validator_missing"}:
                litcal_result, litcal = _best_match_result(record, litcal_by_date.get(record["date"], []))
                litcal_name = litcal.get("celebration_name") if litcal else None
                if litcal_result["status"] == "matched":
                    validation_status = "matched_litcal_only"

        record["validation_status"] = validation_status
        record["validation_reason"] = (
            f"Source of truth: {record['celebration_name']}; "
            "validation skipped for Simbang Gabi / Misa de Aguinaldo exception."
            if is_simbang_gabi
            else _validation_reason(
                record["celebration_name"],
                gcatholic_name,
                romcal_name,
                litcal_name,
                litcal_result,
            )
        )
        record["gcatholic_match_status"] = gcatholic_status
        record["romcal_match_status"] = romcal_status
        record["litcal_match_status"] = str(litcal_result["status"]) if litcal_result else "not_applied"
        record["gcatholic_celebration_name"] = gcatholic_name
        record["romcal_celebration_name"] = romcal_name
        record["litcal_celebration_name"] = litcal_name
        record["review_status"] = "pending"
        record["review_notes"] = _review_note(validation_status)

        existing_payload = record.get("revision_payload") or {}
        possible_matches = {
            "gcatholic": {
                "celebration_name": gcatholic_name,
                "similarity": gcatholic_result.get("similarity"),
            }
            if gcatholic_result.get("possible_match")
            else None,
            "romcal": {
                "celebration_name": romcal_name,
                "similarity": romcal_result.get("similarity"),
            }
            if romcal_result.get("possible_match")
            else None,
            "litcal": {
                "celebration_name": litcal_name,
                "similarity": litcal_result.get("similarity") if litcal_result else None,
            }
            if litcal_result and litcal_result.get("possible_match")
            else None,
        }
        record["revision_payload"] = {
            **existing_payload,
            "source_of_truth": "liturgical_calendar_sources",
            "source_celebration_name": record["celebration_name"],
            "canonical_key": _canonical_key_for_record(record),
            "gcatholic_celebration_name": gcatholic_name,
            "romcal_celebration_name": romcal_name,
            "gcatholic_result": gcatholic_status,
            "gcatholic_match_method": gcatholic_result.get("method"),
            "gcatholic_similarity": gcatholic_result.get("similarity"),
            "romcal_result": romcal_status,
            "romcal_match_method": romcal_result.get("method"),
            "romcal_similarity": romcal_result.get("similarity"),
            "litcal_celebration_name": litcal_name,
            "litcal_result": litcal_result.get("status") if litcal_result else "not_applied",
            "litcal_match_method": litcal_result.get("method") if litcal_result else "not_applied",
            "litcal_similarity": litcal_result.get("similarity") if litcal_result else None,
            "litcal_fallback_applied": litcal_result is not None,
            "overall_result": validation_status,
            "validation_skipped_reason": "simbang_gabi_source_of_truth" if is_simbang_gabi else None,
            "possible_matches": {k: v for k, v in possible_matches.items() if v},
            "needs_human_review": validation_status in {"mismatched_all", "validator_missing"},
        }


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
        rank=event.get("grade_lcl") or event.get("grade_display") or event.get("grade") or event.get("rank"),
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

    for validator_source, validator_by_date in [
        ("litcal", litcal_by_date),
        ("universalis", universalis_by_date),
    ]:
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
        record["review_notes"] = (
            "No GCatholic, LitCal, or Universalis validator found for this date; needs human review."
        )
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
            f"GCatholic: {gcatholic_celebration_name}"
            if gcatholic_celebration_name
            else f"GCatholic: {gcatholic_result}"
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
                record,
                litcal_by_date,
                universalis_by_date,
                gcatholic_result="validator_missing",
            )
            continue

        source_key = _review_key(record["celebration_name"])
        validator_key = _review_key(validator["celebration_name"])
        if source_key and validator_key and (source_key in validator_key or validator_key in source_key):
            record["review_status"] = "pending"
            record["review_notes"] = (
                "Matched GCatholic validator by normalized celebration name; awaiting human approval."
            )
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
    source_dir: Path = DEFAULT_SOURCE_DIR,
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
        matched_rows: list[dict[str, Any]] = []
        review_rows: list[dict[str, Any]] = []
        report_rows: list[dict[str, Any]] = []

        logger.info(
            "Collecting source-of-truth liturgical calendar %s -> %s from %s",
            start_year,
            end_year,
            source_dir,
        )

        for year in range(start_year, end_year + 1):
            logger.info("Year %s", year)
            source_rows, source_payload = load_source_truth_year(year, source_dir=source_dir)
            if len(source_rows) < 300:
                raise RuntimeError(
                    f"Year {year}: source-of-truth file returned only {len(source_rows)} records, "
                    "expected ~365. Aborting to prevent incomplete data."
                )

            try:
                gcatholic_rows = fetch_gcatholic(year)
                gcatholic_error = None
            except Exception as exc:
                gcatholic_rows = []
                gcatholic_error = f"{type(exc).__name__}: {exc}"
                logger.warning("GCatholic unavailable for %s: %s", year, gcatholic_error)

            gcatholic_by_date = {row["date"]: row for row in gcatholic_rows}

            try:
                romcal_rows = fetch_romcal(year)
                romcal_error = None
            except Exception as exc:
                romcal_rows = []
                romcal_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Romcal unavailable for %s: %s", year, romcal_error)

            if romcal_rows and len(romcal_rows) < 300:
                raise RuntimeError(
                    f"Year {year}: Romcal returned only {len(romcal_rows)} records, "
                    f"expected ~365. Aborting to prevent incomplete data."
                )
            romcal_by_date = {row["date"]: row for row in romcal_rows}

            litcal_rows, litcal_error = fetch_litcal(year)
            if litcal_error:
                logger.warning("%s", litcal_error)
            litcal_by_date: dict[str, list[dict[str, Any]]] = {}
            for row in litcal_rows:
                litcal_by_date.setdefault(row["date"], []).append(row)

            _apply_validator_results(source_rows, gcatholic_by_date, romcal_by_date, litcal_by_date)
            year_matched = [
                row
                for row in source_rows
                if row["validation_status"] in {
                    "matched_both",
                    "matched_gcatholic_only",
                    "matched_romcal_only",
                    "matched_litcal_only",
                    "source_of_truth_only",
                }
            ]
            year_review = [row for row in source_rows if row not in year_matched]
            matched_rows.extend(year_matched)
            review_rows.extend(year_review)

            validation_counts: dict[str, int] = {}
            for row in source_rows:
                status = row["validation_status"]
                validation_counts[status] = validation_counts.get(status, 0) + 1

            report_rows.append(
                {
                    "year": year,
                    "source": "source_of_truth",
                    "source_file": f"{year}.json",
                    "record_count": len(source_rows),
                    "dayCount": source_payload.get("dayCount"),
                    "matched_count": len(year_matched),
                    "review_count": len(year_review),
                    "validation_counts": validation_counts,
                    "error": None,
                }
            )
            report_rows.append(
                {
                    "year": year,
                    "source": "gcatholic",
                    "record_count": len(gcatholic_rows),
                    "validator_only": True,
                    "error": gcatholic_error,
                }
            )
            report_rows.append(
                {
                    "year": year,
                    "source": "romcal",
                    "record_count": len(romcal_rows),
                    "validator_only": True,
                    "error": romcal_error,
                }
            )
            report_rows.append(
                {
                    "year": year,
                    "source": "litcal",
                    "record_count": len(litcal_rows),
                    "validator_only": True,
                    "fallback_only": True,
                    "error": litcal_error,
                }
            )
            time.sleep(0.5)

        generated_at = datetime.now(timezone.utc).isoformat()
        clean_payload = {
            "generated_at": generated_at,
            "start_year": start_year,
            "end_year": end_year,
            "records": matched_rows,
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

        logger.info("Matched rows: %d; review rows: %d", len(matched_rows), len(review_rows))
        return {
            "clean": clean_payload,
            "review": review_payload,
            "report": report_payload,
        }
    finally:
        lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Collect Philippine liturgical calendar reference data")
    parser.add_argument("--start-year", type=int, default=2023)
    parser.add_argument("--end-year", type=int, default=_today().year)
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--source-dir", type=str, default=str(DEFAULT_SOURCE_DIR))
    parser.add_argument(
        "--load",
        action="store_true",
        help="Load clean output into Supabase after collecting",
    )
    parser.add_argument(
        "--load-review",
        action="store_true",
        help="Also load pending review rows into Supabase",
    )
    args = parser.parse_args()

    result = collect(
        start_year=args.start_year,
        end_year=args.end_year,
        out_dir=Path(args.out),
        source_dir=Path(args.source_dir),
    )
    print(
        f"Collected {len(result['clean']['records'])} matched rows and "
        f"{len(result['review']['records'])} review rows."
    )

    if args.load:
        from app.services.liturgical_calendar_loader import load_from_file

        years = list(range(args.start_year, args.end_year + 1))
        run_id = _create_run_record(years)
        loaded = 0
        try:
            loaded = load_from_file(Path(args.out) / "liturgical_calendar_clean.json", run_id=run_id)
            if args.load_review:
                loaded += load_from_file(Path(args.out) / "liturgical_calendar_review.json", run_id=run_id)
            _update_run_record(
                run_id,
                "success",
                len(result["clean"]["records"]),
                len(result["review"]["records"]),
                completed_years=years,
            )
        except Exception as exc:
            _update_run_record(
                run_id,
                "failed",
                len(result["clean"]["records"]),
                len(result["review"]["records"]),
                error_detail=str(exc),
                completed_years=[],
            )
            raise
        print(f"Loaded {loaded} rows into reference.liturgical_calendar")
