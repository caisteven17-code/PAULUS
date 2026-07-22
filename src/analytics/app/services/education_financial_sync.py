"""Direct Supabase -> AWS Silver/Gold synchronization for schools/seminaries."""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from psycopg.types.json import Jsonb

from app.config import WAREHOUSE_EDUCATION_POLL_SECONDS
from app.services import analytics_db
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)
PAGE_SIZE = 500
MONTHS = {name: number for number, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
)}


@dataclass(frozen=True)
class EntityConfig:
    entity_type: str
    source_schema: str
    silver_schema: str
    analytics_schema: str
    dimension_table: str
    dimension_key: str
    person_column: str
    account_dimension_table: str
    account_dimension_key: str
    fact_table: str
    financial_fields: tuple[str, ...]


CONFIGS = {
    "school": EntityConfig(
        "school", "schools", "school_silver", "school_analytics",
        "dim_schools", "school_key", "principal", "dim_school_fs_account",
        "school_account_key", "fact_school_monthly_financials",
        (
            "tuition_revenues", "miscellaneous_fees", "other_income", "subsidy_inflow",
            "faculty_payroll", "admin_staff_payroll", "utilities",
            "facilities_maintenance", "supplies", "other_expenses", "net_receipts",
        ),
    ),
    "seminary": EntityConfig(
        "seminary", "seminaries", "seminary_silver", "seminary_analytics",
        "dim_seminaries", "seminary_key", "rector", "dim_seminary_fs_account",
        "seminary_account_key", "fact_seminary_monthly_financials",
        (
            "donations", "seminary_fees", "mass_collections", "other_sources",
            "subsidy_from_rbscp", "total_expenses", "net_surplus", "dependency_ratio",
        ),
    ),
}


def _fetch_all(schema: str, table: str, columns: str = "*", **filters: Any) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = get_table(schema, table).select(columns)
        for column, value in filters.items():
            query = query.is_(column, "null") if value is None else query.eq(column, value)
        batch = query.range(offset, offset + PAGE_SIZE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def _pipeline_name(config: EntityConfig) -> str:
    return f"{config.entity_type}_silver_direct_v1"


def _watermark(config: EntityConfig) -> tuple[str, str]:
    rows = analytics_db.fetch_query(
        """
        SELECT last_source_updated_at, last_source_id::text AS last_source_id
        FROM warehouse_control.etl_watermarks
        WHERE pipeline_name=%s AND source_schema=%s AND source_table='financial_records'
        """,
        (_pipeline_name(config), config.source_schema),
    )
    if not rows:
        return "1970-01-01T00:00:00+00:00", "00000000-0000-0000-0000-000000000000"
    updated = rows[0]["last_source_updated_at"]
    return (updated.isoformat() if hasattr(updated, "isoformat") else str(updated), rows[0]["last_source_id"])


def _set_watermark(config: EntityConfig, updated_at: str, source_id: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_watermarks
          (pipeline_name,source_schema,source_table,last_source_updated_at,last_source_id)
        VALUES (%s,%s,'financial_records',%s,%s)
        ON CONFLICT (pipeline_name,source_schema,source_table) DO UPDATE
        SET last_source_updated_at=EXCLUDED.last_source_updated_at,
            last_source_id=EXCLUDED.last_source_id,updated_at=now()
        """,
        (_pipeline_name(config), config.source_schema, updated_at, source_id),
    )


def _fetch_changes(config: EntityConfig) -> list[dict]:
    watermark_time, watermark_id = _watermark(config)
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            get_table(config.source_schema, "financial_records")
            .select("*")
            .gte("updated_at", watermark_time)
            .order("updated_at")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute().data or []
        )
        rows.extend(
            row for row in batch
            if (str(row.get("updated_at") or ""), str(row["id"])) > (watermark_time, watermark_id)
        )
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return sorted(rows, key=lambda row: (str(row.get("updated_at") or ""), str(row["id"])))


def sync_dimensions(config: EntityConfig) -> dict[str, int]:
    institutions = analytics_db.fetch_query(
        """
        SELECT institution_key,institution_id::text AS institution_id
        FROM shared_analytics.dim_institutions
        WHERE institution_type=%s AND is_active=true
        """,
        (config.entity_type,),
    )
    person_source_column = "principal_id" if config.entity_type == "school" else "rector_id"
    details = _fetch_all(
        config.source_schema,
        "details",
        f"institution_id,{person_source_column},deleted_at",
    )
    details_by_id = {str(row["institution_id"]): row for row in details if row.get("deleted_at") is None}
    dimension_rows = []
    for institution in institutions:
        detail = details_by_id.get(str(institution["institution_id"]), {})
        source_person = detail.get(person_source_column)
        dimension_rows.append({
            "institution_key": institution["institution_key"],
            config.person_column: str(source_person) if source_person else None,
        })
    if dimension_rows:
        analytics_db.upsert_rows(
            config.analytics_schema, config.dimension_table, dimension_rows, "institution_key"
        )

    accounts = _fetch_all(config.source_schema, "fs_account_titles")
    account_rows = [{
        "source_account_title_id": row["id"],
        "section_code": row.get("section_code"),
        "subsection_code": row.get("subsection_code"),
        "account_code": row["account_code"],
        "account_name": row["account_name"],
        "account_type": row["account_type"],
        "classification": row.get("classification") or row.get("receipt_category") or row.get("expense_category"),
    } for row in accounts if row.get("deleted_at") is None and row.get("is_active", True)]
    if account_rows:
        analytics_db.upsert_rows(
            config.analytics_schema, config.account_dimension_table,
            account_rows, "source_account_title_id"
        )
    return {"dimensions": len(dimension_rows), "accounts": len(account_rows)}


def _dimension_keys(config: EntityConfig, institution_id: str) -> tuple[int, int]:
    rows = analytics_db.fetch_query(
        f"""
        SELECT institution.institution_key,entity.{config.dimension_key}
        FROM shared_analytics.dim_institutions institution
        JOIN {config.analytics_schema}.{config.dimension_table} entity
          ON entity.institution_key=institution.institution_key
        WHERE institution.institution_id=%s
        """,
        (institution_id,),
    )
    if not rows:
        raise RuntimeError(f"Missing {config.entity_type} analytical dimension")
    return int(rows[0]["institution_key"]), int(rows[0][config.dimension_key])


def _submission_key(source_batch_id: str | None) -> int | None:
    if not source_batch_id:
        return None
    rows = analytics_db.fetch_query(
        "SELECT submission_key FROM shared_analytics.dim_submission WHERE submission_batch_id=%s",
        (source_batch_id,),
    )
    return int(rows[0]["submission_key"]) if rows else None


def _gold_payload(config: EntityConfig, source: dict, entity_key: int, date_key: int) -> dict:
    values = {field: source.get(field) or 0 for field in config.financial_fields}
    if config.entity_type == "school":
        values["total_inflow"] = sum(values[field] for field in (
            "tuition_revenues", "miscellaneous_fees", "other_income", "subsidy_inflow"
        ))
        values["total_outflow"] = sum(values[field] for field in (
            "faculty_payroll", "admin_staff_payroll", "utilities",
            "facilities_maintenance", "supplies", "other_expenses"
        ))
    return {
        config.dimension_key: entity_key,
        "date_key": date_key,
        "submission_key": _submission_key(source.get("submission_batch_id")),
        **values,
    }


def sync_record(config: EntityConfig, source: dict) -> dict[str, int]:
    month = MONTHS[source["month"]]
    year = int(source["year"])
    institution_key, entity_key = _dimension_keys(config, str(source["institution_id"]))
    active = bool(source.get("is_current_version", True)) and source.get("deleted_at") is None
    payload = {field: source.get(field) for field in config.financial_fields}
    record_key = analytics_db.upsert_row(
        config.silver_schema,
        "financial_records",
        {
            "source_record_id": source["id"],
            "institution_key": institution_key,
            "source_institution_id": source["institution_id"],
            "source_submission_batch_id": source.get("submission_batch_id"),
            "reporting_year": year,
            "reporting_month": month,
            "source_status": source.get("status"),
            "source_version_no": source.get("version_no"),
            "is_current_version": active,
            "financial_payload": Jsonb(payload),
            "source_updated_at": source.get("updated_at"),
            "source_deleted_at": source.get("deleted_at"),
            "warehouse_updated_at": datetime.now().astimezone(),
        },
        "source_record_id",
        returning="record_key",
    )

    lines = _fetch_all(config.source_schema, "fs_line_items", financial_record_id=source["id"])
    analytics_db.execute(
        f"DELETE FROM {config.silver_schema}.financial_line_items WHERE record_key=%s",
        (record_key,),
    )
    line_rows = [{
        "source_line_item_id": line["id"], "record_key": record_key,
        "source_account_title_id": line.get("account_title_id"),
        "section_code": line.get("section_code"), "subsection_code": line.get("subsection_code"),
        "item_code": line.get("item_code"), "item_label": line["item_label"],
        "item_type": line.get("item_type"), "amount": line.get("amount") or 0,
        "source_updated_at": line.get("updated_at"), "source_deleted_at": line.get("deleted_at"),
    } for line in lines if line.get("deleted_at") is None]
    if line_rows:
        analytics_db.upsert_rows(config.silver_schema, "financial_line_items", line_rows, "source_line_item_id")

    date_key = year * 100 + month
    breakdown_table = f"fact_{config.entity_type}_financial_breakdowns"
    submission_key = _submission_key(source.get("submission_batch_id"))
    analytics_db.execute(
        f"DELETE FROM {config.analytics_schema}.{breakdown_table} "
        f"WHERE {config.dimension_key}=%s AND date_key=%s",
        (entity_key, date_key),
    )
    if active:
        analytics_db.upsert_row(
            config.analytics_schema, config.fact_table,
            _gold_payload(config, source, entity_key, date_key),
            f"{config.dimension_key},date_key",
        )
        analytics_db.execute(
            f"""
            INSERT INTO {config.analytics_schema}.{breakdown_table}
              ({config.dimension_key},date_key,submission_key,{config.account_dimension_key},amount)
            SELECT %s,%s,%s,account.{config.account_dimension_key},sum(line.amount)
            FROM {config.silver_schema}.financial_line_items line
            JOIN {config.analytics_schema}.{config.account_dimension_table} account
              ON account.source_account_title_id=line.source_account_title_id
            WHERE line.record_key=%s AND line.source_deleted_at IS NULL
            GROUP BY account.{config.account_dimension_key}
            ON CONFLICT ({config.dimension_key},date_key,{config.account_dimension_key})
            DO UPDATE SET amount=EXCLUDED.amount,submission_key=EXCLUDED.submission_key
            """,
            (entity_key, date_key, submission_key, record_key),
        )
    else:
        analytics_db.execute(
            f"DELETE FROM {config.analytics_schema}.{config.fact_table} WHERE {config.dimension_key}=%s AND date_key=%s",
            (entity_key, date_key),
        )
    return {"records": 1, "line_items": len(line_rows), "gold": int(active)}


def run_once(entity_type: str) -> dict[str, Any]:
    config = CONFIGS[entity_type]
    dimensions = sync_dimensions(config)
    results = []
    for source in _fetch_changes(config):
        results.append(sync_record(config, source))
        _set_watermark(config, source["updated_at"], source["id"])
    return {"entity_type": entity_type, **dimensions, "changes": len(results)}


async def run_forever(stop_event) -> None:
    while not stop_event.is_set():
        for entity_type in CONFIGS:
            try:
                await asyncio.to_thread(run_once, entity_type)
            except Exception:
                logger.exception("%s financial synchronization failed", entity_type)
                analytics_db.discard_pool()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=WAREHOUSE_EDUCATION_POLL_SECONDS)
        except TimeoutError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("entity_type", choices=tuple(CONFIGS))
    args = parser.parse_args()
    try:
        print(run_once(args.entity_type))
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
