"""
Philippine Liturgical Calendar Engine
=====================================
Generates source-derived liturgical calendar rows for future years from the
2023-2032 source-of-truth JSON files.

This module does not replace the historical source files. Instead it:
  1. Learns stable celebration metadata from the historical JSON corpus.
  2. Builds the liturgical backbone for a target year using calendar math.
  3. Applies learned fixed-date and Easter-relative celebrations.
  4. Fills the remaining dates with season-aware weekday/Sunday templates.
  5. Replays known source years to measure how closely the engine reproduces
     the historical source-of-truth calendar before we trust future years.

Usage:
  python -m app.services.liturgical_calendar_engine --year 2033
  python -m app.services.liturgical_calendar_engine --start-year 2033 --end-year 2035
  python -m app.services.liturgical_calendar_engine --replay-start 2023 --replay-end 2032
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "liturgical_calendar_sources"
DEFAULT_OUT_DIR = PROJECT_ROOT / "liturgical_calendar_output" / "engine"
SOURCE_YEAR_START = 2023
SOURCE_YEAR_END = 2032
APPROVED_REVIEW_STATUSES = ("approved", "approved_with_revisions")
ENGINE_SOURCE_NAME = "liturgical_engine"
ENGINE_SOURCE_URL = "engine:approved_db_history"

MANUAL_SPECIAL_KEYS = {
    "ash-wednesday",
    "palm-sunday",
    "holy-thursday",
    "good-friday",
    "holy-saturday",
    "easter-sunday",
    "second-sunday-of-easter",
    "third-sunday-of-easter",
    "fourth-sunday-of-easter",
    "fifth-sunday-of-easter",
    "sixth-sunday-of-easter",
    "pentecost",
    "holy-trinity",
    "corpus-christi",
    "sacred-heart",
    "immaculate-heart-of-mary",
    "mary-mother-of-the-church",
    "ascension",
    "eternal-high-priest",
    "christ-the-king",
    "first-sunday-of-advent",
    "second-sunday-of-advent",
    "third-sunday-of-advent",
    "fourth-sunday-of-advent",
    "epiphany",
    "baptism-of-the-lord",
    "holy-family",
    "misa-de-aguinaldo",
    "santo-nino",
    "saint-joseph-spouse-of-the-blessed-virgin-mary",
    "the-annunciation-of-the-lord",
    "nativity-of-the-lord",
    "sunday-in-ordinary-time",
}

WEEKDAY_NAMES = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}

ORDINAL_WORDS = {
    1: "1st",
    2: "2nd",
    3: "3rd",
    4: "4th",
    5: "5th",
    6: "6th",
    7: "7th",
    8: "8th",
    9: "9th",
    10: "10th",
    11: "11th",
    12: "12th",
    13: "13th",
    14: "14th",
    15: "15th",
    16: "16th",
    17: "17th",
    18: "18th",
    19: "19th",
    20: "20th",
    21: "21st",
    22: "22nd",
    23: "23rd",
    24: "24th",
    25: "25th",
    26: "26th",
    27: "27th",
    28: "28th",
    29: "29th",
    30: "30th",
    31: "31st",
    32: "32nd",
    33: "33rd",
    34: "34th",
}

ORDINAL_PREFIXES = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    11: "eleventh",
    12: "twelfth",
    13: "thirteenth",
    14: "fourteenth",
    15: "fifteenth",
    16: "sixteenth",
    17: "seventeenth",
    18: "eighteenth",
    19: "nineteenth",
    20: "twentieth",
    21: "twenty-first",
    22: "twenty-second",
    23: "twenty-third",
    24: "twenty-fourth",
    25: "twenty-fifth",
    26: "twenty-sixth",
    27: "twenty-seventh",
    28: "twenty-eighth",
    29: "twenty-ninth",
    30: "thirtieth",
    31: "thirty-first",
    32: "thirty-second",
    33: "thirty-third",
    34: "thirty-fourth",
}


@dataclass(frozen=True)
class CelebrationMeta:
    key: str
    title_en: str
    title_tl: str
    designation: str


@dataclass(frozen=True)
class LearnedRule:
    key: str
    title_en: str
    title_tl: str
    designation: str
    rule_type: str
    month_day: Optional[str] = None
    easter_offset: Optional[int] = None


@dataclass(frozen=True)
class YearAnchors:
    year: int
    easter_sunday: date
    ash_wednesday: date
    palm_sunday: date
    holy_thursday: date
    good_friday: date
    holy_saturday: date
    pentecost: date
    first_advent: date
    christ_the_king: date
    epiphany: date
    baptism_of_the_lord: date
    holy_family: date
    santo_nino: date
    ordinary_first_start: date
    ordinary_first_sunday: date
    ordinary_first_last_week: int
    ordinary_second_start: date
    ordinary_second_first_sunday: date
    ordinary_second_start_week: int


@dataclass(frozen=True)
class CorpusInfo:
    source_mode: str
    start_year: int
    end_year: int
    record_count: int


class LiturgicalEngine:
    def __init__(
        self,
        source_dir: Path = DEFAULT_SOURCE_DIR,
        source_rows: Optional[list[dict[str, Any]]] = None,
        corpus_info: Optional[CorpusInfo] = None,
    ):
        self.source_dir = source_dir
        self.source_rows = source_rows or self._load_source_rows_from_files()
        self.corpus_info = corpus_info or CorpusInfo(
            source_mode="filesystem",
            start_year=SOURCE_YEAR_START,
            end_year=SOURCE_YEAR_END,
            record_count=len(self.source_rows),
        )
        self.metadata_by_key = self._build_metadata()
        self.fixed_rules, self.easter_rules = self._build_primary_rules()
        self.option_fixed_rules, self.option_easter_rules = self._build_option_rules()

    @classmethod
    def from_approved_database(
        cls,
        *,
        history_start_year: int = SOURCE_YEAR_START,
        history_end_year: Optional[int] = None,
    ) -> "LiturgicalEngine":
        rows, start_year, end_year = _load_approved_source_rows_from_db(
            history_start_year=history_start_year,
            history_end_year=history_end_year,
        )
        return cls(
            source_rows=rows,
            corpus_info=CorpusInfo(
                source_mode="approved_database",
                start_year=start_year,
                end_year=end_year,
                record_count=len(rows),
            ),
        )

    def _load_source_rows_from_files(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for year in range(SOURCE_YEAR_START, SOURCE_YEAR_END + 1):
            path = self.source_dir / f"{year}.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            for day in payload.get("days", []):
                dt = date.fromisoformat(day["date"])
                rows.append(
                    {
                        "year": year,
                        "date": dt,
                        "month_day": day["date"][5:],
                        "season": day["season"],
                        "celebration": day["celebration"],
                        "options": day.get("options", []),
                        "easter_offset": (dt - _easter_sunday(year)).days,
                    }
                )
        return rows

    def _build_metadata(self) -> dict[str, CelebrationMeta]:
        buckets: dict[str, Counter[tuple[str, str, str]]] = defaultdict(Counter)
        for row in self.source_rows:
            c = row["celebration"]
            buckets[c["key"]][
                (
                    c["title"]["en"],
                    c["title"].get("tl") or c["title"]["en"],
                    c["designation"],
                )
            ] += 10
            for opt in row["options"]:
                buckets[opt["key"]][
                    (
                        opt["title"]["en"],
                        opt["title"].get("tl") or opt["title"]["en"],
                        opt["designation"],
                    )
                ] += 1

        metadata: dict[str, CelebrationMeta] = {}
        for key, counter in buckets.items():
            title_en, title_tl, designation = counter.most_common(1)[0][0]
            metadata[key] = CelebrationMeta(
                key=key,
                title_en=title_en,
                title_tl=title_tl,
                designation=designation,
            )
        return metadata

    def _build_primary_rules(self) -> tuple[dict[str, list[LearnedRule]], dict[int, list[LearnedRule]]]:
        by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self.source_rows:
            key = row["celebration"]["key"]
            if re.search(r"\d{4}-\d{2}-\d{2}$", key):
                continue
            if key in MANUAL_SPECIAL_KEYS:
                continue
            designation = (row["celebration"].get("designation") or "").lower()
            if "proper feast" in designation:
                continue
            by_key[key].append(row)

        fixed: dict[str, list[LearnedRule]] = defaultdict(list)
        easter: dict[int, list[LearnedRule]] = defaultdict(list)

        for key, rows in by_key.items():
            metadata = self.metadata_by_key[key]
            month_days = {row["month_day"] for row in rows}
            offsets = {row["easter_offset"] for row in rows}
            if len(month_days) == 1 and len(rows) >= 2:
                fixed[next(iter(month_days))].append(
                    LearnedRule(
                        key=key,
                        title_en=metadata.title_en,
                        title_tl=metadata.title_tl,
                        designation=metadata.designation,
                        rule_type="fixed",
                        month_day=next(iter(month_days)),
                    )
                )
            elif len(offsets) == 1 and len(rows) >= 3:
                easter[next(iter(offsets))].append(
                    LearnedRule(
                        key=key,
                        title_en=metadata.title_en,
                        title_tl=metadata.title_tl,
                        designation=metadata.designation,
                        rule_type="easter_offset",
                        easter_offset=next(iter(offsets)),
                    )
                )
        return fixed, easter

    def _build_option_rules(self) -> tuple[dict[str, list[LearnedRule]], dict[int, list[LearnedRule]]]:
        option_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self.source_rows:
            for option in row["options"]:
                option_rows[option["key"]].append(
                    {
                        "month_day": row["month_day"],
                        "easter_offset": row["easter_offset"],
                    }
                )

        fixed: dict[str, list[LearnedRule]] = defaultdict(list)
        easter: dict[int, list[LearnedRule]] = defaultdict(list)

        for key, rows in option_rows.items():
            metadata = self.metadata_by_key.get(key)
            if not metadata:
                continue
            month_days = {row["month_day"] for row in rows}
            offsets = {row["easter_offset"] for row in rows}
            if len(month_days) == 1 and len(rows) >= 2:
                fixed[next(iter(month_days))].append(
                    LearnedRule(
                        key=key,
                        title_en=metadata.title_en,
                        title_tl=metadata.title_tl,
                        designation=metadata.designation,
                        rule_type="option_fixed",
                        month_day=next(iter(month_days)),
                    )
                )
            elif len(offsets) == 1 and len(rows) >= 3:
                easter[next(iter(offsets))].append(
                    LearnedRule(
                        key=key,
                        title_en=metadata.title_en,
                        title_tl=metadata.title_tl,
                        designation=metadata.designation,
                        rule_type="option_easter_offset",
                        easter_offset=next(iter(offsets)),
                    )
                )
        return fixed, easter

    def build_year_payload(self, year: int) -> dict[str, Any]:
        anchors = _build_year_anchors(year)
        days = [self._build_day_record(dt, anchors) for dt in _date_range(date(year, 1, 1), date(year, 12, 31))]
        liturgical_years = [_liturgical_year_block(year), _liturgical_year_block(year + 1)]
        payload = {
            "year": year,
            "schemaVersion": "engine-v1",
            "provenance": (
                f"source_derived_from_{self.corpus_info.source_mode}_"
                f"{self.corpus_info.start_year}_{self.corpus_info.end_year}"
            ),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "validatedThrough": str(self.corpus_info.end_year),
            "contentHash": _content_hash(days),
            "dayCount": len(days),
            "liturgicalYears": liturgical_years,
            "days": days,
        }
        return payload

    def _build_day_record(self, dt: date, anchors: YearAnchors) -> dict[str, Any]:
        season = _season_for_date(dt, anchors)
        baseline = _baseline_celebration(dt, anchors, season)
        applied_rule = baseline
        applied_precedence = _precedence(applied_rule["designation"], applied_rule["key"])
        applied_priority = 0

        candidates = list(self.fixed_rules.get(dt.strftime("%m-%d"), []))
        candidates.extend(self.easter_rules.get((dt - anchors.easter_sunday).days, []))
        candidates.extend(_manual_rules_for_date(dt, anchors, self.metadata_by_key))

        for rule in candidates:
            candidate_precedence = _precedence(rule.designation, rule.key)
            candidate_priority = _rule_priority(rule)
            if (candidate_precedence, candidate_priority) > (applied_precedence, applied_priority):
                applied_rule = _rule_to_celebration(rule)
                applied_precedence = candidate_precedence
                applied_priority = candidate_priority

        options = self._build_options(dt, anchors, applied_rule["key"])
        return {
            "date": dt.isoformat(),
            "season": season,
            "celebration": applied_rule,
            "options": options,
        }

    def _build_options(self, dt: date, anchors: YearAnchors, primary_key: str) -> list[dict[str, Any]]:
        rules = list(self.option_fixed_rules.get(dt.strftime("%m-%d"), []))
        rules.extend(self.option_easter_rules.get((dt - anchors.easter_sunday).days, []))

        options: list[dict[str, Any]] = []
        seen: set[str] = set()
        for rule in rules:
            if rule.key == primary_key or rule.key in seen:
                continue
            seen.add(rule.key)
            options.append(_rule_to_celebration(rule))
        return options

    def replay_year(self, year: int) -> dict[str, Any]:
        source_path = self.source_dir / f"{year}.json"
        source_payload = json.loads(source_path.read_text(encoding="utf-8"))
        generated = self.build_year_payload(year)

        mismatch_rows: list[dict[str, Any]] = []
        exact = 0
        for expected, actual in zip(source_payload["days"], generated["days"]):
            problems = []
            if expected["season"] != actual["season"]:
                problems.append("season")
            if expected["celebration"]["key"] != actual["celebration"]["key"]:
                problems.append("celebration_key")
            if expected["celebration"]["title"]["en"] != actual["celebration"]["title"]["en"]:
                problems.append("celebration_name")
            if expected["celebration"]["designation"] != actual["celebration"]["designation"]:
                problems.append("designation")

            if not problems:
                exact += 1
                continue

            mismatch_rows.append(
                {
                    "date": expected["date"],
                    "problems": problems,
                    "expected": {
                        "season": expected["season"],
                        "celebration": expected["celebration"],
                    },
                    "generated": {
                        "season": actual["season"],
                        "celebration": actual["celebration"],
                    },
                }
            )

        total = len(source_payload["days"])
        return {
            "year": year,
            "total_days": total,
            "exact_matches": exact,
            "mismatches": len(mismatch_rows),
            "accuracy_percent": round(exact * 100 / total, 2) if total else 0.0,
            "mismatch_rows": mismatch_rows,
        }


def _should_replace_training_candidate(candidate: dict[str, Any], current: dict[str, Any]) -> bool:
    candidate_source = str(candidate.get("source_name") or "")
    current_source = str(current.get("source_name") or "")

    if candidate_source == "source_of_truth" and current_source != "source_of_truth":
        return True
    if current_source == "source_of_truth" and candidate_source != "source_of_truth":
        return False

    candidate_updated = str(candidate.get("updated_at") or "")
    current_updated = str(current.get("updated_at") or "")
    return candidate_updated > current_updated


def _normalize_db_training_row(record: dict[str, Any]) -> Optional[dict[str, Any]]:
    raw_payload = record.get("raw_payload") or {}
    if not isinstance(raw_payload, dict):
        raw_payload = {}
    raw_celebration = raw_payload.get("celebration") or {}
    if not isinstance(raw_celebration, dict):
        raw_celebration = {}

    raw_date = record.get("date")
    if not raw_date:
        return None
    date_str = str(raw_date)

    celebration_key = record.get("source_reference") or raw_celebration.get("key")
    celebration_name = record.get("celebration_name") or (raw_celebration.get("title") or {}).get("en")
    if not celebration_key or not celebration_name:
        return None

    title_tl = None
    raw_title = raw_celebration.get("title")
    if isinstance(raw_title, dict):
        title_tl = raw_title.get("tl")

    normalized_day = {
        "date": date_str,
        "season": _season_slug(record.get("liturgical_season")),
        "celebration": {
            "key": celebration_key,
            "title": {
                "en": celebration_name,
                "tl": title_tl or celebration_name,
            },
            "designation": record.get("rank") or raw_celebration.get("designation") or "Weekday / feria",
        },
        "options": raw_payload.get("options") if isinstance(raw_payload.get("options"), list) else [],
    }

    parsed_date = date.fromisoformat(date_str)
    return {
        "year": parsed_date.year,
        "date": parsed_date,
        "month_day": date_str[5:],
        "season": normalized_day["season"],
        "celebration": normalized_day["celebration"],
        "options": normalized_day["options"],
        "easter_offset": (parsed_date - _easter_sunday(parsed_date.year)).days,
    }


def _load_approved_source_rows_from_db(
    *,
    history_start_year: int = SOURCE_YEAR_START,
    history_end_year: Optional[int] = None,
) -> tuple[list[dict[str, Any]], int, int]:
    from app.services import analytics_db

    effective_end_year = history_end_year or date.today().year
    approved_rows = analytics_db.fetch_query(
        """
        SELECT date, year, liturgical_season, celebration_name, rank,
               source_name, source_reference, raw_payload, review_status, updated_at
        FROM reference.liturgical_calendar
        WHERE year BETWEEN %s AND %s AND review_status = ANY(%s)
        ORDER BY date, updated_at
        """,
        (history_start_year, effective_end_year, list(APPROVED_REVIEW_STATUSES)),
    )

    if not approved_rows:
        raise RuntimeError(
            "No approved liturgical calendar rows found in the database for engine training."
        )

    by_date: dict[str, dict[str, Any]] = {}
    for record in approved_rows:
        date_key = str(record["date"])
        existing = by_date.get(date_key)
        if existing is None or _should_replace_training_candidate(record, existing):
            by_date[date_key] = record

    rows: list[dict[str, Any]] = []
    years: set[int] = set()
    for date_key in sorted(by_date):
        normalized = _normalize_db_training_row(by_date[date_key])
        if not normalized:
            continue
        rows.append(normalized)
        years.add(normalized["year"])

    if not rows:
        raise RuntimeError("Approved liturgical calendar rows were found, but none could be normalized for training.")

    return rows, min(years), max(years)


def _content_hash(days: list[dict[str, Any]]) -> str:
    payload = json.dumps(days, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _rule_to_celebration(rule: LearnedRule) -> dict[str, Any]:
    return {
        "key": rule.key,
        "title": {
            "en": rule.title_en,
            "tl": rule.title_tl,
        },
        "designation": rule.designation,
    }


def _build_year_anchors(year: int) -> YearAnchors:
    easter = _easter_sunday(year)
    ash = easter - timedelta(days=46)
    palm = easter - timedelta(days=7)
    holy_thursday = easter - timedelta(days=3)
    good_friday = easter - timedelta(days=2)
    holy_saturday = easter - timedelta(days=1)
    pentecost = easter + timedelta(days=49)
    first_advent = _first_sunday_of_advent(year)
    christ_the_king = first_advent - timedelta(days=7)
    epiphany = _epiphany(year)
    baptism = _baptism_of_the_lord(year, epiphany)
    holy_family = _holy_family(year)
    santo_nino = _third_sunday_of_january(year)
    ordinary_first_start = baptism + timedelta(days=1)
    ordinary_first_sunday = _next_sunday(ordinary_first_start)
    ordinary_first_last_week = _ordinary_first_part_week_number(ash - timedelta(days=1), ordinary_first_start, ordinary_first_sunday)
    ordinary_second_start = pentecost + timedelta(days=1)
    ordinary_second_first_sunday = _next_sunday(ordinary_second_start)
    ordinary_second_start_week = 34 - ((first_advent - ordinary_second_start).days // 7)

    return YearAnchors(
        year=year,
        easter_sunday=easter,
        ash_wednesday=ash,
        palm_sunday=palm,
        holy_thursday=holy_thursday,
        good_friday=good_friday,
        holy_saturday=holy_saturday,
        pentecost=pentecost,
        first_advent=first_advent,
        christ_the_king=christ_the_king,
        epiphany=epiphany,
        baptism_of_the_lord=baptism,
        holy_family=holy_family,
        santo_nino=santo_nino,
        ordinary_first_start=ordinary_first_start,
        ordinary_first_sunday=ordinary_first_sunday,
        ordinary_first_last_week=ordinary_first_last_week,
        ordinary_second_start=ordinary_second_start,
        ordinary_second_first_sunday=ordinary_second_first_sunday,
        ordinary_second_start_week=ordinary_second_start_week,
    )


def _manual_rules_for_date(dt: date, anchors: YearAnchors, metadata: dict[str, CelebrationMeta]) -> list[LearnedRule]:
    special_dates: dict[date, str] = {
        anchors.easter_sunday: "easter-sunday",
        anchors.ash_wednesday: "ash-wednesday",
        anchors.palm_sunday: "palm-sunday",
        anchors.holy_thursday: "holy-thursday",
        anchors.good_friday: "good-friday",
        anchors.holy_saturday: "holy-saturday",
        anchors.pentecost: "pentecost",
        anchors.pentecost + timedelta(days=7): "holy-trinity",
        anchors.pentecost + timedelta(days=14): "corpus-christi",
        anchors.pentecost + timedelta(days=19): "sacred-heart",
        anchors.pentecost + timedelta(days=20): "immaculate-heart-of-mary",
        anchors.pentecost + timedelta(days=1): "mary-mother-of-the-church",
        anchors.pentecost + timedelta(days=4): "eternal-high-priest",
        anchors.easter_sunday + timedelta(days=42): "ascension",
        anchors.first_advent: "first-sunday-of-advent",
        anchors.first_advent + timedelta(days=7): "second-sunday-of-advent",
        anchors.first_advent + timedelta(days=14): "third-sunday-of-advent",
        anchors.first_advent + timedelta(days=21): "fourth-sunday-of-advent",
        anchors.christ_the_king: "christ-the-king",
        anchors.epiphany: "epiphany",
        anchors.baptism_of_the_lord: "baptism-of-the-lord",
        anchors.holy_family: "holy-family",
        anchors.santo_nino: "santo-nino",
        date(anchors.year, 1, 1): "mary-mother-of-god",
        date(anchors.year, 12, 25): "nativity-of-the-lord",
    }

    if dt.month == 12 and 16 <= dt.day <= 24 and dt.weekday() != 6:
        special_dates[dt] = "misa-de-aguinaldo"

    saint_joseph = date(anchors.year, 3, 19)
    if saint_joseph.weekday() == 6:
        special_dates[saint_joseph + timedelta(days=1)] = "saint-joseph-spouse-of-the-blessed-virgin-mary"
    else:
        special_dates[saint_joseph] = "saint-joseph-spouse-of-the-blessed-virgin-mary"

    annunciation = date(anchors.year, 3, 25)
    if anchors.holy_thursday <= annunciation <= anchors.holy_saturday:
        special_dates[annunciation] = "the-annunciation-of-the-lord"
    elif anchors.palm_sunday <= annunciation <= anchors.easter_sunday + timedelta(days=7):
        special_dates[anchors.easter_sunday + timedelta(days=8)] = "the-annunciation-of-the-lord"
    else:
        special_dates[annunciation] = "the-annunciation-of-the-lord"

    key = special_dates.get(dt)
    if not key or key not in metadata:
        return []
    meta = metadata[key]
    designation = meta.designation
    if key == "the-annunciation-of-the-lord" and anchors.holy_thursday <= dt <= anchors.holy_saturday:
        designation = "Paschal Triduum"
    return [
        LearnedRule(
            key=meta.key,
            title_en=meta.title_en,
            title_tl=meta.title_tl,
            designation=designation,
            rule_type="manual",
        )
    ]


def _baseline_celebration(dt: date, anchors: YearAnchors, season: str) -> dict[str, Any]:
    if season == "advent":
        if dt.weekday() == 6:
            week = 1 + ((dt - anchors.first_advent).days // 7)
            key = f"{ORDINAL_PREFIXES[week]}-sunday-of-advent"
            title = f"{ORDINAL_WORDS[week]} Sunday of Advent"
            if week == 3:
                title += " (Gaudete Sunday)"
            designation = "Sunday of Advent"
            return _celebration(key, title, designation)
        week = _season_week_by_previous_sunday(dt, anchors.first_advent)
        key = f"{_weekday_slug(dt)}-of-the-{ORDINAL_PREFIXES[week]}-week-of-advent-{dt.isoformat()}"
        title = f"{WEEKDAY_NAMES[dt.weekday()]} of the {ORDINAL_WORDS[week]} Week of Advent"
        return _celebration(key, title, "Weekday / feria")

    if season == "christmas":
        if dt.month == 1:
            if dt == date(dt.year, 1, 2) and dt.weekday() != 6:
                return _celebration(
                    "saints-basil-the-great-and-gregory-nazianzen-bishops-and-doctors",
                    "Saints Basil the Great and Gregory Nazianzen, Bishops and Doctors",
                    "Obligatory Memorial",
                )
            if dt < anchors.epiphany:
                key = f"{_weekday_slug(dt)}-of-christmas-time-before-epiphany-{dt.isoformat()}"
                title = f"{WEEKDAY_NAMES[dt.weekday()]} of Christmas Time before Epiphany"
                return _celebration(key, title, "Weekday / feria")
            if anchors.epiphany < dt < anchors.baptism_of_the_lord:
                key = f"{_weekday_slug(dt)}-of-christmas-time-after-epiphany-{dt.isoformat()}"
                title = f"{WEEKDAY_NAMES[dt.weekday()]} of Christmas Time after Epiphany"
                return _celebration(key, title, "Weekday / feria")
        if dt.month == 12 and dt.day in {29, 30, 31}:
            octave_day = dt.day - 24
            key = f"{_weekday_slug(dt)}-of-christmas-time-{dt.isoformat()}"
            octave_titles = {
                5: "Fifth",
                6: "Sixth",
                7: "Seventh",
            }
            title = f"The {octave_titles[octave_day]} Day within the Octave of the Nativity of the Lord"
            return _celebration(key, title, "Privileged weekday / feria")
        key = f"{_weekday_slug(dt)}-of-christmas-time-{dt.isoformat()}"
        title = f"{WEEKDAY_NAMES[dt.weekday()]} of Christmas Time"
        return _celebration(key, title, "Weekday / feria")

    if season == "lent":
        if dt == anchors.ash_wednesday:
            return _celebration("ash-wednesday", "Ash Wednesday", "Privileged Lenten weekday / feria")
        first_lent_sunday = anchors.ash_wednesday + timedelta(days=(6 - anchors.ash_wednesday.weekday()))
        if dt < first_lent_sunday:
            key = f"{_weekday_slug(dt)}-after-ash-wednesday-{dt.isoformat()}"
            title = f"{WEEKDAY_NAMES[dt.weekday()]} after Ash Wednesday"
            return _celebration(key, title, "Privileged weekday / feria")
        if dt == anchors.palm_sunday:
            return _celebration(
                "palm-sunday",
                "Palm Sunday of the Passion of the Lord",
                "Sunday of Lent / Palm Sunday of the Passion of the Lord",
            )
        if anchors.palm_sunday < dt < anchors.holy_thursday:
            key = f"{_weekday_slug(dt)}-of-holy-week-{dt.isoformat()}"
            title = f"{WEEKDAY_NAMES[dt.weekday()]} of Holy Week"
            return _celebration(key, title, "Privileged weekday of Holy Week / feria")
        if dt.weekday() == 6:
            week = 1 + ((dt - first_lent_sunday).days // 7)
            key = f"{ORDINAL_PREFIXES[week]}-sunday-of-lent"
            title = f"{ORDINAL_WORDS[week]} Sunday of Lent"
            if week == 4:
                title += " (Laetare Sunday)"
            return _celebration(key, title, "Sunday of Lent")
        week = _season_week_by_previous_sunday(dt, first_lent_sunday)
        key = f"{_weekday_slug(dt)}-of-the-{ORDINAL_PREFIXES[week]}-week-of-lent-{dt.isoformat()}"
        title = f"{WEEKDAY_NAMES[dt.weekday()]} of the {ORDINAL_WORDS[week]} Week of Lent"
        return _celebration(key, title, "Privileged weekday / feria")

    if season == "paschal_triduum":
        if dt == anchors.holy_thursday:
            return _celebration("holy-thursday", "Holy Thursday (Mass of the Lord's Supper)", "Paschal Triduum")
        if dt == anchors.good_friday:
            return _celebration("good-friday", "Good Friday of the Passion of the Lord", "Paschal Triduum")
        return _celebration("holy-saturday", "Holy Saturday", "Paschal Triduum")

    if season == "easter":
        if dt == anchors.easter_sunday:
            return _celebration(
                "easter-sunday",
                "Easter Sunday of the Resurrection of the Lord",
                "Solemnity of the Lord",
            )
        if anchors.easter_sunday < dt <= anchors.easter_sunday + timedelta(days=6):
            key = f"{_weekday_slug(dt)}-of-the-first-week-of-easter-{dt.isoformat()}"
            title = f"{WEEKDAY_NAMES[dt.weekday()]} within the Octave of Easter"
            return _celebration(key, title, "Privileged weekday within the Octave of Easter")
        if dt.weekday() == 6:
            week = 1 + ((dt - anchors.easter_sunday).days // 7)
            key = f"{ORDINAL_PREFIXES[week]}-sunday-of-easter"
            title = f"{ORDINAL_WORDS[week]} Sunday of Easter"
            return _celebration(key, title, "Sunday of Easter")
        second_easter_sunday = anchors.easter_sunday + timedelta(days=7)
        week = 2 + (( _previous_sunday(dt) - second_easter_sunday).days // 7)
        key = f"{_weekday_slug(dt)}-of-the-{ORDINAL_PREFIXES[week]}-week-of-easter-{dt.isoformat()}"
        title = f"{WEEKDAY_NAMES[dt.weekday()]} of the {ORDINAL_WORDS[week]} Week of Easter"
        return _celebration(key, title, "Weekday / feria")

    # Ordinary Time
    week = _ordinary_time_week_number(dt, anchors)
    if dt.weekday() == 6:
        return _celebration("sunday-in-ordinary-time", f"{ORDINAL_WORDS[week]} Sunday in Ordinary Time", "Sunday")
    key = f"{_weekday_slug(dt)}-in-ordinary-time-{dt.isoformat()}"
    title = f"{WEEKDAY_NAMES[dt.weekday()]} of the {ORDINAL_WORDS[week]} Week in Ordinary Time"
    return _celebration(key, title, "Weekday / feria")


def _celebration(key: str, title_en: str, designation: str, title_tl: Optional[str] = None) -> dict[str, Any]:
    return {
        "key": key,
        "title": {
            "en": title_en,
            "tl": title_tl or title_en,
        },
        "designation": designation,
    }


def _season_for_date(dt: date, anchors: YearAnchors) -> str:
    if dt <= anchors.baptism_of_the_lord:
        return "christmas"
    if anchors.ordinary_first_start <= dt < anchors.ash_wednesday:
        return "ordinary_time"
    if anchors.ash_wednesday <= dt < anchors.holy_thursday:
        return "lent"
    if anchors.holy_thursday <= dt <= anchors.holy_saturday:
        return "paschal_triduum"
    if anchors.easter_sunday <= dt <= anchors.pentecost:
        return "easter"
    if anchors.ordinary_second_start <= dt < anchors.first_advent:
        return "ordinary_time"
    if anchors.first_advent <= dt <= date(dt.year, 12, 24):
        return "advent"
    return "christmas"


def _season_week_by_previous_sunday(dt: date, first_sunday: date) -> int:
    if dt.weekday() == 6:
        return 1 + ((dt - first_sunday).days // 7)
    return 1 + ((_previous_sunday(dt) - first_sunday).days // 7)


def _ordinary_first_part_week_number(dt: date, ordinary_start: date, first_ordinary_sunday: date) -> int:
    if dt < first_ordinary_sunday:
        return 1
    if dt.weekday() == 6:
        return 2 + ((dt - first_ordinary_sunday).days // 7)
    return 2 + ((_previous_sunday(dt) - first_ordinary_sunday).days // 7)


def _ordinary_time_week_number(dt: date, anchors: YearAnchors) -> int:
    if dt < anchors.ash_wednesday:
        return _ordinary_first_part_week_number(dt, anchors.ordinary_first_start, anchors.ordinary_first_sunday)
    if dt < anchors.first_advent:
        return min(34, anchors.ordinary_second_start_week + ((dt - anchors.ordinary_second_start).days // 7))
    return 34


def _easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _first_sunday_of_advent(year: int) -> date:
    candidate = date(year, 11, 27)
    while candidate.weekday() != 6:
        candidate += timedelta(days=1)
    return candidate


def _epiphany(year: int) -> date:
    candidate = date(year, 1, 2)
    while candidate.weekday() != 6:
        candidate += timedelta(days=1)
    return candidate


def _baptism_of_the_lord(year: int, epiphany: date) -> date:
    if epiphany.day in {7, 8}:
        return epiphany + timedelta(days=1)
    return epiphany + timedelta(days=7)


def _holy_family(year: int) -> date:
    for day in range(26, 32):
        candidate = date(year, 12, day)
        if candidate.weekday() == 6:
            return candidate
    return date(year, 12, 30)


def _third_sunday_of_january(year: int) -> date:
    candidate = date(year, 1, 1)
    while candidate.weekday() != 6:
        candidate += timedelta(days=1)
    return candidate + timedelta(days=14)


def _next_sunday(dt: date) -> date:
    days = (6 - dt.weekday()) % 7
    return dt + timedelta(days=days)


def _previous_sunday(dt: date) -> date:
    return dt - timedelta(days=(dt.weekday() - 6) % 7)


def _weekday_slug(dt: date) -> str:
    return WEEKDAY_NAMES[dt.weekday()].lower()


def _season_slug(value: Optional[str]) -> str:
    normalized = str(value or "").strip().lower().replace(" ", "_")
    mapping = {
        "advent": "advent",
        "christmas": "christmas",
        "ordinary_time": "ordinary_time",
        "ordinarytimefirst": "ordinary_time",
        "ordinarytimesecond": "ordinary_time",
        "lent": "lent",
        "paschal_triduum": "paschal_triduum",
        "paschaltriduum": "paschal_triduum",
        "easter": "easter",
    }
    return mapping.get(normalized, normalized or "ordinary_time")


def _season_display(value: Optional[str]) -> str:
    slug = _season_slug(value)
    mapping = {
        "advent": "Advent",
        "christmas": "Christmas",
        "ordinary_time": "Ordinary Time",
        "lent": "Lent",
        "paschal_triduum": "Paschal Triduum",
        "easter": "Easter",
    }
    return mapping.get(slug, slug.replace("_", " ").title())


def _date_range(start: date, end: date) -> list[date]:
    current = start
    dates: list[date] = []
    while current <= end:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def _precedence(designation: str, key: str) -> int:
    text = designation.lower()
    if key in {"holy-thursday", "good-friday", "holy-saturday"} or "paschal triduum" in text:
        return 100
    if key == "ash-wednesday":
        return 95
    if "solemnity of the lord" in text:
        return 95
    if "solemnity" in text:
        return 92
    if "sunday of advent" in text or "sunday of lent" in text or "sunday of easter" in text:
        return 90
    if "feast of the lord" in text:
        return 85
    if "privileged feast" in text:
        return 80
    if "proper feast" in text or text == "feast":
        return 65
    if "privileged weekday" in text or "holy week" in text:
        return 75
    if text == "sunday":
        return 70
    if "obligatory memorial" in text:
        return 60
    if "optional memorial" in text or "votive mass" in text:
        return 50
    if "commemoration" in text:
        return 45
    return 40


def _rule_priority(rule: LearnedRule) -> int:
    if rule.rule_type == "manual":
        return 3
    if "easter" in rule.rule_type:
        return 2
    return 1


def _sunday_cycle(ending_year: int) -> str:
    mapping = {1: "A", 2: "B", 0: "C"}
    return mapping[ending_year % 3]


def _liturgical_year_block(ending_year: int) -> dict[str, Any]:
    start = _first_sunday_of_advent(ending_year - 1)
    end = _first_sunday_of_advent(ending_year) - timedelta(days=1)
    easter = _easter_sunday(ending_year)
    baptism = _baptism_of_the_lord(ending_year, _epiphany(ending_year))
    ash = easter - timedelta(days=46)
    holy_thursday = easter - timedelta(days=3)
    pentecost = easter + timedelta(days=49)
    return {
        "endingYear": ending_year,
        "startingYear": ending_year - 1,
        "sundayCycle": _sunday_cycle(ending_year),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "seasons": [
            {
                "season": "advent",
                "start": start.isoformat(),
                "end": date(ending_year - 1, 12, 24).isoformat(),
            },
            {
                "season": "christmas",
                "start": date(ending_year - 1, 12, 25).isoformat(),
                "end": baptism.isoformat(),
            },
            {
                "season": "ordinaryTimeFirst",
                "start": (baptism + timedelta(days=1)).isoformat(),
                "end": (ash - timedelta(days=1)).isoformat(),
            },
            {
                "season": "lent",
                "start": ash.isoformat(),
                "end": (holy_thursday - timedelta(days=1)).isoformat(),
            },
            {
                "season": "paschalTriduum",
                "start": holy_thursday.isoformat(),
                "end": easter.isoformat(),
                "triduumDays": {
                    "holy_thursday": holy_thursday.isoformat(),
                    "good_friday": (holy_thursday + timedelta(days=1)).isoformat(),
                    "holy_saturday": (holy_thursday + timedelta(days=2)).isoformat(),
                    "easter_sunday": easter.isoformat(),
                },
            },
            {
                "season": "easter",
                "start": easter.isoformat(),
                "end": pentecost.isoformat(),
            },
            {
                "season": "ordinaryTimeSecond",
                "start": (pentecost + timedelta(days=1)).isoformat(),
                "end": end.isoformat(),
            },
        ],
    }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _generated_day_to_record(day: dict[str, Any], payload: dict[str, Any], corpus_info: CorpusInfo) -> dict[str, Any]:
    parsed = date.fromisoformat(day["date"])
    celebration = day["celebration"]
    return {
        "date": day["date"],
        "year": parsed.year,
        "month": parsed.month,
        "day": parsed.day,
        "weekday": parsed.strftime("%A"),
        "celebration_name": celebration["title"]["en"],
        "rank": celebration["designation"],
        "liturgical_season": _season_display(day["season"]),
        "source_name": ENGINE_SOURCE_NAME,
        "source_url": ENGINE_SOURCE_URL,
        "source_reference": celebration["key"],
        "raw_payload": day,
        "validation_status": "validator_missing",
        "validation_reason": "Validators not yet applied.",
        "gcatholic_match_status": "missing",
        "romcal_match_status": "missing",
        "litcal_match_status": "not_applied",
        "gcatholic_celebration_name": None,
        "romcal_celebration_name": None,
        "litcal_celebration_name": None,
        "review_status": "pending",
        "reviewed_by": None,
        "reviewed_at": None,
        "review_notes": "Awaiting validator extraction and human review.",
        "revision_payload": {
            "engine": {
                "schemaVersion": payload["schemaVersion"],
                "generatedAt": payload["generatedAt"],
                "contentHash": payload["contentHash"],
                "provenance": payload["provenance"],
                "corpus_source_mode": corpus_info.source_mode,
                "corpus_start_year": corpus_info.start_year,
                "corpus_end_year": corpus_info.end_year,
                "corpus_record_count": corpus_info.record_count,
            }
        },
    }


def _normalize_generated_records_for_db(
    payload: dict[str, Any],
    corpus_info: CorpusInfo,
) -> list[dict[str, Any]]:
    return [_generated_day_to_record(day, payload, corpus_info) for day in payload["days"]]


def _apply_generated_validator_results(records: list[dict[str, Any]], year: int) -> None:
    from app.services.liturgical_calendar_collector import (
        _apply_validator_results,
        fetch_gcatholic,
        fetch_litcal,
        fetch_romcal,
    )

    try:
        gcatholic_rows = fetch_gcatholic(year)
    except Exception as exc:
        logger.warning("GCatholic unavailable for %s during engine validation: %s", year, exc)
        gcatholic_rows = []

    try:
        romcal_rows = fetch_romcal(year)
    except Exception as exc:
        logger.warning("Romcal unavailable for %s during engine validation: %s", year, exc)
        romcal_rows = []

    litcal_rows, litcal_error = fetch_litcal(year)
    if litcal_error:
        logger.warning("%s", litcal_error)

    gcatholic_by_date = {row["date"]: row for row in gcatholic_rows}
    romcal_by_date = {row["date"]: row for row in romcal_rows}
    litcal_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in litcal_rows:
        litcal_by_date[row["date"]].append(row)

    _apply_validator_results(records, gcatholic_by_date, romcal_by_date, litcal_by_date)

    for record in records:
        record["validation_reason"] = record["validation_reason"].replace("Source of truth:", "Engine output:")
        if record.get("review_notes"):
            record["review_notes"] = record["review_notes"].replace("Source of truth", "Engine output")
        revision_payload = record.get("revision_payload") or {}
        revision_payload["generated_source"] = ENGINE_SOURCE_NAME
        revision_payload["generated_year"] = year
        record["revision_payload"] = revision_payload


def _year_exists_in_db(year: int, source_name: str = ENGINE_SOURCE_NAME) -> bool:
    from app.services import analytics_db

    row = analytics_db.fetch_query(
        """
        SELECT EXISTS (
          SELECT 1 FROM reference.liturgical_calendar
          WHERE year = %s AND source_name = %s
        ) AS found
        """,
        (year, source_name),
    )
    return bool(row and row[0]["found"])


def generate_and_load_year(
    *,
    target_year: int,
    read_approved_db: bool = False,
    history_start_year: int = SOURCE_YEAR_START,
    history_end_year: Optional[int] = None,
    source_dir: Path = DEFAULT_SOURCE_DIR,
    out_dir: Path = DEFAULT_OUT_DIR,
    write_json: bool = True,
    validate: bool = True,
) -> dict[str, Any]:
    from app.services.liturgical_calendar_collector import _create_run_record, _update_run_record
    from app.services.liturgical_calendar_loader import load_records

    if read_approved_db:
        effective_history_end = history_end_year or (target_year - 1)
        engine = LiturgicalEngine.from_approved_database(
            history_start_year=history_start_year,
            history_end_year=effective_history_end,
        )
    else:
        engine = LiturgicalEngine(source_dir=source_dir)

    payload = engine.build_year_payload(target_year)
    if write_json:
        _write_json(out_dir / f"{target_year}.json", payload)

    records = _normalize_generated_records_for_db(payload, engine.corpus_info)
    if validate:
        _apply_generated_validator_results(records, target_year)

    run_id = _create_run_record([target_year])
    loaded = 0
    try:
        loaded = load_records(records, include_pending=True, run_id=run_id)
        _update_run_record(
            run_id,
            "success",
            len([row for row in records if row["validation_status"] != "mismatched_all"]),
            len([row for row in records if row["review_status"] == "pending"]),
            completed_years=[target_year],
        )
    except Exception as exc:
        _update_run_record(
            run_id,
            "failed",
            0,
            len(records),
            error_detail=str(exc),
            completed_years=[],
        )
        raise

    return {
        "payload": payload,
        "records": records,
        "loaded": loaded,
        "corpus_info": engine.corpus_info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate future liturgical calendar years from source-of-truth JSON")
    parser.add_argument("--year", type=int, help="Generate a single year")
    parser.add_argument("--start-year", type=int, help="Generate a year range (inclusive)")
    parser.add_argument("--end-year", type=int, help="Generate a year range (inclusive)")
    parser.add_argument("--replay-start", type=int, help="Replay-check known source years (inclusive)")
    parser.add_argument("--replay-end", type=int, help="Replay-check known source years (inclusive)")
    parser.add_argument("--source-dir", type=str, default=str(DEFAULT_SOURCE_DIR))
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
    parser.add_argument(
        "--read-approved-db",
        action="store_true",
        help="Build engine patterns from approved/approved_with_revisions database rows instead of local source files.",
    )
    parser.add_argument("--history-start-year", type=int, default=SOURCE_YEAR_START)
    parser.add_argument("--history-end-year", type=int, help="Last historical year to use for DB-backed training.")
    parser.add_argument(
        "--load",
        action="store_true",
        help="Load generated year(s) directly into reference.liturgical_calendar.",
    )
    parser.add_argument(
        "--skip-validators",
        action="store_true",
        help="Do not run GCatholic/Romcal/LitCal validation after generation.",
    )
    parser.add_argument(
        "--preload-next-year",
        action="store_true",
        help="Generate and optionally load next year, but only when the current month is November.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow overwrite-style generation commands to continue when a guard would normally stop them.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    out_dir = Path(args.out)

    if args.preload_next_year:
        today = datetime.now().date()
        if today.month != 11 and not args.force:
            print(f"Skipped preload: current month is {today.month}, not November.")
            return 0
        args.year = today.year + 1
        if _year_exists_in_db(args.year) and not args.force:
            print(f"Skipped preload: {args.year} already exists in reference.liturgical_calendar for {ENGINE_SOURCE_NAME}.")
            return 0

    generated_years: list[int] = []
    loaded_total = 0
    engine: Optional[LiturgicalEngine] = None
    if args.year:
        if args.load:
            result = generate_and_load_year(
                target_year=args.year,
                read_approved_db=args.read_approved_db,
                history_start_year=args.history_start_year,
                history_end_year=args.history_end_year,
                source_dir=Path(args.source_dir),
                out_dir=out_dir,
                write_json=True,
                validate=not args.skip_validators,
            )
            payload = result["payload"]
            loaded_total += result["loaded"]
        else:
            engine = (
                LiturgicalEngine.from_approved_database(
                    history_start_year=args.history_start_year,
                    history_end_year=args.history_end_year or (args.year - 1),
                )
                if args.read_approved_db
                else LiturgicalEngine(source_dir=Path(args.source_dir))
            )
            payload = engine.build_year_payload(args.year)
            _write_json(out_dir / f"{args.year}.json", payload)
        generated_years.append(args.year)
    elif args.start_year and args.end_year:
        engine = (
            LiturgicalEngine.from_approved_database(
                history_start_year=args.history_start_year,
                history_end_year=args.history_end_year or (args.start_year - 1),
            )
            if args.read_approved_db
            else LiturgicalEngine(source_dir=Path(args.source_dir))
        )
        for year in range(args.start_year, args.end_year + 1):
            if args.load:
                result = generate_and_load_year(
                    target_year=year,
                    read_approved_db=args.read_approved_db,
                    history_start_year=args.history_start_year,
                    history_end_year=args.history_end_year or (year - 1),
                    source_dir=Path(args.source_dir),
                    out_dir=out_dir,
                    write_json=True,
                    validate=not args.skip_validators,
                )
                loaded_total += result["loaded"]
            else:
                payload = engine.build_year_payload(year)
                _write_json(out_dir / f"{year}.json", payload)
            generated_years.append(year)

    replay_reports: list[dict[str, Any]] = []
    if args.replay_start and args.replay_end:
        engine = LiturgicalEngine(source_dir=Path(args.source_dir))
        for year in range(args.replay_start, args.replay_end + 1):
            report = engine.replay_year(year)
            replay_reports.append(report)
        _write_json(
            out_dir / "replay_report.json",
            {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "reports": replay_reports,
                "summary": {
                    "years": [report["year"] for report in replay_reports],
                    "total_days": sum(report["total_days"] for report in replay_reports),
                    "exact_matches": sum(report["exact_matches"] for report in replay_reports),
                    "mismatches": sum(report["mismatches"] for report in replay_reports),
                },
            },
        )

    if generated_years:
        print(f"Generated source-derived years: {generated_years}")
    if loaded_total:
        print(f"Loaded {loaded_total} generated rows into reference.liturgical_calendar")
    if replay_reports:
        for report in replay_reports:
            print(
                f"Replay {report['year']}: exact={report['exact_matches']} "
                f"mismatches={report['mismatches']} accuracy={report['accuracy_percent']}%"
            )
    if not generated_years and not replay_reports:
        parser.error("Provide --year, --start-year/--end-year, or --replay-start/--replay-end")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
