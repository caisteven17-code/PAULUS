"""Prepare and validate read-only parish monthly Gold candidates.

Usage:
  python -m app.services.parish_gold_candidates prepare
  python -m app.services.parish_gold_candidates validate
  python -m app.services.parish_gold_candidates status
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from psycopg.types.json import Jsonb

from app.services import analytics_db
from app.services.silver_etl import _record_check
from app.services.supabase_client import get_table
from app.services.warehouse_etl import _fetch_all

_FORMULA_VERSION = "parish_monthly_v4"
_BASE_FORMULA_VERSION = "parish_monthly_v1"
_PIPELINE_NAME = "parish_gold_candidate_validation"
_RATE_KEY = "sacraments net of diocese share rate"
_RATE_METRIC = "sacraments_parish_share_rate"
_MASS_TAX_METRIC = "mass_collections_tax_rate"
_APPROVED_FALLBACK_RATE = Decimal("0.30")
_PILOT_INSTITUTION_ID = "aec32176-c296-4928-880f-180985f9a376"


def _upsert_in_chunks(
    schema: str,
    table: str,
    rows: list[dict[str, Any]],
    conflict_cols: str,
    *,
    chunk_size: int = 250,
) -> int:
    for offset in range(0, len(rows), chunk_size):
        analytics_db.upsert_rows(
            schema,
            table,
            rows[offset : offset + chunk_size],
            conflict_cols=conflict_cols,
        )
    return len(rows)


def sync_parish_dimensions() -> dict[str, int]:
    # The dedicated institution synchronizer owns this dimension. Gold must
    # never repopulate it from the temporary AWS operational mirror.
    institutions = analytics_db.fetch_query(
        """
        SELECT institution_id::text AS id, institution_key, institution_code,
               institution_name AS name, institution_type, vicariate, district,
               cluster, class, latitude, longitude
        FROM shared_analytics.dim_institutions
        WHERE institution_type = 'parish' AND is_active = true
        ORDER BY institution_id
        """
    )
    details = _fetch_all(
        "parishes",
        "details",
        {"deleted_at": None},
        order_by="institution_id",
    )
    details_by_institution = {str(row["institution_id"]): row for row in details}
    parish_rows = []
    for institution in institutions:
        institution_id = str(institution["id"])
        detail = details_by_institution.get(institution_id, {})
        assigned_priest_id = detail.get("assigned_priest_id")
        parish_rows.append(
            {
                "institution_key": institution["institution_key"],
                "institution_code": institution.get("institution_code"),
                "institution_name": institution.get("name"),
                "vicariate": institution.get("vicariate"),
                "district": institution.get("district"),
                "cluster": institution.get("cluster"),
                "assigned_priest_source_id": assigned_priest_id,
                "latitude": institution.get("latitude"),
                "longitude": institution.get("longitude"),
            }
        )
    _upsert_in_chunks(
        "parish_analytics",
        "dim_parishes",
        parish_rows,
        "institution_key",
    )

    accounts = _fetch_all(
        "parishes",
        "iafr_account_titles",
        {"deleted_at": None},
        order_by="id",
    )
    account_rows = [
        {
            "source_account_title_id": row["id"],
            "section_code": row["section_code"],
            "subsection_code": row.get("subsection_code"),
            "account_code": row["account_code"],
            "account_name": row["account_name"],
            "account_type": row["account_type"],
            "classification": row.get("classification"),
            "is_arancel_related": row["section_code"] == "A",
            "is_mass_collection": "mass_collection" in str(row.get("classification") or "").lower()
            or row.get("subsection_code") == "B.1",
            "is_remittable": row["account_type"] == "remittance",
        }
        for row in accounts
    ]
    _upsert_in_chunks(
        "parish_analytics",
        "dim_iafr_account",
        account_rows,
        "source_account_title_id",
    )
    return {
        "shared_parishes": len(institutions),
        "parish_dimensions": len(parish_rows),
        "account_dimensions": len(account_rows),
    }


def _fetch_committed_push_rows() -> list[dict[str, Any]]:
    batches = _fetch_all(
        "operations",
        "financial_push_batches",
        {"status": "committed", "deleted_at": None},
        order_by="id",
    )
    rows: list[dict[str, Any]] = []
    for batch in batches:
        offset = 0
        while True:
            response = (
                get_table("operations", "financial_push_rows")
                .select("id,push_batch_id,financial_record_id,reporting_year,reporting_month,cleaned_values,updated_at")
                .eq("push_batch_id", batch["id"])
                .eq("validation_status", "committed")
                .is_("deleted_at", "null")
                .order("id")
                .range(offset, offset + 249)
                .execute()
            )
            page = response.data or []
            rows.extend(page)
            if len(page) < 250:
                break
            offset += 250
    return rows


def _latest_committed_push_rows() -> dict[str, dict[str, Any]]:
    latest_by_record: dict[str, dict[str, Any]] = {}
    for row in _fetch_committed_push_rows():
        record_id = row.get("financial_record_id")
        if not record_id:
            continue
        current = latest_by_record.get(str(record_id))
        if current is None or str(row.get("updated_at") or "") > str(current.get("updated_at") or ""):
            latest_by_record[str(record_id)] = row
    return latest_by_record


def recover_parish_share_rates(latest_by_record: dict[str, dict[str, Any]] | None = None) -> dict[str, int]:
    latest_by_record = latest_by_record or _latest_committed_push_rows()

    silver_records = analytics_db.fetch_query(
        """
        SELECT source_record_id::text AS id
        FROM parish_silver.financial_records
        ORDER BY source_record_id
        """
    )
    now = datetime.now(timezone.utc)
    counts: Counter[str] = Counter()
    metric_rows = []
    for record in silver_records:
        source_record_id = record["id"]
        push_row = latest_by_record.get(source_record_id)
        raw_rate = (push_row.get("cleaned_values") or {}).get(_RATE_KEY) if push_row else None
        parsed_rate = Decimal(str(raw_rate or 0))
        if parsed_rate > 0:
            metric_value = parsed_rate
            resolution_method = "source_json"
        else:
            metric_value = _APPROVED_FALLBACK_RATE
            resolution_method = "approved_fallback"
        counts[resolution_method] += 1
        metric_rows.append(
            {
                "source_record_id": source_record_id,
                "metric_name": _RATE_METRIC,
                "metric_value": metric_value,
                "resolution_method": resolution_method,
                "source_json_key": _RATE_KEY if push_row else None,
                "source_push_row_id": push_row.get("id") if push_row else None,
                "source_push_batch_id": push_row.get("push_batch_id") if push_row else None,
                "source_updated_at": push_row.get("updated_at") if push_row else None,
                "extracted_at": now,
            }
        )
    _upsert_in_chunks(
        "parish_silver",
        "financial_memo_metrics",
        metric_rows,
        "source_record_id,metric_name",
    )
    return {"total": len(metric_rows), **dict(counts)}


def recover_mass_collection_tax_rates(
    latest_by_record: dict[str, dict[str, Any]] | None = None,
) -> dict[str, int]:
    latest_by_record = latest_by_record or _latest_committed_push_rows()
    silver_records = analytics_db.fetch_query(
        """
        SELECT source_record_id::text AS id, reporting_year
        FROM parish_silver.financial_records
        WHERE reporting_year BETWEEN 2023 AND 2025
        ORDER BY source_record_id
        """
    )
    now = datetime.now(timezone.utc)
    counts: Counter[str] = Counter()
    metric_rows = []
    for record in silver_records:
        source_record_id = record["id"]
        push_row = latest_by_record.get(source_record_id)
        cleaned_values = (push_row.get("cleaned_values") or {}) if push_row else {}
        candidates = [
            (key, Decimal(str(value)))
            for key, value in cleaned_values.items()
            if key.lower().endswith("tax rate")
            and value is not None
            and Decimal("0") <= Decimal(str(value)) <= Decimal("1")
        ]
        distinct_values = {value for _, value in candidates}
        if not candidates:
            counts["missing"] += 1
            continue
        if len(distinct_values) > 1:
            counts["conflicting"] += 1
            continue
        source_key, metric_value = next(
            ((key, value) for key, value in candidates if key.lower() == "tax rate"),
            candidates[0],
        )
        counts["source_json"] += 1
        metric_rows.append(
            {
                "source_record_id": source_record_id,
                "metric_name": _MASS_TAX_METRIC,
                "metric_value": metric_value,
                "resolution_method": "source_json",
                "source_json_key": source_key,
                "source_push_row_id": push_row.get("id") if push_row else None,
                "source_push_batch_id": push_row.get("push_batch_id") if push_row else None,
                "source_updated_at": push_row.get("updated_at") if push_row else None,
                "extracted_at": now,
            }
        )
    if counts["missing"] or counts["conflicting"]:
        raise RuntimeError(f"Mass collection tax-rate recovery failed: {dict(counts)}")
    analytics_db.execute(
        "DELETE FROM parish_silver.financial_memo_metrics WHERE metric_name = %s",
        (_MASS_TAX_METRIC,),
    )
    _upsert_in_chunks(
        "parish_silver",
        "financial_memo_metrics",
        metric_rows,
        "source_record_id,metric_name",
    )
    return {"total": len(metric_rows), **dict(counts)}


def recover_record_memo_metrics(source_record_id: str) -> dict[str, Any]:
    push_rows = (
        get_table("operations", "financial_push_rows")
        .select("id,push_batch_id,financial_record_id,reporting_year,cleaned_values,updated_at")
        .eq("financial_record_id", source_record_id)
        .eq("validation_status", "committed")
        .is_("deleted_at", "null")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    push_row = push_rows[0] if push_rows else None
    silver_rows = analytics_db.fetch_query(
        "SELECT reporting_year FROM parish_silver.financial_records WHERE source_record_id = %s",
        (source_record_id,),
    )
    if not silver_rows:
        raise ValueError(f"Silver financial record not found: {source_record_id}")
    reporting_year = int(silver_rows[0]["reporting_year"])
    cleaned_values = (push_row.get("cleaned_values") or {}) if push_row else {}
    now = datetime.now(timezone.utc)
    rows = []

    parish_rate = Decimal(str(cleaned_values.get(_RATE_KEY) or 0))
    rows.append(
        {
            "source_record_id": source_record_id,
            "metric_name": _RATE_METRIC,
            "metric_value": parish_rate if parish_rate > 0 else _APPROVED_FALLBACK_RATE,
            "resolution_method": "source_json" if parish_rate > 0 else "approved_fallback",
            "source_json_key": _RATE_KEY if push_row else None,
            "source_push_row_id": push_row.get("id") if push_row else None,
            "source_push_batch_id": push_row.get("push_batch_id") if push_row else None,
            "source_updated_at": push_row.get("updated_at") if push_row else None,
            "extracted_at": now,
        }
    )

    tax_status = "not_applicable"
    if 2023 <= reporting_year <= 2025:
        tax_candidates = [
            (key, Decimal(str(value)))
            for key, value in cleaned_values.items()
            if key.lower().endswith("tax rate")
            and value is not None
            and Decimal("0") <= Decimal(str(value)) <= Decimal("1")
        ]
        distinct_tax_values = {value for _, value in tax_candidates}
        if len(distinct_tax_values) == 1:
            source_key, tax_rate = next(
                ((key, value) for key, value in tax_candidates if key.lower() == "tax rate"),
                tax_candidates[0],
            )
            rows.append(
                {
                    "source_record_id": source_record_id,
                    "metric_name": _MASS_TAX_METRIC,
                    "metric_value": tax_rate,
                    "resolution_method": "source_json",
                    "source_json_key": source_key,
                    "source_push_row_id": push_row.get("id") if push_row else None,
                    "source_push_batch_id": push_row.get("push_batch_id") if push_row else None,
                    "source_updated_at": push_row.get("updated_at") if push_row else None,
                    "extracted_at": now,
                }
            )
            tax_status = "source_json"
        elif len(distinct_tax_values) > 1:
            tax_status = "conflicting"
        else:
            tax_status = "missing"
    _upsert_in_chunks(
        "parish_silver",
        "financial_memo_metrics",
        rows,
        "source_record_id,metric_name",
    )
    return {"source_record_id": source_record_id, "metrics_upserted": len(rows), "mass_tax_status": tax_status}


def prepare() -> dict[str, Any]:
    latest_by_record = _latest_committed_push_rows()
    return {
        "dimensions": sync_parish_dimensions(),
        "rates": recover_parish_share_rates(latest_by_record),
        "mass_tax_rates": recover_mass_collection_tax_rates(latest_by_record),
        "gold_facts": status()["gold_facts"],
    }


def _validation_cohort() -> list[str]:
    rows = analytics_db.fetch_query(
        """
        WITH counts AS (
          SELECT institution_id, count(*) AS records
          FROM parish_silver.financial_records
          GROUP BY institution_id
        )
        SELECT institution_id::text AS id
        FROM counts
        ORDER BY
          CASE
            WHEN institution_id = %s THEN 0
            WHEN records < 60 THEN 1
            ELSE 2
          END,
          institution_id
        """,
        (_PILOT_INSTITUTION_ID,),
    )
    incomplete = [row["id"] for row in rows if row["id"] != _PILOT_INSTITUTION_ID][0:2]
    complete = analytics_db.fetch_query(
        """
        SELECT institution_id::text AS id
        FROM parish_silver.financial_records
        WHERE institution_id <> %s
        GROUP BY institution_id
        HAVING count(*) = 60
        ORDER BY institution_id
        LIMIT 2
        """,
        (_PILOT_INSTITUTION_ID,),
    )
    return list(dict.fromkeys([_PILOT_INSTITUTION_ID, *incomplete, *(row["id"] for row in complete)]))


def _start_validation_run(cohort: list[str]) -> str:
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, 'dry_run', %s)
        RETURNING run_id
        """,
        (_PIPELINE_NAME, Jsonb({"formula_version": _FORMULA_VERSION, "institution_ids": cohort})),
    )
    if not row:
        raise RuntimeError("Could not create Gold candidate validation run")
    return str(row["run_id"])


def validate() -> dict[str, Any]:
    cohort = _validation_cohort()
    run_id = _start_validation_run(cohort)
    checks: list[tuple[str, Any, Any]] = []
    totals = analytics_db.fetch_query(
        """
        SELECT
          (SELECT count(*) FROM parish_silver.financial_records) AS silver_records,
          (SELECT count(*) FROM parish_analytics.vw_parish_monthly_financial_candidates) AS candidates,
          (SELECT count(*) FROM parish_silver.financial_memo_metrics
             WHERE metric_name = 'sacraments_parish_share_rate') AS rates,
          (SELECT count(*) FROM parish_silver.financial_records
             WHERE reporting_year BETWEEN 2023 AND 2025) AS expected_mass_tax_rates,
          (SELECT count(*) FROM parish_silver.financial_memo_metrics
             WHERE metric_name = 'mass_collections_tax_rate') AS mass_tax_rates,
          (SELECT count(*) FROM parish_analytics.vw_parish_monthly_financial_candidates
             WHERE parish_key IS NULL) AS missing_parish_keys,
          (SELECT count(*)
             FROM parish_silver.financial_records fr
             LEFT JOIN parish_silver.financial_memo_metrics mm
               ON mm.source_record_id = fr.source_record_id
              AND mm.metric_name = 'mass_collections_tax_rate'
            WHERE fr.reporting_year BETWEEN 2023 AND 2025
              AND mm.source_record_id IS NULL) AS missing_candidate_mass_tax_rates,
          (SELECT count(*) FROM parish_analytics.fact_parish_monthly_financials) AS gold_facts,
          (SELECT count(*) FROM parish_analytics.fact_parish_financial_breakdowns) AS gold_breakdowns,
          (SELECT count(*) FROM warehouse_control.parish_metric_account_rules
             WHERE formula_version = 'parish_monthly_v4'
               AND metric_name = 'total_remittance') AS remittance_rule_count,
          (SELECT count(*)
             FROM warehouse_control.parish_metric_account_rules rules
             JOIN parish_analytics.dim_iafr_account account
               ON account.account_code LIKE 'F.2.%'
              AND (rules.account_code = account.account_code
                   OR (rules.account_code_regex IS NOT NULL
                       AND account.account_code ~ rules.account_code_regex))
            WHERE rules.formula_version = 'parish_monthly_v4'
              AND rules.metric_name = 'total_remittance') AS remittance_bishop_rule_count
        """
    )[0]
    checks.extend(
        [
            ("candidate_record_count", totals["silver_records"], totals["candidates"]),
            ("candidate_rate_count", totals["silver_records"], totals["rates"]),
            ("candidate_mass_tax_rate_count", totals["expected_mass_tax_rates"], totals["mass_tax_rates"]),
            ("candidate_missing_mass_tax_rates", 0, totals["missing_candidate_mass_tax_rates"]),
            ("candidate_missing_parish_keys", 0, totals["missing_parish_keys"]),
            ("gold_monthly_fact_stop_gate", 0, totals["gold_facts"]),
            ("gold_breakdown_stop_gate", 0, totals["gold_breakdowns"]),
            ("total_remittance_rule_count", 3, totals["remittance_rule_count"]),
            ("total_remittance_excludes_bishop_share", 0, totals["remittance_bishop_rule_count"]),
        ]
    )
    formula_mismatches = analytics_db.fetch_query(
        """
        WITH other_collection_gross AS (
          SELECT l.source_record_id, SUM(l.amount)::numeric(14, 2) AS amount
          FROM parish_silver.financial_line_items l
          JOIN parish_silver.financial_records fr
            ON fr.source_record_id = l.source_record_id
          JOIN warehouse_control.parish_metric_account_rules rules
            ON rules.formula_version = %s
           AND rules.metric_name = 'collections_other_95'
           AND fr.reporting_year BETWEEN rules.effective_start_year AND rules.effective_end_year
           AND (
             rules.account_code = l.account_code
             OR (rules.account_code_regex IS NOT NULL AND l.account_code ~ rules.account_code_regex)
           )
          GROUP BY l.source_record_id
        ), expected_remittance AS (
          SELECT l.source_record_id,
                 SUM(l.amount * rules.multiplier)::numeric(14, 2) AS amount
          FROM parish_silver.financial_line_items l
          JOIN parish_silver.financial_records fr
            ON fr.source_record_id = l.source_record_id
          JOIN warehouse_control.parish_metric_account_rules rules
            ON rules.formula_version = %s
           AND rules.metric_name = 'total_remittance'
           AND fr.reporting_year BETWEEN rules.effective_start_year AND rules.effective_end_year
           AND (
             rules.account_code = l.account_code
             OR (rules.account_code_regex IS NOT NULL AND l.account_code ~ rules.account_code_regex)
           )
          GROUP BY l.source_record_id
        ), candidates AS (
          SELECT
            c.*,
            CASE
              WHEN c.reporting_year BETWEEN 2023 AND 2025 THEN
                (
                  v1.collections_mass
                  - (v1.collections_mass * mt.metric_value)::numeric(14, 2)
                )::numeric(14, 2)
              ELSE v1.collections_mass::numeric(14, 2)
            END AS expected_collections_mass,
            mt.metric_value AS mass_tax_rate,
            (
              COALESCE(g.amount, 0)
              - (
                  COALESCE(g.amount, 0)
                  * CASE WHEN c.reporting_year BETWEEN 2023 AND 2025 THEN 0.05 ELSE 0 END
                )::numeric(14, 2)
            )::numeric(14, 2) AS expected_collections_other_net,
            COALESCE(r.amount, 0)::numeric(14, 2) AS expected_total_remittance
          FROM parish_analytics.vw_parish_monthly_financial_candidates c
          JOIN parish_analytics.vw_parish_monthly_financial_candidates_v1 v1
            ON v1.source_record_id = c.source_record_id
          LEFT JOIN parish_silver.financial_memo_metrics mt
            ON mt.source_record_id = c.source_record_id
           AND mt.metric_name = 'mass_collections_tax_rate'
          LEFT JOIN other_collection_gross g ON g.source_record_id = c.source_record_id
          LEFT JOIN expected_remittance r ON r.source_record_id = c.source_record_id
        )
        SELECT count(*) AS rows
        FROM candidates c
        WHERE c.expenses_parish IS DISTINCT FROM (
                c.expenses_parish_salaries_wages_benefits
              + c.expenses_parish_government_contributions
              + c.expenses_parish_utilities
              + c.expenses_parish_communications
              + c.expenses_parish_other_rectory
            )::numeric(14, 2)
           OR (c.reporting_year BETWEEN 2023 AND 2025
               AND c.mass_tax_rate NOT BETWEEN 0 AND 1)
           OR c.collections_mass IS DISTINCT FROM c.expected_collections_mass
           OR c.total_remittance IS DISTINCT FROM c.expected_total_remittance
           OR c.total_expenses IS DISTINCT FROM
              (c.expenses_pastoral_mass_stipend + c.expenses_parish)::numeric(14, 2)
           OR c.total_collections IS DISTINCT FROM (
                c.sacraments_parish_share
              + c.sacraments_over_above_confirmation_incl
              + c.collections_mass
              + c.expected_collections_other_net
              + c.collections_other_receipts
            )::numeric(14, 2)
           OR c.net_receipts_deficit IS DISTINCT FROM
              (c.total_collections - c.total_expenses)::numeric(14, 2)
           OR c.pastoral_parish_fund_total_net_receipts_deficit IS DISTINCT FROM (
                c.net_receipts_deficit
              + c.mass_intentions_not_claimed_by_parish_priest
              - c.special_collections
            )::numeric(14, 2)
        """,
        (_BASE_FORMULA_VERSION, _FORMULA_VERSION),
    )[0]["rows"]
    checks.append(("candidate_formula_arithmetic", 0, formula_mismatches))
    allocation_conflicts = analytics_db.fetch_query(
        """
        WITH years AS (SELECT generate_series(2021, 2025)::smallint AS year),
        account_codes AS (
          SELECT DISTINCT account_code FROM parish_silver.financial_line_items
          WHERE account_code IS NOT NULL
        ),
        allocations AS (
          SELECT y.year, a.account_code, count(DISTINCT r.metric_name) AS metrics
          FROM years y
          CROSS JOIN account_codes a
          JOIN warehouse_control.parish_metric_account_rules r
            ON r.formula_version = %s
           AND y.year BETWEEN r.effective_start_year AND r.effective_end_year
           AND (r.account_code = a.account_code
                OR (r.account_code_regex IS NOT NULL AND a.account_code ~ r.account_code_regex))
           AND r.metric_name IN ('collections_mass', 'collections_other_95', 'collections_other_receipts')
          GROUP BY y.year, a.account_code
          HAVING count(DISTINCT r.metric_name) > 1
        )
        SELECT count(*) AS rows FROM allocations
        """,
        (_BASE_FORMULA_VERSION,),
    )[0]["rows"]
    checks.append(("candidate_collection_allocation_conflicts", 0, allocation_conflicts))
    cohort_counts = analytics_db.fetch_query(
        """
        SELECT reporting_year, count(*) AS records,
               count(*) FILTER (WHERE calculation_status = 'failed') AS failed
        FROM parish_analytics.vw_parish_monthly_financial_candidates
        WHERE institution_id = ANY(%s::uuid[])
        GROUP BY reporting_year ORDER BY reporting_year
        """,
        (cohort,),
    )
    cohort_silver_count = analytics_db.fetch_query(
        """
        SELECT count(*) AS rows FROM parish_silver.financial_records
        WHERE institution_id = ANY(%s::uuid[])
        """,
        (cohort,),
    )[0]["rows"]
    cohort_candidate_count = sum(int(row["records"]) for row in cohort_counts)
    cohort_failed = sum(int(row["failed"]) for row in cohort_counts)
    checks.append(("candidate_cohort_record_count", cohort_silver_count, cohort_candidate_count))
    checks.append(("candidate_cohort_failed_rows", 0, cohort_failed))

    passed = True
    for name, expected, actual in checks:
        passed = _record_check(run_id, name, expected, actual) and passed
    rate_methods = analytics_db.fetch_query(
        """
        SELECT metric_name, resolution_method, count(*) AS rows
        FROM parish_silver.financial_memo_metrics
        WHERE metric_name IN ('sacraments_parish_share_rate', 'mass_collections_tax_rate')
        GROUP BY metric_name, resolution_method ORDER BY metric_name, resolution_method
        """
    )
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s, extracted_count = %s, loaded_count = 0,
            failed_count = %s, table_counts = %s, finished_at = now(),
            error_summary = %s
        WHERE run_id = %s
        """,
        (
            "succeeded" if passed else "failed",
            cohort_candidate_count,
            0 if passed else 1,
            Jsonb({"cohort_candidates": cohort_candidate_count, "checks": len(checks)}),
            None if passed else "One or more candidate validation checks failed",
            run_id,
        ),
    )
    result = {
        "run_id": run_id,
        "passed": passed,
        "cohort": cohort,
        "cohort_by_year": cohort_counts,
        "rate_methods": rate_methods,
        "checks": [{"name": n, "expected": str(e), "actual": str(a)} for n, e, a in checks],
    }
    if not passed:
        raise RuntimeError(f"Gold candidate validation failed: {result}")
    return result


def status() -> dict[str, Any]:
    return analytics_db.fetch_query(
        """
        SELECT
          (SELECT count(*) FROM shared_analytics.dim_institutions
             WHERE institution_type = 'parish') AS shared_parishes,
          (SELECT count(*) FROM parish_analytics.dim_parishes) AS parish_dimensions,
          (SELECT count(*) FROM parish_analytics.dim_iafr_account) AS account_dimensions,
          (SELECT count(*) FROM parish_silver.financial_memo_metrics
             WHERE metric_name = 'sacraments_parish_share_rate') AS rates,
          (SELECT count(*) FROM parish_silver.financial_memo_metrics
             WHERE metric_name = 'mass_collections_tax_rate') AS mass_tax_rates,
          (SELECT count(*) FROM parish_analytics.vw_parish_monthly_financial_candidates) AS candidates,
          (SELECT count(*) FROM parish_analytics.fact_parish_monthly_financials) AS gold_facts,
          (SELECT count(*) FROM parish_analytics.fact_parish_financial_breakdowns) AS gold_breakdowns
        """
    )[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare and validate parish Gold candidates")
    parser.add_argument("mode", choices=("prepare", "validate", "status"))
    args = parser.parse_args()
    try:
        if args.mode == "prepare":
            result = prepare()
        elif args.mode == "validate":
            result = validate()
        else:
            result = status()
        print(result)
    finally:
        analytics_db.close_pool()


if __name__ == "__main__":
    main()
