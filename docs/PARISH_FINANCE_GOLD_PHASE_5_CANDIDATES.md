# Parish Finance Gold Phase 5A-5D

## Scope

Phases 5A-5D prepare and validate the parish monthly financial candidate
dataset. They do not insert or update either Gold fact table.

The candidate grain is one row per parish, reporting year, and reporting
month. Formula rules are versioned as `parish_monthly_v1` in
`warehouse_control.parish_metric_account_rules`.

Formula `parish_monthly_v2` preserves the v1 account allocations and applies
the approved Mass collections tax correction
for 2023-2025. The original candidate view is retained as
`parish_analytics.vw_parish_monthly_financial_candidates_v1`.

The active formula was subsequently advanced to `parish_monthly_v4` for the
year-specific Other Collections deduction. The v2 view remains available as
`parish_analytics.vw_parish_monthly_financial_candidates_v2`.

## Implemented Phases

### Phase 5A - Contract and dimensions

- Synchronized all 92 parish dimension members directly from Supabase.
- Synchronized 113 IAFR account dimension members directly from Supabase.
- Removed the temporary AWS bronze foreign-key dependency from the affected
  analytical dimensions.
- Added the five approved Section D parish-expense columns to the monthly fact
  schema.
- Renamed the remittance measure to `total_remittance` and defined its approved formula.

### Phase 5B - Source memo metric

- Recovered the parish-share rate from committed financial-pusher JSON using
  the key `sacraments net of diocese share rate`.
- Stored the recovered value and lineage in
  `parish_silver.financial_memo_metrics`.
- Used the approved 0.30 fallback only when the source JSON value was absent.

### Phase 5C - Read-only candidate calculations

The view `parish_analytics.vw_parish_monthly_financial_candidates` calculates:

- prescribed sacraments and confirmation
- parish share using the record-level rate
- over-and-above sacraments and confirmation
- year-specific Mass collections
- 95% other collections
- other receipts
- total collections
- pastoral Mass stipends
- the five Section D parish-expense groups and their total
- total expenses and net receipts or deficit
- claimed and unclaimed Mass intentions
- special collections
- Pastoral and Parish Fund total net receipts or deficit

Collection allocation rules prevent a source line assigned to a year-specific
Mass collection formula from also entering other collections or other
receipts. `total_remittance` sums `F.1.*`, `F.3.01`, and `F.3.02`; Bishop's Fund
Share accounts under `F.2.*` are excluded.

Other receipts include `B.3.06 Charge Over / Above` for 2021-2025. This is a
receipt account and is distinct from the sacramental `A.*.02` over-and-above
accounts.

Historical PUSHER rows labeled exactly `Charge Over/Above` were originally
classified as `A.1.11`. Migration 222 corrects those Supabase source rows to
`B.3.06`, and AWS migration 052 applies the same correction to Silver. Rows
labeled `Total Charge Over/Above` and sacrament-specific amount columns remain
separate to prevent double counting.

### Selected-column repair uploads

PUSHER provides a `Patch selected columns` import mode for source values that
were never committed. Selecting this mode automatically keeps only the
`B.3.06` mapping active for the Charge Over/Above repair. The patch updates or
inserts that account on existing parish-month records without deleting other
line items. A blank source cell makes no change; an explicit zero clears only
the selected account. Parish-months that do not already exist are skipped.

### Phase 5D - Validation

Validation run: `14bf0084-8308-4a4c-8d04-e4ca9f8f8d41`

| Check | Result |
|---|---:|
| Silver records | 5,232 |
| Monthly candidates | 5,232 |
| Missing parish keys | 0 |
| Formula arithmetic mismatches | 0 |
| Collection allocation conflicts | 0 |
| Validation cohort records | 276 |
| Validation cohort failures | 0 |
| Gold monthly facts | 0 |
| Gold breakdown facts | 0 |

Candidate coverage by year:

| Year | Candidates | Passed | Warnings | Failed |
|---|---:|---:|---:|---:|
| 2021 | 1,104 | 1,104 | 0 | 0 |
| 2022 | 1,104 | 1,104 | 0 | 0 |
| 2023 | 816 | 804 | 12 | 0 |
| 2024 | 1,104 | 1,104 | 0 | 0 |
| 2025 | 1,104 | 1,104 | 0 | 0 |

The lower 2023 count reflects the previously documented 288 unavailable
source months. The 12 warnings are 2023 records whose source JSON lacks the
rate; they use the approved 0.30 fallback. No candidate failed validation.

## Stop Gate

Phase 5E is intentionally not implemented. Before loading Gold facts, review
the warning cohort, approve representative candidate amounts, and confirm the
still-pending remittance formula. The liturgical calendar dimension remains a
separate later phase.

## Mass Collections Tax Correction

For 2023-2025, the active candidate view calculates:

```text
collections_mass_tax_amount = round(collections_mass_gross * tax_rate, 2)
collections_mass = collections_mass_gross - collections_mass_tax_amount
```

Recorded zero rates are valid. The 2021-2022 calculations remain unchanged,
with a null tax rate and zero tax amount. The net Mass amount flows into total
collections, net receipts or deficit, and the Pastoral and Parish Fund result.

Validation run `1a112590-509f-49a4-9510-fad9416b4198` confirmed:

- 3,024 expected 2023-2025 tax rates and 3,024 recovered source rates
- zero missing or conflicting tax rates
- zero formula arithmetic mismatches
- zero changed v1-versus-v2 results for 2021-2022
- zero Gold facts loaded

| Year | Gross Mass Collections | Tax Amount | Net Mass Collections |
|---|---:|---:|---:|
| 2021 | 80,308,878.28 | 0.00 | 80,308,878.28 |
| 2022 | 158,393,398.06 | 0.00 | 158,393,398.06 |
| 2023 | 119,419,400.45 | 15,771,952.10 | 103,647,448.35 |
| 2024 | 168,982,595.09 | 36,278,348.92 | 132,704,246.17 |
| 2025 | 182,186,090.85 | 44,551,711.84 | 137,634,379.01 |

## Other Collections Year Rule

The active v3 candidate includes Other Collections net internally in
`total_collections` without exposing a standalone column. Eligible source accounts
continue to exclude accounts allocated to Mass Collections for the same year.

```text
2021-2022: deduction rate = 0%; net = gross
2023-2025: deduction = round(gross * 0.05, 2); net = gross - deduction
```

Validation run `7448fcb1-7113-4ebc-a393-632478bd21c5` passed all candidate,
rate, arithmetic, allocation, cohort, and Gold stop-gate checks. The available
2021-2022 eligible Other Collections gross is zero because populated B.2 lines
for those years are already allocated to Mass Collections. This avoids double
counting. For 2023-2025:

| Year | Gross Other Collections | Deduction | Net Other Collections |
|---|---:|---:|---:|
| 2023 | 28,572,437.23 | 1,428,621.92 | 27,143,815.31 |
| 2024 | 51,830,760.17 | 2,591,538.07 | 49,239,222.10 |
| 2025 | 43,722,064.13 | 2,186,103.27 | 41,535,960.86 |
