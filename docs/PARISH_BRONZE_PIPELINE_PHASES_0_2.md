# Parish Bronze Pipeline: Phases 0-2

## Scope

Supabase remains the OLTP source of truth. The existing AWS `diocese`,
`operations`, and `parishes` schemas are the bronze layer; no separate `bronze`
schema is introduced.

This work cycle includes the source-to-bronze contract, ETL controls, and a
manual pilot for one parish and one reporting year. It excludes silver objects,
automation, full backfill, gold refreshes, summary formulas, health scoring,
and dashboard cutover.

## Baseline

| Source object | Rows / coverage |
|---|---:|
| `parishes.financial_records` | 5,232 current records |
| `parishes.iafr_line_items` | 188,510 rows |
| `parishes.iafr_account_titles` | 114 rows, 113 active |
| Parishes with financial records | 92 |
| Reporting years | 2021-2025 |

The 2023 source contains 816 parish-months rather than 1,104. This is source
incompleteness and must not be reported as ETL loss.

## Source-to-Bronze Contract

| Supabase source | AWS bronze target | Key | Pilot filter |
|---|---|---|---|
| `diocese.institutions` | `diocese.institutions` | `id` | selected parish |
| `parishes.details` | `parishes.details` | `institution_id` | selected parish |
| `parishes.iafr_account_titles` | `parishes.iafr_account_titles` | `id` | complete catalog |
| `operations.submission_batches` | `operations.submission_batches` | `id` | referenced batches |
| `parishes.financial_records` | `parishes.financial_records` | `id` | parish + year, current and not deleted |
| `parishes.iafr_line_items` | `parishes.iafr_line_items` | `id` | pilot financial-record IDs |

Bronze preserves source UUIDs, values, timestamps, statuses, and JSON fields.
It does not calculate accounting totals. AWS business and audit triggers are
disabled only during a mirror write so the destination cannot recompute source
values. Parent rows load before child rows and every write is idempotent.

## Pilot

The selected pilot is **Blessed Sacrament Parish (`D1-23`) for 2021**. The
source has all 12 months for this parish-year.

The dry run must be reviewed before the load. The pilot may write only bronze
dependencies and `warehouse_control` records. It must not run analytics refresh
scripts.

## Acceptance Criteria

- The dry run writes no parish financial or line-item rows.
- Source and AWS record and line-item ID sets match.
- Source and AWS counts match.
- Line-item and wide financial amount sums match within PHP 0.01.
- Every child row resolves its local foreign keys.
- Re-running the pilot creates no duplicates.
- Every run has terminal status and reconciliation results.
- Supabase is never modified.
