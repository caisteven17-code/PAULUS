"""AWS-only read access for analytical weather tables.

The small query-builder surface intentionally matches the legacy diagnostic
scripts so they cannot silently fall back to Supabase.
"""

from __future__ import annotations

import atexit
import re
from dataclasses import dataclass
from typing import Any

from app.config import REFERENCE_SILVER_SCHEMA
from app.services import analytics_db

_WEATHER_TABLES = {
    "weather_observations",
    "weather_rainfall_daily",
    "weather_temperature_daily",
    "weather_wind_daily",
    "weather_monthly_summary",
    "weather_runs",
}
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
if REFERENCE_SILVER_SCHEMA not in {"reference", "reference_silver"}:
    raise ValueError("REFERENCE_SILVER_SCHEMA must be 'reference' or 'reference_silver'")
_WEATHER_SILVER_SCHEMA = REFERENCE_SILVER_SCHEMA
_TABLE_ALIASES = {
    "weather_monthly_summary": "weather_municipality_monthly"
    if _WEATHER_SILVER_SCHEMA == "reference_silver"
    else "weather_monthly_summary"
}


@dataclass
class WeatherResponse:
    data: list[dict[str, Any]]


class AwsWeatherQuery:
    def __init__(self, table: str):
        if table not in _WEATHER_TABLES:
            raise ValueError(f"Unsupported AWS weather table: {table}")
        self.table = table
        self.columns = ["*"]
        self.filters: list[tuple[str, str, Any]] = []
        self.order_columns: list[tuple[str, bool]] = []
        self.offset = 0
        self.limit: int | None = None

    def select(self, columns: str):
        parsed = [column.strip() for column in columns.split(",")]
        if not parsed or any(column != "*" and not _IDENTIFIER.fullmatch(column) for column in parsed):
            raise ValueError("Weather select contains an invalid column")
        self.columns = parsed
        return self

    def _filter(self, column: str, operator: str, value: Any):
        if not _IDENTIFIER.fullmatch(column):
            raise ValueError("Weather filter contains an invalid column")
        self.filters.append((column, operator, value))
        return self

    def eq(self, column: str, value: Any):
        return self._filter(column, "=", value)

    def gte(self, column: str, value: Any):
        return self._filter(column, ">=", value)

    def lte(self, column: str, value: Any):
        return self._filter(column, "<=", value)

    def order(self, column: str, desc: bool = False):
        if not _IDENTIFIER.fullmatch(column):
            raise ValueError("Weather order contains an invalid column")
        self.order_columns.append((column, desc))
        return self

    def range(self, start: int, end: int):
        if start < 0 or end < start:
            raise ValueError("Invalid weather query range")
        self.offset = start
        self.limit = end - start + 1
        return self

    def execute(self) -> WeatherResponse:
        select_sql = ", ".join("*" if column == "*" else f'"{column}"' for column in self.columns)
        physical_table = _TABLE_ALIASES.get(self.table, self.table)
        statement = f'SELECT {select_sql} FROM "{_WEATHER_SILVER_SCHEMA}"."{physical_table}"'
        params: list[Any] = []
        if self.filters:
            statement += " WHERE " + " AND ".join(f'"{column}" {operator} %s' for column, operator, _ in self.filters)
            params.extend(value for _, _, value in self.filters)
        if self.order_columns:
            statement += " ORDER BY " + ", ".join(
                f'"{column}" {"DESC" if desc else "ASC"}' for column, desc in self.order_columns
            )
        if self.limit is not None:
            statement += " LIMIT %s OFFSET %s"
            params.extend((self.limit, self.offset))
        return WeatherResponse(analytics_db.fetch_query(statement, params))


def get_table(schema: str, table: str) -> AwsWeatherQuery:
    if schema not in {"reference", "reference_silver"}:
        raise ValueError("Weather repository only exposes the configured AWS Silver schema")
    return AwsWeatherQuery(table)


def fetch_all(table: str, columns: list[str] | tuple[str, ...] | str = "*") -> list[dict[str, Any]]:
    selected = columns if isinstance(columns, str) else ",".join(columns)
    return get_table("reference", table).select(selected).execute().data


atexit.register(analytics_db.close_pool)
