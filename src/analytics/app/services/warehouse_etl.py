"""Bronze mirror — copies a small set of Supabase (OLTP) tables into AWS so the
gold-layer tables' foreign keys have something local to reference (AWS enforces
its own FK constraints against its own copy; it cannot reach across to
Supabase). See docs/MANUSCRIPT_GUIDE_HYBRID_DATABASE.md section 5.

Currently mirrors only diocese.institutions and diocese.profiles — the two
tables shared_analytics.dim_institutions and priest_assignment_analytics.dim_priests
reference. Expands to the full bronze input set (financial_records, submission
batches, etc.) when the analytics refresh scripts are repointed to AWS.

Usage:
  python -m app.services.warehouse_etl
"""

from __future__ import annotations

import logging

from app.services import analytics_db
from app.services.supabase_client import get_table

logger = logging.getLogger(__name__)

_PAGE_SIZE = 1000


def _fetch_all(schema: str, table: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        resp = get_table(schema, table).select("*").range(offset, offset + _PAGE_SIZE - 1).execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return rows


def mirror_table(schema: str, table: str, conflict_col: str = "id", disable_triggers: list[str] = ()) -> int:
    """disable_triggers: BEFORE INSERT triggers to suspend for the duration of
    the mirror. A mirror must preserve exact source values, including NULLs a
    business-logic trigger would otherwise "fix" (e.g. auto-generating a fresh
    code for a row whose code is legitimately NULL on the source — see
    diocese.profiles.trg_profile_code, which fired for a soft-deleted row with
    no profile_code and generated a code colliding with a real row's explicit
    one in the same batch).
    """
    rows = _fetch_all(schema, table)
    if not rows:
        logger.info("Mirror %s.%s: 0 rows in source, nothing to do", schema, table)
        return 0

    for trg in disable_triggers:
        analytics_db.execute(f'ALTER TABLE "{schema}"."{table}" DISABLE TRIGGER "{trg}"')
    try:
        n = analytics_db.upsert_rows(schema, table, rows, conflict_cols=conflict_col)
    finally:
        for trg in disable_triggers:
            analytics_db.execute(f'ALTER TABLE "{schema}"."{table}" ENABLE TRIGGER "{trg}"')

    logger.info("Mirror %s.%s: %d row(s) upserted into AWS", schema, table, n)
    return n


def run() -> dict[str, int]:
    """diocese.roles must run before profiles (profiles.role_id FKs to it) —
    the static RBAC seed only covers the 12 predefined roles; custom roles
    created through the app (e.g. "Sakristan") are real bronze data that must
    be mirrored, not seeded. institutions must also run before profiles
    (profiles.institution_id FKs to it).
    """
    results = {}
    results["diocese.roles"] = mirror_table("diocese", "roles")
    results["diocese.institutions"] = mirror_table("diocese", "institutions")
    results["diocese.profiles"] = mirror_table("diocese", "profiles", disable_triggers=["trg_profile_code"])
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    summary = run()
    print("Bronze mirror complete:")
    for table, count in summary.items():
        print(f"  {table}: {count} row(s)")
    analytics_db.close_pool()
