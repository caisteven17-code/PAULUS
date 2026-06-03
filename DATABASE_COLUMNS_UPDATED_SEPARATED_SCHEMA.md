# Diocese of San Pablo — Full Column Specification (Separated Operational Schema + Analytics/Sandbox Model)

Canonical, typed column definitions for every table, grounded in the actual UI (`src/types.ts`, the views, the `src/microservices/*` service mappers) and the two source forms (`IAFR FORM.xlsx`, `SEMINARY TEMPLATE.xlsx`)[cite: 2]. This schema incorporates structural updates to resolve polymorphic relationship gaps, daily-to-monthly forecasting input granularity mismatches, and audit trail index scaling issues[cite: 2].

## Architecture — Three Layers, One Job Each

| Layer | Purpose | Tables |
| :--- | :--- | :--- |
| **Operational** | Capture each entity's data *as entered on its form* — no foreign-shaped nulls[cite: 2]. Enforces strict referential integrity via a centralized institutional super-type model[cite: 2]. | `diocese.institutions`, `parishes.financial_records` (IAFR), `schools.financial_records`, `seminaries.financial_records`, plus the details and calendar tables[cite: 2]. |
| **Analytics** | One uniform shape for all dashboards, forecasting, anomaly detection, health scoring, and subsidy optimization linear programming models[cite: 1, 2]. | `dim_*` + `fact_*` star schema[cite: 2]. |
| **Sandbox** | Safe decision-support workspace for Digital Twin baselines and What-if Analysis. Stores hypothetical inputs and projected outputs without changing official financial submissions or analytics facts. | `sandbox.digital_twin_snapshots`, `sandbox.scenario_*` tables. |

### Operational Schema Separation Decision 🆕

PAULUS intentionally keeps **separate operational schemas** for `parishes`, `schools`, and `seminaries` instead of forcing all institutions into one generic financial-entry schema. This is the preferred design because each institution type operates differently, uses different source forms, follows different validation rules, and exposes different data to different user roles.

| Reason | Design Implication |
| :--- | :--- |
| Parishes use the 2026 IAFR with arancel, sacraments, Mass intentions, diocesan remittances, and Bishop's fund logic. | Parish records stay in `parishes.*` with IAFR-specific account titles and line items. |
| Schools use school financial statements with tuition, fees, payroll, facilities, and school operating logic. | School records stay in `schools.*` with school FS-specific account titles and line items. |
| Seminaries use seminary financial templates with formation fees, board/lodging, modules, vocation expenses, and seminary operating costs. | Seminary records stay in `seminaries.*` with seminary FS-specific account titles and line items. |
| Access boundaries differ by role and institution type. | Separate schemas make RBAC, row-level security, API permissions, and audits easier to reason about. |
| Analytics still needs consolidated reporting. | The analytics layer standardizes outputs through dimensions, summary facts, and institution-specific line-level facts. |

> Separate schemas are not the only security mechanism. PostgreSQL permissions, row-level security, API authorization checks, and audit logs are still required. The schema separation is primarily for business correctness, maintainability, and clearer access boundaries.


A transform step rolls operational rows up into `fact_monthly_financials` / `fact_monthly_expenses` (the "Step 1 → Step 6" mapping in `DATABASE_SCHEMA.md`)[cite: 2].

> **Compatibility during migration:** The app today reads a single flat `financial_records` table via `financial.service.ts`[cite: 2]. Expose `analytics.diocesan_consolidated_financials` (or a thin `public.financial_records` view) so existing queries keep working while the operational tables become the source of truth underneath[cite: 2]. See §9 for the legacy column map[cite: 2].

### Conventions
- **Money** → `numeric(14,2)` default `0`[cite: 2].
- **Keys** → Operational tables use `uuid` for primary keys to ensure scale and balance; analytics uses integer surrogate keys (`*_key`)[cite: 2].
- **Time** → `month` stored short (`'Jan'`..`'Dec'`) + `year smallint`[cite: 2]; analytics maps to `date_key` (`YYYYMM`)[cite: 2].
- Every table has `created_at timestamptz default now()`, `updated_at timestamptz`, and soft-delete `deleted_at timestamptz` (omitted below for brevity)[cite: 2].
- Parish IAFR detail breakdowns are preserved twice by design: operational tables preserve the exact submitted form rows; analytical fact tables store cleaned, query-optimized copies for dashboard drill-downs and model features.
- ✅ confirmed vs UI/forms · ⚠️ provisional (no source form) · 🆕 new[cite: 2].

---

## 1. `diocese` Schema — Shared & Administrative Core

### `diocese.institutions` 🆕 *(Central Super-Type for strict FK constraints)*
`id` (uuid PK) · `name` (text) · `entity_type` (text: parish/school/seminary/chancery) · `vicariate` (text) · `district` (text) · `cluster` (text) · `class` (text: A–E) · `address` (text) · `contact_number` (text) · `email` (text unique) · `lat` (numeric) · `lng` (numeric) · `is_active` (bool)[cite: 1, 2]

### `diocese.roles` ✅
`id` (text PK, e.g., `'parish_priest'`) · `name` (text) · `color` (text hex) · `is_predefined` (bool)[cite: 2]

### `diocese.permissions` ✅
`id` (text PK, e.g., `'view_diocese'`) · `name` (text) · `category` (text: Viewing/Data Management/User Management) · `description` (text)[cite: 2]

### `diocese.role_permissions` ✅
`role_id` (text FK → `diocese.roles.id`) · `permission_id` (text FK → `diocese.permissions.id`) · `granted` (bool, default true) — PK (`role_id`, `permission_id`)[cite: 2]

### `diocese.profiles` ✅
`id` (uuid PK = auth uid) · `full_name` (text) · `email` (text unique) · `role_id` (text FK → `diocese.roles.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `contact_number` (text) · `is_active` (bool) · `last_login_at` (timestamptz)[cite: 2]

### `diocese.projects` ✅ *(project.service.ts mapper — exact)*
`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `name` (text) · `description` (text) · `fund_usage` (text) · `category` (text) · `status` (text: active/completed/on-hold) · `target_amount` (numeric) · `current_amount` (numeric) · `total_expenses` (numeric) · `start_date` (date) · `end_date` (date) · `beneficiaries` (text) · `contact_person` (text) · `cover_image` (text) · `health_score` (numeric) · `success_probability` (numeric) · `recommendation` (text)[cite: 2]

### `diocese.donations` ✅ *(project.service.ts mapper — exact)*
`id` (uuid PK) · `project_id` (uuid FK → `diocese.projects.id`) · `donor_name` (text) · `amount` (numeric) · `date` (date) · `payment_method` (text: Cash/Check/Online/Bank Transfer) · `receipt_issued` (bool) · `receipt_proof_name` (text) · `notes` (text)[cite: 2]

### `diocese.project_expenses` ✅ *(project.service.ts mapper — exact)*
`id` (uuid PK) · `project_id` (uuid FK → `diocese.projects.id`) · `description` (text) · `amount` (numeric) · `date` (date) · `payment_method` (text) · `receipt_reference` (text) · `proof_file_name` (text) · `notes` (text)[cite: 2]

### `diocese.announcements` ✅
`id` (uuid PK) · `title` (text) · `content` (text) · `author` (text) · `author_role` (text) · `priority` (text: low/medium/high) · `category` (text: general/financial/administrative/event)[cite: 2]

### `diocese.audit_logs` ✅ *(Performance optimized)*
`id` (uuid PK) · `log_reference` (text unique, e.g., `'LOG-0001'`) · `user_name` (text) · `role` (text) · `is_system` (bool) · `category` (text: auth/finance/analytics/reports/system/access) · `severity` (text: info/warning/error/success) · `action` (text) · `detail` (text) · `institution_id` (uuid FK → `diocese.institutions.id`, nullable) · `ip_address` (text) · `occurred_at` (timestamptz default now())[cite: 2]

---

## 2. `operations` Schema — Submission, Validation & Reconciliation Control 🆕

The `operations` schema is shared across institution types because uploads, validation, and reconciliation are workflow concerns. It does **not** replace the separated financial schemas. It only records the lifecycle of submitted files and validation results before records are loaded into `parishes.*`, `schools.*`, or `seminaries.*`.

### `operations.submission_batches` 🆕
One row represents one uploaded monthly report file or encoded monthly submission.

`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `institution_type` (text: parish/school/seminary) · `report_type` (text: IAFR/School FS/Seminary FS) · `reporting_month` (smallint 1–12) · `reporting_year` (smallint) · `source_file_name` (text) · `source_file_url` (text) · `source_file_hash` (text) · `submitted_by` (uuid FK → `diocese.profiles.id`) · `submitted_at` (timestamptz) · `validation_status` (text: pending/passed/failed/warning) · `verified_by` (uuid FK → `diocese.profiles.id`) · `verified_at` (timestamptz) · `is_late` (bool) · `remarks` (text)

### `operations.validation_errors` 🆕
Stores parsing, schema, type, and required-field errors found during upload validation.

`id` (uuid PK) · `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `source_sheet_name` (text) · `source_row_number` (int) · `source_column_name` (text) · `field_name` (text) · `error_type` (text: missing_required/invalid_type/invalid_total/unknown_account/duplicate_record/out_of_range) · `severity` (text: info/warning/error/blocker) · `error_message` (text) · `created_at` (timestamptz default now())

### `operations.reconciliation_checks` 🆕
Stores computed control checks between detail rows, summary totals, uploaded files, and analytics facts.

`id` (uuid PK) · `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `financial_record_id` (uuid) · `check_name` (text) · `check_scope` (text: operational/analytics/export) · `expected_amount` (numeric(14,2)) · `actual_amount` (numeric(14,2)) · `difference_amount` (numeric(14,2)) · `status` (text: passed/failed/warning) · `details` (jsonb) · `created_at` (timestamptz default now())

Common reconciliation examples:
- Sum of parish D-section expense lines = `parishes.financial_records.parish_expenses_total`.
- Sum of parish B.1 collection lines = Mass collection total.
- School FS detail expenses = school monthly outflow.
- Seminary FS detail expenses = seminary monthly expense total.
- Analytics summary facts = operational verified/current records.


## 3. `parishes` Schema (Operational Sub-type)

### `parishes.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `pastor` (text) · `primary_patron` (text) · `secondary_patron` (text) · `fiesta_date` (date)[cite: 2]

### `parishes.iafr_account_titles` 🆕 *(Operational account-title source of truth for the 2026 IAFR)*
Purpose: stores the official IAFR row/account dictionary used during upload parsing, validation, reconciliation, and operational drill-down. Collections, expenses, remittances, balances, and memo lines are all represented here. This is operational metadata, while `analytics.dim_iafr_account` is the reporting-optimized analytical copy.

`id` (uuid PK) · `section_code` (text: A/B/C/D/E/F) · `subsection_code` (text, e.g., A.1/B.1/D.3/F.1) · `account_code` (text unique) · `account_name` (text) · `account_type` (text: receipt/expense/remittance/balance/personal_contribution/memo) · `classification` (text, nullable: collection:mass_collection/donation/utilities/priest_share/bishops_fund/etc.) · `parent_account_code` (text, nullable) · `source_template` (text: 2026_IAFR) · `source_sheet_name` (text) · `source_row_number` (int) · `sort_order` (int) · `is_active` (bool default true)

### `parishes.iafr_account_mapping` 🆕 *(Operational-to-analytics account bridge)*
Purpose: maps operational IAFR account titles to analytical account dimension rows so source Excel labels can be cleaned without losing traceability.

`id` (uuid PK) · `source_account_title_id` (uuid FK → `parishes.iafr_account_titles.id`) · `iafr_account_key` (int FK → `analytics.dim_iafr_account.iafr_account_key`) · `mapping_rule` (text: direct/aggregate/split/manual) · `is_active` (bool default true) · `created_at` (timestamptz default now())

### `parishes.financial_records` ✅ *(IAFR FORM — section totals; reconciled with app)*
**Header**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| institution_id | uuid FK | References `diocese.institutions.id`[cite: 2]. |
| entity_class | text | Class A–E (stored per row to track class history)[cite: 2]. |
| month | text | `'Jan'`..`'Dec'`[cite: 2]. |
| year | smallint | |
| status | text | draft/submitted/verified[cite: 2]. |
| prepared_by | text | |
| certified_by | text | Parish Priest signature role[cite: 2]. |
| submitted_at | timestamptz | |
| record_timestamp | timestamptz | Business transactional validity date marker[cite: 2]. |

**Versioning & upload traceability** — `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `version_no` (int default 1) · `is_current_version` (bool default true) · `superseded_by` (uuid FK → `parishes.financial_records.id`, nullable) · `correction_reason` (text, nullable) · `validation_status` (text) · `validation_errors` (jsonb). Rule: a parish may have many corrected versions for one month, but only one `is_current_version = true` record should feed analytics for each (`institution_id`, `year`, `month`).

**A. Pastoral Fund Receipts** — `sacraments_total` (A.1) · `confirmation_total` (A.2) · `mass_intentions_total` · `mass_intentions_claimed` · `mass_intentions_unclaimed` (A.3)[cite: 2]

**B. Parish Fund Receipts** — `mass_collection_weekday` · `mass_collection_sunday` · `mass_collection_saturday` (B.1) · `consumable_collections` *(headline consumable operational cash)* · `other_collections_total` (B.2) · `donations` · `interest_income` · `subsidy_inflow` *(standardized operational flow)* · `special_collections` · `second_collections` · `charge_over_above` · `other_receipts` (B.3)[cite: 2]

**C. Pastoral Fund Expenses** — `priest_share` (C.1) · `mass_stipend` (C.2) · `other_pastoral_expenses` (C.3)[cite: 2]

**D. Parish Operating & Rectory Expenses** — `salaries_wages_benefits` (D.1) · `govt_contributions` (D.2) · `utilities` (D.3) · `communications` (D.4) · `other_rectory_expenses` (D.5)[cite: 2]

**E. Construction** — `construction_receipts` (E.1) · `construction_expenses` (E.2)[cite: 2]

**F. Remittances & Balances** — `remittance_to_diocese` (F.1) · `bishops_fund_share` (F.2) · `special_collections_remittance` (F.3) · `beginning_balance` · `ending_balance_before_remit` · `ending_balance_after_remit`[cite: 2]

**Derived Variables** — `net_receipts` (numeric, stored) · `pastoral_parish_fund_total_net_receipts` (numeric, stored)[cite: 2]  
*Note: total_inflow = A+B · total_outflow = C+D — dynamically computed and rolled into the analytical layer.*[cite: 2]


### `parishes.iafr_sacrament_lines` 🆕 *(Operational IAFR A.1/A.2 detailed arancel lines)*
Purpose: preserves the detailed sacrament/arancel rows from the 2026 IAFR input form while `parishes.financial_records` stores the official monthly totals. One row represents one sacrament/confirmation line item within one parish monthly IAFR submission.

`id` (uuid PK) · `financial_record_id` (uuid FK → `parishes.financial_records.id` on delete cascade) · `account_title_id` (uuid FK → `parishes.iafr_account_titles.id`, nullable during migration) · `section_code` (text: A.1/A.2) · `sacrament_name` (text) · `prescribed_rate` (numeric(14,2) default 0) · `gratis_quantity` (int default 0) · `chargeable_quantity` (int default 0) · `prescribed_amount` (numeric(14,2) default 0) · `parish_share_amount` (numeric(14,2) default 0) · `diocesan_share_amount` (numeric(14,2) default 0) · `charge_over_above_amount` (numeric(14,2) default 0) · `total_over_above_amount` (numeric(14,2) default 0) · `total_amount` (numeric(14,2) default 0) · `source_row_number` (int) · `source_label` (text)

Validation rule: `sum(total_amount)` for A.1/A.2 lines must reconcile with `sacraments_total` / `confirmation_total` in `parishes.financial_records`.

### `parishes.iafr_line_items` 🆕 *(Operational IAFR generic detail lines)*
Purpose: preserves detailed receipt, expense, remittance, balance, and memo lines from the IAFR. This table solves variable breakdown requirements without adding new physical columns for every future IAFR row.

`id` (uuid PK) · `financial_record_id` (uuid FK → `parishes.financial_records.id` on delete cascade) · `account_title_id` (uuid FK → `parishes.iafr_account_titles.id`, nullable during migration) · `section_code` (text: B/C/D/E/F) · `subsection_code` (text, e.g., B.1/D.3/F.1) · `item_code` (text) · `item_label` (text) · `item_type` (text: receipt/expense/remittance/balance/personal_contribution/memo) · `amount` (numeric(14,2) default 0) · `tax_rate` (numeric(8,4), nullable) · `is_remittable` (bool default false) · `event_date` (date, nullable) · `notes` (text) · `source_row_number` (int) · `source_label` (text)

Common examples: B.1 weekday/sunday/saturday collections, B.2 other collections, B.3 donations/interest/subsidy/special collections/other receipts, C pastoral expenses, D parish operating and rectory expenses, E construction receipts/expenses, and F remittances/balances.

### `parishes.iafr_employee_contributions` 🆕 *(Operational personnel contribution breakdown)*
Purpose: preserves contribution rows such as SSS, PhilHealth, and Pag-IBIG where the source form separates salary basis, employee share, and employer share.

`id` (uuid PK) · `financial_record_id` (uuid FK → `parishes.financial_records.id` on delete cascade) · `contribution_type` (text: SSS/PhilHealth/Pag-IBIG/Other) · `basic_salary` (numeric(14,2) default 0) · `employee_share` (numeric(14,2) default 0) · `employer_share` (numeric(14,2) default 0) · `total_amount` (numeric(14,2) default 0) · `source_row_number` (int) · `source_label` (text)

### `parishes.fiesta_events` ✅
`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `primary_patron` (text) · `secondary_patron` (text) · `date` (date) · `expected_impact` (text: low/medium/high) · `estimated_collection_increase` (numeric)[cite: 2]

### `parishes.local_calendar` 🆕 *(Per-parish contextual forecasting input)*
`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `event_date` (date) · `end_date` (date) · `title` (text) · `event_type` (text: fiesta/novena/recollection/wedding-season/outreach/construction/other) · `expected_financial_impact` (text: inflow/outflow/both/none) · `estimated_amount` (numeric) · `linked_fiesta_id` (uuid FK → `parishes.fiesta_events.id`, nullable) · `linked_project_id` (uuid FK → `diocese.projects.id`, nullable) · `notes` (text)[cite: 2]

---

## 4. `schools` Schema (Operational Sub-type)

### `schools.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `principal` (text) · `level` (text, e.g., `'K-12'`) · `enrollment_count` (int) · `capacity_count` (int) · `staff_count` (int)[cite: 2]

### `schools.fs_account_titles` 🆕 *(Operational account-title source of truth for school FS)*
Purpose: school-specific financial statement account dictionary. Kept separate from parish and seminary account tables because school FS logic centers on tuition, miscellaneous fees, payroll, facilities, supplies, and school operations.

`id` (uuid PK) · `section_code` (text) · `subsection_code` (text) · `account_code` (text unique) · `account_name` (text) · `account_type` (text: receipt/expense/balance/memo) · `receipt_group` (text, nullable) · `receipt_category` (text, nullable: tuition/miscellaneous_fees/other_income/subsidy/etc.) · `expense_group` (text, nullable: payroll/facilities/operations/other) · `expense_category` (text, nullable: faculty_payroll/admin_payroll/utilities/maintenance/supplies/other_expenses/etc.) · `source_template` (text) · `source_sheet_name` (text) · `source_row_number` (int) · `sort_order` (int) · `is_active` (bool default true)

### `schools.fs_line_items` 🆕 *(Operational school FS detailed rows)*
Purpose: preserves detailed school FS receipt, expense, balance, and memo lines while `schools.financial_records` stores monthly school totals.

`id` (uuid PK) · `financial_record_id` (uuid FK → `schools.financial_records.id` on delete cascade) · `account_title_id` (uuid FK → `schools.fs_account_titles.id`) · `section_code` (text) · `subsection_code` (text) · `item_code` (text) · `item_label` (text) · `item_type` (text: receipt/expense/balance/memo) · `amount` (numeric(14,2) default 0) · `notes` (text) · `source_row_number` (int) · `source_label` (text)

### `schools.financial_records` ✅ *(Aligned layout for Star Schema transformation optimization)*
**Header:** `id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `entity_class` (text) · `month` (text) · `year` (smallint) · `status` (text) · `version_no` (int default 1) · `is_current_version` (bool default true) · `record_timestamp` (timestamptz)[cite: 2]  
**Inflow:** `tuition_revenues` (numeric) · `miscellaneous_fees` (numeric) · `other_income` (numeric) · `subsidy_inflow` (numeric)[cite: 2]  
**Outflow:** `faculty_payroll` (numeric) · `admin_staff_payroll` (numeric) · `utilities` (numeric) · `facilities_maintenance` (numeric) · `supplies` (numeric) · `other_expenses` (numeric)[cite: 2]  
**Derived:** `net_receipts` (numeric, stored)[cite: 2]

---

## 5. `seminaries` Schema (Operational Sub-type)

### `seminaries.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `rector` (text) · `enrollment_count` (int) · `capacity_count` (int) · `staff_count` (int)[cite: 2]

### `seminaries.fs_account_titles` 🆕 *(Operational account-title source of truth for seminary FS)*
Purpose: seminary-specific financial statement account dictionary. Kept separate from parish and school account tables because seminary FS logic centers on formation fees, board/lodging, DRM modules, vocation expenses, liturgical supplies, and seminary operating costs.

`id` (uuid PK) · `section_code` (text) · `subsection_code` (text) · `account_code` (text unique) · `account_name` (text) · `account_type` (text: receipt/expense/balance/memo) · `receipt_group` (text, nullable) · `receipt_category` (text, nullable: donations/seminary_fees/mass_collections/other_sources/subsidy/etc.) · `expense_group` (text, nullable: food/transportation/supplies/maintenance/payroll/formation/other) · `expense_category` (text, nullable: daily_food/gasoline/permits/office_supplies/liturgical_supplies/utilities/labor/salaries/benefits/etc.) · `source_template` (text) · `source_sheet_name` (text) · `source_row_number` (int) · `sort_order` (int) · `is_active` (bool default true)

### `seminaries.fs_line_items` 🆕 *(Operational seminary FS detailed rows)*
Purpose: preserves detailed seminary FS receipt, expense, balance, and memo lines while `seminaries.financial_records` stores monthly seminary totals.

`id` (uuid PK) · `financial_record_id` (uuid FK → `seminaries.financial_records.id` on delete cascade) · `account_title_id` (uuid FK → `seminaries.fs_account_titles.id`) · `section_code` (text) · `subsection_code` (text) · `item_code` (text) · `item_label` (text) · `item_type` (text: receipt/expense/balance/memo) · `amount` (numeric(14,2) default 0) · `notes` (text) · `source_row_number` (int) · `source_label` (text)

### `seminaries.financial_records` ✅ *(SEMINARY TEMPLATE + seminaryMockData.ts)*
**Header:** `id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `entity_class` (text) · `month` (text) · `year` (smallint) · `status` (text) · `version_no` (int default 1) · `is_current_version` (bool default true) · `record_timestamp` (timestamptz)[cite: 2]  
**Receipts:** `donations` (numeric) · `seminary_fees` (numeric) · `mass_collections` (numeric) · `other_sources` (numeric) · `subsidy_inflow` *(standardized from central allocations)* (numeric)[cite: 2]  
**Fees Breakdown:** `tuition_fees` (numeric) · `board_lodging_fees` (numeric) · `drm_modules` (numeric) · `sra_reading_lab` (numeric) · `retreat` (numeric) · `honorarium_fee` (numeric) · `miscellaneous_fees` (numeric)[cite: 2]  
**Expenses (22 operational criteria elements):** `daily_food` · `food_others` · `gasoline_seminary` · `gasoline_vocation` · `permits_licenses` · `office_supplies` · `kitchen_equipment` · `medical_supplies` · `liturgical_supplies` · `construction_materials` · `other_supplies` · `lpg` · `repairs_maintenance` · `equipment_furniture` · `utilities` · `labor` · `professional_driver_fee` · `salaries_wages` · `contribution_benefits` · `cash_incentives` · `transportation_bank_charges` · `other_expenses` *(All distinct numeric fields)*[cite: 2]  
**Derived/Metrics:** `net_surplus` (numeric) · `dependency_ratio` *(computed during transformation layer loading = (donations + subsidy_inflow) / total_inflow)*[cite: 2]

---



---

## 5.1 Parish Data Mart Mapping — Operational Detail to Analytics Drill-Down 🆕

The parish mart uses two levels:

| Level | Source / Target | Purpose |
|---|---|---|
| Operational monthly record | `parishes.financial_records` | Official monthly IAFR header, status, verification, and section totals. |
| Operational detail rows | `parishes.iafr_sacrament_lines`, `parishes.iafr_line_items`, `parishes.iafr_employee_contributions` | Exact submitted breakdowns from the 2026 IAFR with source labels and row numbers. |
| Analytics monthly fact | `parish_analytics.fact_parish_monthly_financials` | Official consolidated parish financial report by month; fast dashboard totals, forecasting baseline, health score, and digital twin baseline. |
| Analytics detail fact | `parish_analytics.fact_parish_financial_breakdowns` + `parish_analytics.dim_iafr_account` | Expense/receipt drill-down, anomaly explanation, IAFR breakdown trend analysis, reconciliation. |

### Drill-down retrieval pattern

The detailed expense breakdown should not be read from only `fact_parish_monthly_financials`. The monthly fact stores the official consolidated report row for one parish and one month, while the breakdown rows come from the detail fact joined to the account dimension:

```sql
select
  a.section_code,
  a.subsection_code,
  a.account_name,
  f.amount
from parish_analytics.fact_parish_financial_breakdowns f
join parish_analytics.dim_iafr_account a
  on a.iafr_account_key = f.iafr_account_key
where f.institution_key = :institution_key
  and f.date_key = :date_key
  and a.account_type = 'expense'
order by a.sort_order;
```

### Reconciliation rules

- `parish_analytics.fact_parish_monthly_financials.collections_mass` = sum of `parish_analytics.fact_parish_financial_breakdowns.amount` where `dim_iafr_account.is_mass_collection = true`.
- `parish_analytics.fact_parish_monthly_financials.collections_other_95` = sum where `subsection_code = 'B.2'`.
- `parish_analytics.fact_parish_monthly_financials.collections_other_receipts` = sum of line amounts mapped to the consolidated "other receipts" bucket.
- `parish_analytics.fact_parish_monthly_financials.expenses_pastoral_mass_stipend` + `expenses_parish` = sum of line amounts where `account_type = 'expense'` for the consolidated report scope.
- `parish_analytics.fact_parish_monthly_financials.total_collections` = `sacraments_arancel_confirmation_incl` + `sacraments_parish_share` + `sacraments_over_above_confirmation_incl` + `collections_mass` + `collections_other_95` + `collections_other_receipts`.
- `parish_analytics.fact_parish_monthly_financials.total_expenses` = `expenses_pastoral_mass_stipend` + `expenses_parish`.
- `parish_analytics.fact_parish_monthly_financials.net_receipts_deficit` = `total_collections - total_expenses`.
- `parish_analytics.fact_parish_monthly_financials` and `parish_analytics.fact_parish_financial_breakdowns` connect by shared monthly grain: `parish_key`, `date_key`, and optionally `submission_key` when version traceability is required.

---

## 6. Analytics Schemas (Separated Star Schema Layer) 🆕

To support logical isolation, security boundaries, and clear workflows, the analytics layer is physically separated into four PostgreSQL schemas. Cross-schema relationships are maintained using standard foreign keys pointing to the shared dimensions.

---

### 6.1 `shared_analytics` Schema — Central Shared Analytical Layer
Dimensions, facts, and model outputs shared across all types of diocesan institutions.

#### Dimensions
**`shared_analytics.dim_institutions`** ✅ — Core parent dimension for all entities:
`institution_key` (serial PK) · `institution_id` (uuid) · `institution_name` (text) · `entity_type` (text: parish/school/seminary)

**`shared_analytics.dim_date`** — Time surrogate dimension mapping date keys:
`date_key` (int PK `YYYYMM`) · `month_name` (text) · `month_number` (smallint) · `month_short` (text) · `year` (smallint) · `quarter` (text) · `academic_year_period` (bool) · `is_fiesta_season` (bool)

**`shared_analytics.dim_submission`** 🆕 — Analytical batch mapping:
`submission_key` (serial PK) · `submission_batch_id` (uuid FK → `operations.submission_batches.id`) · `financial_record_id` (uuid) · `source_file_name` (text) · `submitted_by` (uuid FK → `diocese.profiles.id`) · `submitted_at` (timestamptz) · `verified_by` (uuid FK → `diocese.profiles.id`) · `verified_at` (timestamptz) · `status` (text) · `version_no` (int) · `is_current_version` (bool)

#### Analytical / ML Engine Inference Layer & Registry
**`shared_analytics.model_runs`** 🆕 — Inference execution tracker:
`id` (uuid PK) · `model_name` (text) · `model_version` (text) · `model_type` (text: forecast/anomaly/health_score/assignment_recommendation/optimization) · `input_start_date` (date) · `input_end_date` (date) · `run_status` (text: pending/running/succeeded/failed) · `metrics` (jsonb) · `started_at` (timestamptz) · `finished_at` (timestamptz) · `created_by` (uuid FK → `diocese.profiles.id`, nullable)

Forecast, anomaly, and health-score outputs are stored in each institution-specific analytics schema because account-level model outputs use different account dimensions for parishes, schools, and seminaries. Use consolidated views when diocesan-level reporting needs one shared shape.
**`shared_analytics.fact_subsidy_allocations`** ✅ — MILP solver runs:
`allocation_id` (uuid PK) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`) · `run_key` (uuid) · `annual_deficit` (numeric(14,2)) · `recommended_subsidy` (numeric(14,2)) · `allocated_subsidy` (numeric(14,2)) · `run_at` (timestamptz)

---

### 6.2 `parish_analytics` Schema — Parish-Specific Analytical Layer
Fact tables, outriggers, and account dimensions dedicated to parishes.

#### Dimensions
**`parish_analytics.dim_parishes`** 🆕 — Parish dimension with its own primary key, linked back to the shared institution identity, and holding parish-only administrative and geographic attributes:
`parish_key` (serial PK) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`, unique) · `vicariate` (text) · `district` (text) · `cluster` (text) · `pastor` (text) · `primary_patron` (text) · `secondary_patron` (text, nullable) · `fiesta_date` (date) · `address` (text) · `lat` (numeric) · `lng` (numeric)

**`parish_analytics.dim_iafr_account`** 🆕 — Parish analytical account titles catalog:
`iafr_account_key` (serial PK) · `source_account_title_id` (uuid FK → `parishes.iafr_account_titles.id`) · `section_code` (text: A–F) · `subsection_code` (text, e.g., A.1/D.3) · `account_code` (text unique) · `account_name` (text) · `account_type` (text) · `classification` (text) · `is_arancel_related` (bool) · `is_mass_collection` (bool) · `is_remittable` (bool) · `sort_order` (int)

#### Fact Tables
**`parish_analytics.fact_parish_monthly_financials`** 🆕 — Official consolidated parish financial report by month, stored as one analytics-ready row per parish per month:
`parish_key` (int FK → `parish_analytics.dim_parishes.parish_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`) · `sacraments_arancel_confirmation_incl` (numeric) · `sacraments_parish_share` (numeric) · `sacraments_over_above_confirmation_incl` (numeric) · `collections_mass` (numeric) · `collections_other_95` (numeric) · `collections_other_receipts` (numeric) · `total_collections` (numeric) · `expenses_pastoral_mass_stipend` (numeric) · `expenses_parish` (numeric) · `total_expenses` (numeric) · `net_receipts_deficit` (numeric) · `mass_intentions_not_claimed_by_parish_priest` (numeric) · `mass_intentions_claimed_by_parish_priest` (numeric) · `special_collections` (numeric) · `pastoral_parish_fund_total_net_receipts_deficit` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `has_fiesta` (bool) · `total_rainfall_mm` (numeric) — PK (`parish_key`, `date_key`)

**`parish_analytics.fact_parish_financial_breakdowns`** 🆕 — Granular account-level breakdown facts supporting drill-down and the roll-up into the monthly consolidated report:
`parish_key` (int FK → `parish_analytics.dim_parishes.parish_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`, nullable if backfilled) · `iafr_account_key` (int FK → `parish_analytics.dim_iafr_account.iafr_account_key`) · `amount` (numeric) — PK (`parish_key`, `date_key`, `iafr_account_key`)

**`parish_analytics.fact_parish_financial_forecasts`** 🆕 — Parish model forecast outputs for monthly KPIs and account-level IAFR amounts:
`forecast_id` (uuid PK) · `parish_key` (int FK → `parish_analytics.dim_parishes.parish_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `model_run_id` (uuid FK → `shared_analytics.model_runs.id`) · `forecast_level` (text: monthly_kpi/account_breakdown) · `metric_type` (text) · `iafr_account_key` (int FK → `parish_analytics.dim_iafr_account.iafr_account_key`, nullable) · `predicted_value` (numeric) · `lower_confidence` (numeric) · `upper_confidence` (numeric)

**`parish_analytics.fact_parish_anomaly_alerts`** 🆕 — Parish anomaly outputs for monthly and account-level financial behavior:
`alert_id` (uuid PK) · `parish_key` (int FK → `parish_analytics.dim_parishes.parish_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `iafr_account_key` (int FK → `parish_analytics.dim_iafr_account.iafr_account_key`, nullable) · `anomaly_score` (numeric) · `is_anomaly` (bool) · `severity_level` (text) · `anomaly_type` (text)

**`parish_analytics.fact_parish_health_snapshots`** 🆕 — Parish monthly financial health scoring outputs:
`snapshot_id` (uuid PK) · `parish_key` (int FK → `parish_analytics.dim_parishes.parish_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `composite_score` (numeric) · `liquidity_score` (numeric) · `sustainability_score` (numeric) · `stability_score` (numeric)

---

### 6.3 `school_analytics` Schema — School-Specific Analytical Layer
Fact tables, outriggers, and account dimensions dedicated to schools.

#### Dimensions
**`school_analytics.dim_schools`** 🆕 — School dimension with its own primary key, linked back to the shared institution identity, and holding school-only attributes:
`school_key` (serial PK) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`, unique) · `principal` (text) · `level` (text) · `address` (text)

**`school_analytics.dim_school_fs_account`** 🆕 — School analytical account titles catalog:
`school_account_key` (serial PK) · `source_account_title_id` (uuid FK → `schools.fs_account_titles.id`) · `section_code` (text) · `subsection_code` (text) · `account_code` (text unique) · `account_name` (text) · `account_type` (text: receipt/expense/balance/memo) · `classification` (text) · `sort_order` (int)

#### Fact Tables
**`school_analytics.fact_school_monthly_financials`** 🆕 — Consolidated school monthly financial report, stored as one analytics-ready row per school per month:
`school_key` (int FK → `school_analytics.dim_schools.school_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`) · `tuition_revenues` (numeric) · `miscellaneous_fees` (numeric) · `other_income` (numeric) · `subsidy_inflow` (numeric) · `faculty_payroll` (numeric) · `admin_staff_payroll` (numeric) · `utilities` (numeric) · `facilities_maintenance` (numeric) · `supplies` (numeric) · `other_expenses` (numeric) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_receipts` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `total_rainfall_mm` (numeric) — PK (`school_key`, `date_key`)

**`school_analytics.fact_school_financial_breakdowns`** 🆕 — Granular account-level breakdown facts supporting drill-down and the roll-up into the monthly consolidated report:
`school_key` (int FK → `school_analytics.dim_schools.school_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`, nullable if backfilled) · `school_account_key` (int FK → `school_analytics.dim_school_fs_account.school_account_key`) · `amount` (numeric) — PK (`school_key`, `date_key`, `school_account_key`)

**`school_analytics.fact_school_financial_forecasts`** 🆕 — School model forecast outputs for monthly KPIs and account-level school FS amounts:
`forecast_id` (uuid PK) · `school_key` (int FK → `school_analytics.dim_schools.school_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `model_run_id` (uuid FK → `shared_analytics.model_runs.id`) · `forecast_level` (text: monthly_kpi/account_breakdown) · `metric_type` (text) · `school_account_key` (int FK → `school_analytics.dim_school_fs_account.school_account_key`, nullable) · `predicted_value` (numeric) · `lower_confidence` (numeric) · `upper_confidence` (numeric)

**`school_analytics.fact_school_anomaly_alerts`** 🆕 — School anomaly outputs for monthly and account-level financial behavior:
`alert_id` (uuid PK) · `school_key` (int FK → `school_analytics.dim_schools.school_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `school_account_key` (int FK → `school_analytics.dim_school_fs_account.school_account_key`, nullable) · `anomaly_score` (numeric) · `is_anomaly` (bool) · `severity_level` (text) · `anomaly_type` (text)

**`school_analytics.fact_school_health_snapshots`** 🆕 — School monthly financial health scoring outputs:
`snapshot_id` (uuid PK) · `school_key` (int FK → `school_analytics.dim_schools.school_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `composite_score` (numeric) · `liquidity_score` (numeric) · `sustainability_score` (numeric) · `stability_score` (numeric)

---

### 6.4 `seminary_analytics` Schema — Seminary-Specific Analytical Layer
Fact tables, outriggers, and account dimensions dedicated to seminaries.

#### Dimensions
**`seminary_analytics.dim_seminaries`** 🆕 — Seminary dimension with its own primary key, linked back to the shared institution identity, and holding seminary-only attributes:
`seminary_key` (serial PK) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`, unique) · `rector` (text) · `address` (text)

**`seminary_analytics.dim_seminary_fs_account`** 🆕 — Seminary analytical account titles catalog:
`seminary_account_key` (serial PK) · `source_account_title_id` (uuid FK → `seminaries.fs_account_titles.id`) · `section_code` (text) · `subsection_code` (text) · `account_code` (text unique) · `account_name` (text) · `account_type` (text: receipt/expense/balance/memo) · `classification` (text) · `sort_order` (int)

#### Fact Tables
**`seminary_analytics.fact_seminary_monthly_financials`** 🆕 — Consolidated seminary monthly financial report, stored as one analytics-ready row per seminary per month:
`seminary_key` (int FK → `seminary_analytics.dim_seminaries.seminary_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`) · `donations` (numeric) · `seminary_fees` (numeric) · `mass_collections` (numeric) · `other_sources` (numeric) · `subsidy_inflow` (numeric) · `tuition_fees` (numeric) · `board_lodging_fees` (numeric) · `daily_food` (numeric) · `utilities` (numeric) · `salaries_wages` (numeric) · `contribution_benefits` (numeric) · `other_expenses` (numeric) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_surplus` (numeric) · `dependency_ratio` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `total_rainfall_mm` (numeric) — PK (`seminary_key`, `date_key`)

**`seminary_analytics.fact_seminary_financial_breakdowns`** 🆕 — Granular account-level breakdown facts supporting drill-down and the roll-up into the monthly consolidated report:
`seminary_key` (int FK → `seminary_analytics.dim_seminaries.seminary_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `submission_key` (int FK → `shared_analytics.dim_submission.submission_key`, nullable if backfilled) · `seminary_account_key` (int FK → `seminary_analytics.dim_seminary_fs_account.seminary_account_key`) · `amount` (numeric) — PK (`seminary_key`, `date_key`, `seminary_account_key`)

**`seminary_analytics.fact_seminary_financial_forecasts`** 🆕 — Seminary model forecast outputs for monthly KPIs and account-level seminary FS amounts:
`forecast_id` (uuid PK) · `seminary_key` (int FK → `seminary_analytics.dim_seminaries.seminary_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `model_run_id` (uuid FK → `shared_analytics.model_runs.id`) · `forecast_level` (text: monthly_kpi/account_breakdown) · `metric_type` (text) · `seminary_account_key` (int FK → `seminary_analytics.dim_seminary_fs_account.seminary_account_key`, nullable) · `predicted_value` (numeric) · `lower_confidence` (numeric) · `upper_confidence` (numeric)

**`seminary_analytics.fact_seminary_anomaly_alerts`** 🆕 — Seminary anomaly outputs for monthly and account-level financial behavior:
`alert_id` (uuid PK) · `seminary_key` (int FK → `seminary_analytics.dim_seminaries.seminary_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `seminary_account_key` (int FK → `seminary_analytics.dim_seminary_fs_account.seminary_account_key`, nullable) · `anomaly_score` (numeric) · `is_anomaly` (bool) · `severity_level` (text) · `anomaly_type` (text)

**`seminary_analytics.fact_seminary_health_snapshots`** 🆕 — Seminary monthly financial health scoring outputs:
`snapshot_id` (uuid PK) · `seminary_key` (int FK → `seminary_analytics.dim_seminaries.seminary_key`) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `composite_score` (numeric) · `liquidity_score` (numeric) · `sustainability_score` (numeric) · `stability_score` (numeric)

---

### 6.5 `priest_assignment_analytics` Schema — Priest Assignment Analytical Layer
Priest assignment analytics is a separate decision-support mart because it uses parish and seminary financial evidence but produces priest-assignment-specific outputs.

#### Dimensions
**`priest_assignment_analytics.dim_priests`** 🆕 — Priest profile dimension for assignment recommendations and assignment history:
`priest_key` (serial PK) · `profile_id` (uuid) · `full_name` (text) · `email` (text) · `contact_number` (text) · `is_active` (bool)

#### Fact Tables
**`priest_assignment_analytics.fact_priest_assignment_recommendations`** 🆕 — Model-generated priest assignment recommendations for parish or seminary targets:
`recommendation_id` (uuid PK) · `priest_key` (int FK → `priest_assignment_analytics.dim_priests.priest_key`) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`) · `institution_type` (text: parish/seminary) · `date_key` (int FK → `shared_analytics.dim_date.date_key`) · `model_run_id` (uuid FK → `shared_analytics.model_runs.id`) · `recommended_role` (text) · `recommendation_type` (text: new_assignment/transfer/temporary_support) · `recommendation_score` (numeric) · `priority_level` (text) · `financial_need_score` (numeric) · `stability_score` (numeric) · `forecast_risk_score` (numeric) · `anomaly_risk_score` (numeric) · `explanation` (jsonb) · `recommendation_status` (text: candidate/selected/rejected)

**`priest_assignment_analytics.fact_priest_assignments`** 🆕 — Analytical priest assignment history used to evaluate assignment outcomes over time:
`priest_key` (int FK → `priest_assignment_analytics.dim_priests.priest_key`) · `institution_key` (int FK → `shared_analytics.dim_institutions.institution_key`) · `institution_type` (text: parish/seminary) · `start_date_key` (int FK → `shared_analytics.dim_date.date_key`) · `end_date_key` (int FK → `shared_analytics.dim_date.date_key`, nullable) · `assignment_role` (text) · `status` (text) · `is_active` (bool) — PK (`priest_key`, `institution_key`, `start_date_key`)

---

### 6.6 Views *(Unified logical schema objects without physical column footprints)*

#### `shared_analytics.diocesan_consolidated_financials`
Yields a uniform pipeline interface structure across schemas using SQL `UNION ALL`:
*   `entity_type` (text) · `institution_id` (uuid) · `month` (text) · `year` (smallint) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_receipts` (numeric) · `diocesan_share_inflow` (numeric)

---

## 7. `sandbox` Schema — Digital Twin & What-if Analysis Workspace 🆕

The `sandbox` schema is the safe simulation layer for PAULUS. It stores Digital Twin baselines and What-if Analysis scenarios without modifying official submitted IAFR/FS records or production analytics facts.

**Design rule:**  
- `analytics.fact_*` = actual validated analytics baseline.  
- `sandbox.digital_twin_snapshots` = copied baseline state at a point in time.  
- `sandbox.scenario_*` = hypothetical user changes and projected outputs.

### `sandbox.digital_twin_snapshots` 🆕
Monthly baseline copy of an institution’s validated financial state, derived from analytics fact tables.

`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `entity_type` (text: parish/school/seminary) · `year` (smallint) · `month` (smallint 1–12) · `date_key` (int) · `baseline_total_inflow` (numeric(14,2) default 0) · `baseline_total_outflow` (numeric(14,2) default 0) · `baseline_net_receipts` (numeric(14,2) default 0) · `baseline_beginning_balance` (numeric(14,2) default 0) · `baseline_ending_balance` (numeric(14,2) default 0) · `baseline_remittance` (numeric(14,2) default 0) · `baseline_subsidy_inflow` (numeric(14,2) default 0) · `baseline_health_score` (numeric(5,2), nullable) · `baseline_risk_level` (text, nullable) · `baseline_cluster_label` (text, nullable) · `source_fact_table` (text) · `source_fact_key` (jsonb) · `source_financial_record_id` (uuid, nullable) · `source_submission_batch_id` (uuid, nullable) · `generated_at` (timestamptz default now()) — Unique (`institution_id`, `year`, `month`)

### `sandbox.scenario_runs` 🆕
Header table for each saved What-if Analysis scenario.

`id` (uuid PK) · `name` (text) · `description` (text) · `created_by` (uuid FK → `diocese.profiles.id`) · `scope` (text: single_institution/vicariate/district/diocese) · `scenario_type` (text: budget_adjustment/collection_change/expense_change/subsidy_allocation/remittance_adjustment/weather_disruption/construction_project/priest_assignment/custom) · `base_year` (smallint) · `base_month` (smallint 1–12) · `status` (text: draft/computed/archived) · `created_at` (timestamptz default now()) · `computed_at` (timestamptz, nullable)

### `sandbox.scenario_institutions` 🆕
Bridge table listing which institutions are included in a scenario. This supports one-parish, vicariate-level, district-level, and whole-diocese simulations.

`id` (uuid PK) · `scenario_run_id` (uuid FK → `sandbox.scenario_runs.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `digital_twin_snapshot_id` (uuid FK → `sandbox.digital_twin_snapshots.id`) — Unique (`scenario_run_id`, `institution_id`)

### `sandbox.scenario_inputs` 🆕
Stores the assumptions changed by the user.

`id` (uuid PK) · `scenario_run_id` (uuid FK → `sandbox.scenario_runs.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `metric_name` (text, e.g., `collections_sunday`, `utilities`, `subsidy_inflow`, `construction_expenses`) · `adjustment_type` (text: absolute_value/increase_amount/decrease_amount/increase_percent/decrease_percent) · `adjustment_value` (numeric(14,4)) · `start_year` (smallint) · `start_month` (smallint 1–12) · `end_year` (smallint) · `end_month` (smallint 1–12) · `notes` (text)

### `sandbox.scenario_results` 🆕
Stores the projected summary result after applying the scenario inputs to the Digital Twin baseline.

`id` (uuid PK) · `scenario_run_id` (uuid FK → `sandbox.scenario_runs.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `year` (smallint) · `month` (smallint 1–12) · `date_key` (int) · `projected_total_inflow` (numeric(14,2) default 0) · `projected_total_outflow` (numeric(14,2) default 0) · `projected_net_receipts` (numeric(14,2) default 0) · `projected_ending_balance` (numeric(14,2) default 0) · `projected_remittance` (numeric(14,2) default 0) · `projected_subsidy_need` (numeric(14,2) default 0) · `projected_health_score` (numeric(5,2), nullable) · `projected_risk_level` (text, nullable) · `projected_cluster_label` (text, nullable) · `delta_total_inflow` (numeric(14,2)) · `delta_total_outflow` (numeric(14,2)) · `delta_net_receipts` (numeric(14,2)) · `delta_ending_balance` (numeric(14,2)) · `delta_health_score` (numeric(5,2)) · `explanation` (jsonb) · `generated_at` (timestamptz default now())

### `sandbox.scenario_result_lines` 🆕
Stores the projected detailed line-level breakdown for drill-down comparison. Use this when a user wants to see which IAFR account changed inside the scenario.

`id` (uuid PK) · `scenario_result_id` (uuid FK → `sandbox.scenario_results.id`) · `institution_type` (text: parish/school/seminary) · `iafr_account_key` (int FK → `parish_analytics.dim_iafr_account.iafr_account_key`, nullable) · `school_account_key` (int FK → `school_analytics.dim_school_fs_account.school_account_key`, nullable) · `seminary_account_key` (int FK → `seminary_analytics.dim_seminary_fs_account.seminary_account_key`, nullable) · `metric_name` (text) · `account_label` (text denormalized for display safety) · `baseline_amount` (numeric(14,2) default 0) · `projected_amount` (numeric(14,2) default 0) · `delta_amount` (numeric(14,2) default 0) · `explanation` (text)

### Sandbox Flow
```text
parish_analytics.fact_parish_* / school_analytics.fact_school_* / seminary_analytics.fact_seminary_*
        ↓
sandbox.digital_twin_snapshots
        ↓
sandbox.scenario_runs + sandbox.scenario_inputs
        ↓
sandbox.scenario_results
        ↓
sandbox.scenario_result_lines
```

### Sandbox Reconciliation Rule
Sandbox outputs are never written back to operational or analytics fact tables. A scenario may be promoted into a recommendation or report, but it must not mutate submitted IAFR/FS records.


## 8. `reference` Schema — Climate & Liturgical Time Context

### `reference.liturgical_calendar` 🆕 *(Standardized from the Ordo/Philippine Rite)*
`id` (uuid PK) · `date` (date unique) · `year` (smallint) · `liturgical_season` (text: Advent/Christmas/Lent/Easter/Ordinary Time) · `feast_name` (text) · `rank` (text: Solemnity/Feast/Memorial/Optional) · `liturgical_color` (text) · `is_holy_day_of_obligation` (bool) · `has_special_collection` (bool) · `special_collection_name` (text, nullable) · `expected_collection_impact` (text: low/medium/high) · `notes` (text)[cite: 2]

### `reference.weather_observations` 🆕 *(Sourced from OpenWeather/PAGASA daily logs)*
`id` (uuid PK) · `date` (date) · `institution_id` (uuid FK → `diocese.institutions.id`, nullable for regional province-wide overrides) · `location` (text) · `condition` (text: sunny/rainy/stormy/cloudy) · `temp_avg_c` (numeric) · `rainfall_mm` (numeric) · `typhoon_signal` (smallint references range 0–5) · `is_extreme_event` (bool) · `source` (text) · `recorded_at` (timestamptz)[cite: 2]

---

## 9. Legacy Compatibility Layer

The current backend implementation code (`financial.service.ts`) communicates via a monolithic query layout structure[cite: 2]. The following view map preserves existing application routing workflows while transforming operational engines into foundational normalization blocks safely[cite: 2]:

| App / Legacy Single Table Column | Operational Structural Source Mapping Pipeline |
|---|---|
| `entity_id`[cite: 2] | `diocese.institutions.id`[cite: 2] |
| `entity_type`[cite: 2] | `diocese.institutions.entity_type`[cite: 2] |
| `entity_class`[cite: 2] | Stored `entity_class` attribute tracker within relevant institution record row[cite: 2] |
| `collections`[cite: 2] | Consolidated total inflows calculation mapping variable[cite: 2] |
| `consumable_collections`[cite: 2] | `parishes.financial_records.consumable_collections`[cite: 2] |
| `disbursements`[cite: 2] | Consolidated operational expenditures matching row balance[cite: 2] |
| `net_receipts`[cite: 2] | `net_receipts` metric calculation output fields[cite: 2] |
| `sacraments_rate` / `_arancel` / `_parish_share` / `_over_above`[cite: 2] | Detailed analytical elements parsed from subsection tracking array A.1[cite: 2] |
| `collections_mass`[cite: 2] | Consolidated balance matching `mass_collection_weekday` + `sunday` + `saturday`[cite: 2] |
| `collections_other`[cite: 2] | `other_collections_total` section fields[cite: 2] |
| `collections_other_receipts`[cite: 2] | `other_receipts` index pointers[cite: 2] |
| `expenses_pastoral`[cite: 2] | Aggregation targets summarizing variables from checklist tracking item structure C[cite: 2] |
| `expenses_parish`[cite: 2] | Aggregation targets summarizing operational indicators from structural metric log D[cite: 2] |
| `others_mass_intentions_not_claimed` / `_claimed`[cite: 2] | `mass_intentions_unclaimed` and `_claimed` storage trackers[cite: 2] |
| `others_special_collections`[cite: 2] | `special_collections` variable pointers[cite: 2] |
| `pastoral_parish_fund_total_net_receipts`[cite: 2] | Derived transactional system indicator computations[cite: 2] |
| `record_timestamp`[cite: 2] | `record_timestamp` temporal parameters data point context[cite: 2] |

---

## Coverage & System Consistency Verification

| Schema Namespace | Tables Footprint | Integrity & Mapping Validation Tracking Notes |
| :--- | :--- | :--- |
| **`diocese`**[cite: 2] | 10[cite: 2] | Extended structure with master `institutions` tracking schema to decouple cascading dependencies reliably[cite: 2]. |
| **`operations`** 🆕 | 3 | Shared submission, validation, and reconciliation controls across parish IAFR, school FS, and seminary FS uploads. |
| **`parishes`**[cite: 2] | 9[cite: 2] | Separated operational schema for IAFR-specific business rules, account titles, arancel lines, generic line items, employee contributions, and parish-only access boundaries. |
| **`schools`**[cite: 2] | 4[cite: 2] | Separated operational schema for school FS-specific account titles, detailed line items, tuition/fee logic, payroll, facilities, and school-only access boundaries. |
| **`seminaries`**[cite: 2] | 4[cite: 2] | Separated operational schema for seminary FS-specific account titles, detailed line items, formation fees, board/lodging, vocation-related expenses, and seminary-only access boundaries. |
| **`shared_analytics`** 🆕 | 5 | Shared institution/date/submission dimensions, model run registry, and cross-institution subsidy optimization facts. Forecast, anomaly, and health outputs are stored in institution-specific schemas. |
| **`parish_analytics`** 🆕 | 7 | Parish dimension, IAFR account catalog, monthly financial facts, breakdown facts, parish forecasts, parish anomaly alerts, and parish health snapshots. |
| **`school_analytics`** 🆕 | 7 | School dimension, school FS account catalog, monthly financial facts, breakdown facts, school forecasts, school anomaly alerts, and school health snapshots. |
| **`seminary_analytics`** 🆕 | 7 | Seminary dimension, seminary FS account catalog, monthly financial facts, breakdown facts, seminary forecasts, seminary anomaly alerts, and seminary health snapshots. |
| **`priest_assignment_analytics`** 🆕 | 3 | Priest dimension, priest assignment recommendation facts, and priest assignment history facts for parish/seminary assignment analytics. |
| **`sandbox`** 🆕 | 6 | Digital Twin snapshots and What-if Analysis scenario tables, kept separate from official operational submissions and production analytics facts. |
| **`reference`**[cite: 2] | 2[cite: 2] | Daily weather indices and liturgical event dimensions configured for the model analytics engine[cite: 2]. |

















