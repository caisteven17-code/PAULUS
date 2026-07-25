"""Transactional Phase 5E loader for parish monthly Gold facts.

Usage:
  python -m app.services.parish_gold_loader pilot
  python -m app.services.parish_gold_loader backfill
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.services import analytics_db

_PIPELINE_NAME = "parish_gold_phase_5e"
_FORMULA_VERSION = "parish_monthly_v4"
_DEFAULT_PILOT_INSTITUTION_ID = "aec32176-c296-4928-880f-180985f9a376"

# Postgres advisory lock, shared by every load()/refresh_incremental() call —
# from this process, a teammate's separate machine, or a scheduled job. Only
# one of these expensive gold_load_scope computations may run at a time,
# database-wide; a second overlapping invocation skips instead of piling on
# a duplicate 30s+ query. Transaction-scoped (pg_try_advisory_xact_lock), so
# it releases automatically at commit/rollback — it can never be left stuck
# even if the owning process is killed outright, unlike a manual lock/unlock
# pair. Observed live: 3 concurrent copies of this exact query, each held
# for 30-90+ seconds, exhausting the warehouse read pool for every other
# request while they ran.
_GOLD_LOAD_LOCK_KEY = 8234509127


class _LoadAlreadyRunning(Exception):
    """Raised internally when the advisory lock is already held elsewhere —
    caught separately from real failures so a skipped run is recorded as
    'skipped', not 'failed'."""


@dataclass(frozen=True)
class Check:
    name: str
    expected: int
    actual: int
    status: str = "passed"

    @classmethod
    def exact(cls, name: str, expected: int, actual: int) -> "Check":
        return cls(name, expected, actual, "passed" if expected == actual else "failed")


def _start_run(
    mode: str,
    institution_ids: list[str] | None,
    *,
    scope_extra: dict[str, Any] | None = None,
) -> str:
    scope = {
        "formula_version": _FORMULA_VERSION,
        "institution_ids": institution_ids or "all",
        "approved_warning_policy": "approved_fallback_allowed",
    }
    scope.update(scope_extra or {})
    row = analytics_db.execute_returning_one(
        """
        INSERT INTO warehouse_control.etl_runs (pipeline_name, run_mode, scope)
        VALUES (%s, %s, %s)
        RETURNING run_id
        """,
        (
            _PIPELINE_NAME,
            mode,
            Jsonb(scope),
        ),
        pool=analytics_db.get_etl_pool(),
    )
    if not row:
        raise RuntimeError("Could not create Phase 5E ETL run")
    return str(row["run_id"])


def _record_results(run_id: str, checks: list[Check]) -> None:
    with analytics_db.get_etl_pool().connection() as conn:
        with conn.cursor() as cur:
            for check in checks:
                cur.execute(
                    """
                    INSERT INTO warehouse_control.etl_reconciliation_results (
                      run_id, check_name, source_value, target_value,
                      difference_value, status, details
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        run_id,
                        check.name,
                        str(check.expected),
                        str(check.actual),
                        str(check.actual - check.expected),
                        check.status,
                        Jsonb({"formula_version": _FORMULA_VERSION}),
                    ),
                )
        conn.commit()


def _finish_run(
    run_id: str,
    *,
    status: str,
    candidate_count: int = 0,
    monthly_count: int = 0,
    breakdown_count: int = 0,
    failed_count: int = 0,
    error_summary: str | None = None,
) -> None:
    analytics_db.execute(
        """
        UPDATE warehouse_control.etl_runs
        SET status = %s,
            extracted_count = %s,
            loaded_count = %s,
            failed_count = %s,
            table_counts = %s,
            error_summary = %s,
            finished_at = now()
        WHERE run_id = %s
        """,
        (
            status,
            candidate_count,
            monthly_count + breakdown_count,
            failed_count,
            Jsonb(
                {
                    "monthly_facts": monthly_count,
                    "breakdown_facts": breakdown_count,
                }
            ),
            error_summary,
            run_id,
        ),
        pool=analytics_db.get_etl_pool(),
    )


def _record_failure(run_id: str, message: str) -> None:
    analytics_db.execute(
        """
        INSERT INTO warehouse_control.etl_failures (
          run_id, source_schema, source_table, error_code, error_message
        )
        VALUES (%s, 'parish_analytics',
                'vw_parish_monthly_financial_candidates',
                'GOLD_LOAD_ROLLBACK', %s)
        """,
        (run_id, message[:2000]),
        pool=analytics_db.get_etl_pool(),
    )


def _create_scope(cur, institution_ids: list[str] | None) -> int:
    if institution_ids:
        cur.execute(
            """
            CREATE TEMP TABLE gold_load_scope ON COMMIT DROP AS
            SELECT *
            FROM parish_analytics.vw_parish_monthly_financial_candidates
            WHERE institution_id = ANY(%s::uuid[])
              AND calculation_status IN ('passed', 'warning')
            """,
            (institution_ids,),
        )
    else:
        cur.execute(
            """
            CREATE TEMP TABLE gold_load_scope ON COMMIT DROP AS
            SELECT *
            FROM parish_analytics.vw_parish_monthly_financial_candidates
            WHERE calculation_status IN ('passed', 'warning')
            """
        )
    cur.execute("SELECT count(*) AS rows FROM gold_load_scope")
    return int(cur.fetchone()["rows"])


def _create_grain_scope(cur, grains: list[tuple[int, int]]) -> int:
    cur.execute(
        """
        CREATE TEMP TABLE gold_refresh_grains (
          parish_key integer NOT NULL,
          date_key integer NOT NULL,
          PRIMARY KEY (parish_key, date_key)
        ) ON COMMIT DROP
        """
    )
    cur.executemany(
        """
        INSERT INTO gold_refresh_grains (parish_key, date_key)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        grains,
    )
    cur.execute(
        """
        CREATE TEMP TABLE gold_load_scope ON COMMIT DROP AS
        SELECT candidate.*
        FROM parish_analytics.vw_parish_monthly_financial_candidates candidate
        JOIN gold_refresh_grains grain
          ON grain.parish_key = candidate.parish_key
         AND grain.date_key = candidate.date_key
        WHERE candidate.calculation_status IN ('passed', 'warning')
        """
    )
    cur.execute("SELECT count(*) AS rows FROM gold_load_scope")
    return int(cur.fetchone()["rows"])


def _delete_refresh_grains(cur) -> None:
    cur.execute(
        """
        DELETE FROM parish_analytics.fact_parish_financial_breakdowns fact
        USING gold_refresh_grains grain
        WHERE fact.parish_key = grain.parish_key
          AND fact.date_key = grain.date_key
        """
    )
    cur.execute(
        """
        DELETE FROM parish_analytics.fact_parish_monthly_financials fact
        USING gold_refresh_grains grain
        WHERE fact.parish_key = grain.parish_key
          AND fact.date_key = grain.date_key
          AND NOT EXISTS (
            SELECT 1
            FROM gold_load_scope candidate
            WHERE candidate.parish_key = grain.parish_key
              AND candidate.date_key = grain.date_key
          )
        """
    )


def _preflight(cur) -> list[Check]:
    cur.execute(
        """
        SELECT
          count(*) FILTER (WHERE parish_key IS NULL OR date_key IS NULL) AS missing_keys,
          count(*) - count(DISTINCT (parish_key, date_key)) AS duplicate_grain,
          count(*) FILTER (WHERE submission_key IS NULL) AS missing_submission_keys,
          count(*) FILTER (WHERE formula_version <> %s) AS wrong_formula_version,
          count(*) FILTER (WHERE calculation_status NOT IN ('passed', 'warning')) AS invalid_status
        FROM gold_load_scope
        """,
        (_FORMULA_VERSION,),
    )
    row = cur.fetchone()
    cur.execute(
        """
        SELECT count(*) AS rows
        FROM gold_load_scope s
        JOIN parish_silver.financial_line_items l
          ON l.source_record_id = s.source_record_id
        LEFT JOIN parish_analytics.dim_iafr_account a
          ON a.source_account_title_id = l.source_account_title_id
        WHERE a.iafr_account_key IS NULL
        """
    )
    unmapped = int(cur.fetchone()["rows"])
    return [
        Check.exact("scope_missing_dimension_keys", 0, int(row["missing_keys"])),
        Check.exact("scope_duplicate_parish_month_grain", 0, int(row["duplicate_grain"])),
        Check.exact("scope_wrong_formula_version", 0, int(row["wrong_formula_version"])),
        Check.exact("scope_invalid_calculation_status", 0, int(row["invalid_status"])),
        Check.exact("scope_unmapped_breakdown_lines", 0, unmapped),
        Check(
            "scope_nullable_submission_keys_approved",
            int(row["missing_submission_keys"]),
            int(row["missing_submission_keys"]),
            "warning" if row["missing_submission_keys"] else "passed",
        ),
    ]


def _load_monthly(cur) -> int:
    cur.execute(
        """
        INSERT INTO parish_analytics.fact_parish_monthly_financials (
          parish_key, date_key, submission_key,
          sacraments_arancel_confirmation_incl, sacraments_parish_share,
          sacraments_over_above_confirmation_incl, collections_mass,
          collections_other_receipts, total_collections, collection_other,
          expenses_pastoral_mass_stipend, expenses_parish, total_expenses,
          net_receipts_deficit, mass_intentions_not_claimed_by_parish_priest,
          mass_intentions_claimed_by_parish_priest, special_collections,
          pastoral_parish_fund_total_net_receipts_deficit, total_remittance,
          expenses_parish_salaries_wages_benefits,
          expenses_parish_government_contributions,
          expenses_parish_utilities, expenses_parish_communications,
          expenses_parish_other_rectory
        )
        SELECT
          parish_key, date_key, submission_key,
          sacraments_arancel_confirmation_incl, sacraments_parish_share,
          sacraments_over_above_confirmation_incl, collections_mass,
          collections_other_receipts, total_collections, collection_other,
          expenses_pastoral_mass_stipend, expenses_parish, total_expenses,
          net_receipts_deficit, mass_intentions_not_claimed_by_parish_priest,
          mass_intentions_claimed_by_parish_priest, special_collections,
          pastoral_parish_fund_total_net_receipts_deficit, total_remittance,
          expenses_parish_salaries_wages_benefits,
          expenses_parish_government_contributions,
          expenses_parish_utilities, expenses_parish_communications,
          expenses_parish_other_rectory
        FROM gold_load_scope
        ON CONFLICT (parish_key, date_key) DO UPDATE SET
          submission_key = EXCLUDED.submission_key,
          sacraments_arancel_confirmation_incl = EXCLUDED.sacraments_arancel_confirmation_incl,
          sacraments_parish_share = EXCLUDED.sacraments_parish_share,
          sacraments_over_above_confirmation_incl = EXCLUDED.sacraments_over_above_confirmation_incl,
          collections_mass = EXCLUDED.collections_mass,
          collections_other_receipts = EXCLUDED.collections_other_receipts,
          total_collections = EXCLUDED.total_collections,
          collection_other = EXCLUDED.collection_other,
          expenses_pastoral_mass_stipend = EXCLUDED.expenses_pastoral_mass_stipend,
          expenses_parish = EXCLUDED.expenses_parish,
          total_expenses = EXCLUDED.total_expenses,
          net_receipts_deficit = EXCLUDED.net_receipts_deficit,
          mass_intentions_not_claimed_by_parish_priest = EXCLUDED.mass_intentions_not_claimed_by_parish_priest,
          mass_intentions_claimed_by_parish_priest = EXCLUDED.mass_intentions_claimed_by_parish_priest,
          special_collections = EXCLUDED.special_collections,
          pastoral_parish_fund_total_net_receipts_deficit = EXCLUDED.pastoral_parish_fund_total_net_receipts_deficit,
          total_remittance = EXCLUDED.total_remittance,
          expenses_parish_salaries_wages_benefits = EXCLUDED.expenses_parish_salaries_wages_benefits,
          expenses_parish_government_contributions = EXCLUDED.expenses_parish_government_contributions,
          expenses_parish_utilities = EXCLUDED.expenses_parish_utilities,
          expenses_parish_communications = EXCLUDED.expenses_parish_communications,
          expenses_parish_other_rectory = EXCLUDED.expenses_parish_other_rectory
        """
    )
    return cur.rowcount


def _load_breakdowns(cur) -> int:
    cur.execute(
        """
        DELETE FROM parish_analytics.fact_parish_financial_breakdowns f
        USING gold_load_scope s
        WHERE f.parish_key = s.parish_key
          AND f.date_key = s.date_key
        """
    )
    cur.execute(
        """
        INSERT INTO parish_analytics.fact_parish_financial_breakdowns (
          parish_key, date_key, submission_key, iafr_account_key, amount
        )
        SELECT
          s.parish_key,
          s.date_key,
          s.submission_key,
          a.iafr_account_key,
          SUM(l.amount)::numeric(14, 2)
        FROM gold_load_scope s
        JOIN parish_silver.financial_line_items l
          ON l.source_record_id = s.source_record_id
        JOIN parish_analytics.dim_iafr_account a
          ON a.source_account_title_id = l.source_account_title_id
        GROUP BY s.parish_key, s.date_key, s.submission_key, a.iafr_account_key
        """
    )
    return cur.rowcount


def _reconcile(cur, candidate_count: int) -> list[Check]:
    cur.execute(
        """
        SELECT count(*) AS rows
        FROM parish_analytics.fact_parish_monthly_financials f
        JOIN gold_load_scope s
          ON s.parish_key = f.parish_key AND s.date_key = f.date_key
        """
    )
    monthly_count = int(cur.fetchone()["rows"])
    cur.execute(
        """
        SELECT count(*) AS rows
        FROM gold_load_scope s
        JOIN parish_analytics.fact_parish_monthly_financials f
          ON f.parish_key = s.parish_key AND f.date_key = s.date_key
        WHERE f.submission_key IS DISTINCT FROM s.submission_key
           OR f.sacraments_arancel_confirmation_incl IS DISTINCT FROM s.sacraments_arancel_confirmation_incl
           OR f.sacraments_parish_share IS DISTINCT FROM s.sacraments_parish_share
           OR f.sacraments_over_above_confirmation_incl IS DISTINCT FROM s.sacraments_over_above_confirmation_incl
           OR f.collections_mass IS DISTINCT FROM s.collections_mass
           OR f.collections_other_receipts IS DISTINCT FROM s.collections_other_receipts
           OR f.total_collections IS DISTINCT FROM s.total_collections
           OR f.collection_other IS DISTINCT FROM s.collection_other
           OR f.expenses_pastoral_mass_stipend IS DISTINCT FROM s.expenses_pastoral_mass_stipend
           OR f.expenses_parish IS DISTINCT FROM s.expenses_parish
           OR f.total_expenses IS DISTINCT FROM s.total_expenses
           OR f.net_receipts_deficit IS DISTINCT FROM s.net_receipts_deficit
           OR f.mass_intentions_not_claimed_by_parish_priest IS DISTINCT FROM s.mass_intentions_not_claimed_by_parish_priest
           OR f.mass_intentions_claimed_by_parish_priest IS DISTINCT FROM s.mass_intentions_claimed_by_parish_priest
           OR f.special_collections IS DISTINCT FROM s.special_collections
           OR f.pastoral_parish_fund_total_net_receipts_deficit IS DISTINCT FROM s.pastoral_parish_fund_total_net_receipts_deficit
           OR f.total_remittance IS DISTINCT FROM s.total_remittance
           OR f.expenses_parish_salaries_wages_benefits IS DISTINCT FROM s.expenses_parish_salaries_wages_benefits
           OR f.expenses_parish_government_contributions IS DISTINCT FROM s.expenses_parish_government_contributions
           OR f.expenses_parish_utilities IS DISTINCT FROM s.expenses_parish_utilities
           OR f.expenses_parish_communications IS DISTINCT FROM s.expenses_parish_communications
           OR f.expenses_parish_other_rectory IS DISTINCT FROM s.expenses_parish_other_rectory
        """
    )
    monthly_mismatches = int(cur.fetchone()["rows"])
    cur.execute(
        """
        WITH expected AS (
          SELECT s.parish_key, s.date_key, a.iafr_account_key,
                 SUM(l.amount)::numeric(14, 2) AS amount
          FROM gold_load_scope s
          JOIN parish_silver.financial_line_items l
            ON l.source_record_id = s.source_record_id
          JOIN parish_analytics.dim_iafr_account a
            ON a.source_account_title_id = l.source_account_title_id
          GROUP BY s.parish_key, s.date_key, a.iafr_account_key
        ), actual AS (
          SELECT f.parish_key, f.date_key, f.iafr_account_key, f.amount
          FROM parish_analytics.fact_parish_financial_breakdowns f
          JOIN gold_load_scope s
            ON s.parish_key = f.parish_key AND s.date_key = f.date_key
        ), compared AS (
          SELECT
            count(e.parish_key) AS expected_rows,
            count(a.parish_key) AS actual_rows,
            count(*) FILTER (
              WHERE e.amount IS DISTINCT FROM a.amount
                 OR e.parish_key IS NULL OR a.parish_key IS NULL
            ) AS mismatches
          FROM expected e
          FULL OUTER JOIN actual a
            ON a.parish_key = e.parish_key
           AND a.date_key = e.date_key
           AND a.iafr_account_key = e.iafr_account_key
        )
        SELECT expected_rows, actual_rows, mismatches FROM compared
        """
    )
    breakdown = cur.fetchone()
    expected_breakdowns = int(breakdown["expected_rows"])
    actual_breakdowns = int(breakdown["actual_rows"])
    breakdown_mismatches = int(breakdown["mismatches"])
    return [
        Check.exact("gold_monthly_fact_count", candidate_count, monthly_count),
        Check.exact("gold_monthly_value_mismatches", 0, monthly_mismatches),
        Check.exact("gold_breakdown_fact_count", expected_breakdowns, actual_breakdowns),
        Check.exact("gold_breakdown_value_mismatches", 0, breakdown_mismatches),
    ]


def load(mode: str, institution_ids: list[str] | None = None) -> dict[str, Any]:
    if mode == "pilot" and institution_ids is None:
        institution_ids = [_DEFAULT_PILOT_INSTITUTION_ID]
    if mode == "backfill":
        institution_ids = None

    run_id = _start_run(mode, institution_ids)
    candidate_count = monthly_loaded = breakdown_loaded = 0
    checks: list[Check] = []
    try:
        with analytics_db.get_etl_pool().connection() as conn:
            with conn.transaction():
                with conn.cursor(row_factory=dict_row) as cur:
                    cur.execute("SELECT pg_try_advisory_xact_lock(%s) AS locked", (_GOLD_LOAD_LOCK_KEY,))
                    if not cur.fetchone()["locked"]:
                        raise _LoadAlreadyRunning()
                    candidate_count = _create_scope(cur, institution_ids)
                    if candidate_count == 0:
                        raise RuntimeError("Approved Gold load scope contains no candidates")
                    checks = _preflight(cur)
                    failures = [check for check in checks if check.status == "failed"]
                    if failures:
                        raise RuntimeError("Gold preflight failed: " + ", ".join(check.name for check in failures))
                    monthly_loaded = _load_monthly(cur)
                    breakdown_loaded = _load_breakdowns(cur)
                    checks.extend(_reconcile(cur, candidate_count))
                    failures = [check for check in checks if check.status == "failed"]
                    if failures:
                        raise RuntimeError("Gold reconciliation failed: " + ", ".join(check.name for check in failures))
        _record_results(run_id, checks)
        _finish_run(
            run_id,
            status="succeeded",
            candidate_count=candidate_count,
            monthly_count=monthly_loaded,
            breakdown_count=breakdown_loaded,
        )
        return {
            "run_id": run_id,
            "mode": mode,
            "status": "succeeded",
            "candidate_count": candidate_count,
            "monthly_facts_loaded": monthly_loaded,
            "breakdown_facts_loaded": breakdown_loaded,
            "checks": [check.__dict__ for check in checks],
        }
    except _LoadAlreadyRunning:
        # Not a failure — status must be one of the DB's allowed values
        # (running/succeeded/partial/failed; there's no 'skipped'), and
        # nothing here actually went wrong, so 'succeeded' with zero counts
        # plus an explanatory error_summary is the most honest fit.
        _finish_run(run_id, status="succeeded", error_summary="Skipped: another gold load was already running.")
        return {"run_id": run_id, "mode": mode, "status": "skipped", "reason": "another gold load already running"}
    except Exception as exc:
        message = str(exc)
        _record_failure(run_id, message)
        _finish_run(
            run_id,
            status="failed",
            candidate_count=candidate_count,
            monthly_count=0,
            breakdown_count=0,
            failed_count=1,
            error_summary=message,
        )
        raise


def refresh_incremental(record_id: str, grains: list[tuple[int, int]]) -> dict[str, Any]:
    """Replace Gold facts for every old/new grain affected by one source record."""
    normalized_grains = sorted(set(grains))
    run_id = _start_run(
        "incremental",
        None,
        scope_extra={"source_record_id": record_id, "affected_grain_count": len(normalized_grains)},
    )
    candidate_count = monthly_loaded = breakdown_loaded = 0
    checks: list[Check] = []
    try:
        if not normalized_grains:
            checks.append(Check.exact("incremental_affected_grain_count", 0, 0))
        else:
            with analytics_db.get_etl_pool().connection() as conn:
                with conn.transaction():
                    with conn.cursor(row_factory=dict_row) as cur:
                        cur.execute("SELECT pg_try_advisory_xact_lock(%s) AS locked", (_GOLD_LOAD_LOCK_KEY,))
                        if not cur.fetchone()["locked"]:
                            raise _LoadAlreadyRunning()
                        candidate_count = _create_grain_scope(cur, normalized_grains)
                        checks = _preflight(cur)
                        failures = [check for check in checks if check.status == "failed"]
                        if failures:
                            raise RuntimeError(
                                "Gold incremental preflight failed: " + ", ".join(check.name for check in failures)
                            )
                        _delete_refresh_grains(cur)
                        monthly_loaded = _load_monthly(cur)
                        breakdown_loaded = _load_breakdowns(cur)
                        checks.extend(_reconcile(cur, candidate_count))
                        failures = [check for check in checks if check.status == "failed"]
                        if failures:
                            raise RuntimeError(
                                "Gold incremental reconciliation failed: " + ", ".join(check.name for check in failures)
                            )
        _record_results(run_id, checks)
        _finish_run(
            run_id,
            status="succeeded",
            candidate_count=candidate_count,
            monthly_count=monthly_loaded,
            breakdown_count=breakdown_loaded,
        )
        return {
            "run_id": run_id,
            "mode": "incremental",
            "status": "succeeded",
            "affected_grain_count": len(normalized_grains),
            "candidate_count": candidate_count,
            "monthly_facts_loaded": monthly_loaded,
            "breakdown_facts_loaded": breakdown_loaded,
            "checks": [check.__dict__ for check in checks],
        }
    except _LoadAlreadyRunning:
        _finish_run(run_id, status="succeeded", error_summary="Skipped: another gold load was already running.")
        return {
            "run_id": run_id,
            "mode": "incremental",
            "status": "skipped",
            "reason": "another gold load already running",
        }
    except Exception as exc:
        message = str(exc)
        _record_failure(run_id, message)
        _finish_run(
            run_id,
            status="failed",
            candidate_count=candidate_count,
            monthly_count=0,
            breakdown_count=0,
            failed_count=1,
            error_summary=message,
        )
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Load validated parish Gold facts")
    parser.add_argument("mode", choices=("pilot", "backfill"))
    parser.add_argument("--institution-id", action="append", dest="institution_ids")
    args = parser.parse_args()
    try:
        print(load(args.mode, args.institution_ids))
    finally:
        analytics_db.close_etl_pool()


if __name__ == "__main__":
    main()
