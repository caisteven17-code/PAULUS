# Parish Finance Pipeline: Phase 4 Silver Layer

## Purpose

Phase 4 converts Supabase source snapshots directly into a consistent,
analytics-ready AWS parish finance layer. The earlier AWS bronze-fed loader
has been superseded; its tables remain temporarily for transition comparison.
Phase 4 does not populate gold facts or define dashboard formulas.

## Physical Model

The AWS-only `parish_silver` schema contains:

| Table | Grain | Primary lineage key |
|---|---|---|
| `financial_records` | One current financial record per parish and reporting month | `source_record_id` |
| `financial_line_items` | One row per non-deleted Supabase line item on a current record | `source_line_item_id` |

`financial_records` is unique on `(institution_id, reporting_month)`. A
corrected current source version replaces the prior silver row for that
parish-month. Every row stores source timestamps, transformation time, and
`etl_run_id`.

Source UUIDs remain lineage keys but intentionally have no foreign keys to the
temporary AWS bronze copy. Silver's own record-to-line relationship remains
enforced.

## Cleaning Rules

- Convert the source month abbreviation into a first-of-month date, year, and month number.
- Trim text and convert blank optional text to `NULL`.
- Normalize status text to lowercase and institution class to uppercase.
- Coalesce nullable monetary values to zero without changing non-null values.
- Enrich line items from the canonical IAFR account catalog.
- Preserve repeated account codes as separate source lines; aggregate only in gold.
- Exclude soft-deleted lines and non-current or deleted records.
- Replace the complete silver child snapshot on every record refresh.

## Quality Semantics

`passed` is structurally ready. `warning` remains usable but has metadata or
account conditions analysts should see. `failed` means an account cannot be
mapped or source validation explicitly failed.

Record flags include missing submission, preparer, certifier, or validation
metadata; failed source validation; draft status; no lines; and failed or
warning child rows. Line flags cover unmapped or inactive accounts, negative
amounts, and section or account-type mismatches. Negative amounts are warnings
because they may be legitimate adjustments.

## Incremental Flow

1. Phase 4 fetches the current Supabase record, active line items, and account catalog.
2. It standardizes and writes the complete snapshot directly to AWS silver.
3. Source/silver counts, line UUIDs, and line amount sums are reconciled.
4. During transition, Phase 3 also updates AWS bronze for comparison.
5. The watermark advances only after direct silver and the enabled comparison both succeed.

## Commands

```powershell
cd src/analytics
python -m app.services.silver_etl --record-id <financial-record-uuid>
python -m app.services.silver_etl --institution-id <parish-uuid>
```

Deploy only the silver migration, without running gold refresh scripts:

```powershell
python scripts/apply_aws_migrations.py --only 020_parish_silver.sql
```

## Pilot Result

Blessed Sacrament Parish 2021-2025 produced 60 silver monthly records and 2,344
silver line items. All monthly rows are warnings because the legacy source
records have no submission batch, preparer, certifier, or source validation
status; no rows failed.

The direct silver and temporary bronze comparison contain identical source
record IDs, line IDs, and PHP 33,816,254.76 line amount totals. Parish gold
monthly and breakdown facts remained empty.
