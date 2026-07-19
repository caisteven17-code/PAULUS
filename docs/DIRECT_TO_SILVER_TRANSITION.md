# Supabase Logical Bronze to AWS Silver Transition

## Target Architecture

Supabase remains the transactional source of truth and, together with complete
row-level change history, is the logical bronze/source layer. AWS receives
cleaned parish finance data directly in `parish_silver`; gold remains in
`parish_analytics`.

```text
Supabase OLTP + audit.change_log
             -> AWS parish_silver
             -> AWS parish_analytics
```

The existing AWS `parishes`, `diocese`, and `operations` copy was retained for
the pilot comparison. After the full-source direct-silver backfill reconciled,
`WAREHOUSE_BRONZE_COMPARISON_ENABLED` was set to `false`. The tables remain in
place pending a separate retention or decommission decision.

## Audit Prerequisite

Applied in the Supabase SQL Editor on 2026-07-18:

`supabase/portable_migrations/221_audit_parish_financial_detail.sql`

It adds full OLD/NEW JSONB mutation history for:

- `parishes.iafr_line_items`
- `parishes.iafr_account_titles`
- `parishes.details`

`parishes.financial_records` was already covered. The application-facing
`diocese.audit_logs` continues to record user activities; `audit.change_log`
is the reconstructable row history required by the logical bronze design.
Migration 221 also creates the service-role-only
`diocese.audit_change_log` view because Supabase REST does not expose the
`audit` schema directly; the backend uses this view for the unified Audit Log
screen.

Verify trigger coverage after applying the migration:

```sql
SELECT event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'parishes'
  AND event_object_schema = 'parishes'
  AND trigger_name = 'audit_change'
  AND event_object_table IN ('financial_records', 'iafr_line_items', 'iafr_account_titles', 'details')
ORDER BY event_object_table, event_manipulation;
```

Each table must list `INSERT`, `UPDATE`, and `DELETE`.

Live verification used a no-op update to one pilot line item. The financial
amount remained unchanged, `diocese.audit_change_log` exposed complete OLD and
NEW JSONB, direct silver passed all four reconciliation checks, and the
watermark advanced to the source update timestamp.

## Direct Silver Behavior

`silver_etl.py` fetches the Supabase financial record, active line-item
snapshot, and canonical account catalog itself. It standardizes dates, text,
amounts, account metadata, and quality flags before writing AWS. It does not
read AWS bronze. Reconciliation compares source and silver record counts,
line counts, line UUID sets, and line amount totals.

The source watermark advances only after direct silver succeeds and, during
transition, after the optional bronze comparison succeeds too.

## Verified Pilot Scope

Blessed Sacrament Parish was expanded from the original 2021 pilot to all
current reporting years, 2021-2025:

- 60 current monthly records
- 2,344 line items
- PHP 33,816,254.76 line-item total
- zero record-ID differences
- zero line-ID differences
- all direct-silver reconciliation checks passed
- zero open ETL failures

## Missing Source Data

Run `supabase/diagnostics/parish_financial_source_quality.sql` in Supabase.
Candidate missing months require confirmation against authoritative IAFR files;
the pipeline must not convert unknown values into zero or manufacture records.
Correct confirmed omissions in Supabase, then rerun direct silver.

The read-only source profile found 5,232 current records for 92 parishes across
2021-2025. A complete 92-parish by five-year matrix would contain 5,520
parish-months. The 288 absent slots are exactly 24 complete parish-years, all
in 2023; there are no partial parish-years and no duplicate current grains.
The user confirmed that the 24 missing 2023 parish-years are genuinely
unavailable. AWS records those 288 months as `confirmed_unavailable` in
`parish_silver.reporting_coverage`; it does not manufacture zero-value facts.

## Full Backfill Result

Completed on 2026-07-18 using resumable 100-record checkpoints:

- 5,232 source records and 5,232 distinct silver source-record IDs
- 188,510 source line items and 188,510 distinct silver source-line IDs
- PHP 3,356,544,904.75 signed line-item total
- 5,232 available and 288 confirmed-unavailable coverage months
- zero source-ID differences and zero duplicate parish-month grains
- zero failed checks among successful backfill runs
- zero open ETL failures

All records carry warnings for unavailable historical submission metadata. Of
the 5,232 records, 61 have no line items. Eighteen of the 188,510 line items
carry `NEGATIVE_AMOUNT`; they remain signed rather than being silently changed.

The continuous worker now uses one `parish_silver_incremental` watermark for
all parishes (`WAREHOUSE_SYNC_ALL_PARISHES=true`). The first watermark was
initialized from the completed backfill snapshot, so later changes are read in
stable `(updated_at, id)` order without replaying all history.

## Phase 5 Formula Gate

Do not run `portable_migrations/140_refresh_parish_analytics.sql` against the
new silver history. Its formula for `total_collections` conflicts with the
documented formula, and `sacraments_total` already includes claimed and
unclaimed intentions, confirmation, and charge-over-above. Adding those fields
again would double-count receipts.

Before populating gold, approve definitions for:

- reportable total receipts, especially unclaimed intentions and special,
  second, and construction receipts;
- whether `net_receipts_deficit` is the official source `net_receipts` or a new
  gold calculation;
- whether negative line amounts remain signed adjustments (recommended);
- whether the 61 header-only months appear in the monthly fact with an empty
  breakdown (recommended).

## Retirement Gate

Set `WAREHOUSE_BRONZE_COMPARISON_ENABLED=false` only after all approved parish
history has matching source/silver counts, IDs, amounts, and no unresolved
failures. Keep the existing AWS bronze tables until a separate retention or
decommission decision is approved.
