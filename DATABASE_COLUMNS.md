# Diocese of San Pablo — Full Column Specification (Hybrid Model)

Canonical, typed column definitions for every table, grounded in the actual UI (`src/types.ts`, the views, the `src/microservices/*` service mappers) and the two source forms (`IAFR FORM.xlsx`, `SEMINARY TEMPLATE.xlsx`)[cite: 2]. This schema incorporates structural updates to resolve polymorphic relationship gaps, daily-to-monthly forecasting input granularity mismatches, and audit trail index scaling issues[cite: 2].

## Architecture — Two Layers, One Job Each

| Layer | Purpose | Tables |
| :--- | :--- | :--- |
| **Operational** | Capture each entity's data *as entered on its form* — no foreign-shaped nulls[cite: 2]. Enforces strict referential integrity via a centralized institutional super-type model[cite: 2]. | `diocese.institutions`, `parishes.financial_records` (IAFR), `schools.financial_records`, `seminaries.financial_records`, plus the details and calendar tables[cite: 2]. |
| **Analytics** | One uniform shape for all dashboards, forecasting, anomaly detection, health scoring, and subsidy optimization linear programming models[cite: 1, 2]. | `dim_*` + `fact_*` star schema[cite: 2]. |

A transform step rolls operational rows up into `fact_monthly_financials` / `fact_monthly_expenses` (the "Step 1 → Step 6" mapping in `DATABASE_SCHEMA.md`)[cite: 2].

> **Compatibility during migration:** The app today reads a single flat `financial_records` table via `financial.service.ts`[cite: 2]. Expose `analytics.diocesan_consolidated_financials` (or a thin `public.financial_records` view) so existing queries keep working while the operational tables become the source of truth underneath[cite: 2]. See §7 for the legacy column map[cite: 2].

### Conventions
- **Money** → `numeric(14,2)` default `0`[cite: 2].
- **Keys** → Operational tables use `uuid` for primary keys to ensure scale and balance; analytics uses integer surrogate keys (`*_key`)[cite: 2].
- **Time** → `month` stored short (`'Jan'`..`'Dec'`) + `year smallint`[cite: 2]; analytics maps to `date_key` (`YYYYMM`)[cite: 2].
- Every table has `created_at timestamptz default now()`, `updated_at timestamptz`, and soft-delete `deleted_at timestamptz` (omitted below for brevity)[cite: 2].
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
`id` (uuid PK = auth uid) · `full_name` (text) · `email` (text unique) · `role_id` (text FK → `diocese.roles.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `contact_number` (text) · `is_active` (bool) · `last_login_at` (timestamptz)

### `diocese.priest_assignments` 🆕
`id` (uuid PK) · `profile_id` (uuid FK → `diocese.profiles.id`) · `institution_id` (uuid FK → `diocese.institutions.id`) · `role_id` (text FK → `diocese.roles.id`) · `start_date` (date) · `end_date` (date, nullable) · `status` (text: active/completed/transferred) · `decree_reference` (text, nullable)[cite: 2]

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

## 2. `parishes` Schema (Operational Sub-type)

### `parishes.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `pastor` (text) · `primary_patron` (text) · `secondary_patron` (text) · `fiesta_date` (date)[cite: 2]

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

**A. Pastoral Fund Receipts** — `sacraments_total` (A.1) · `confirmation_total` (A.2) · `mass_intentions_total` · `mass_intentions_claimed` · `mass_intentions_unclaimed` (A.3)[cite: 2]

**B. Parish Fund Receipts** — `mass_collection_weekday` · `mass_collection_sunday` · `mass_collection_saturday` (B.1) · `consumable_collections` *(headline consumable operational cash)* · `other_collections_total` (B.2) · `donations` · `interest_income` · `subsidy_inflow` *(standardized operational flow)* · `special_collections` · `second_collections` · `charge_over_above` · `other_receipts` (B.3)[cite: 2]

**C. Pastoral Fund Expenses** — `priest_share` (C.1) · `mass_stipend` (C.2) · `other_pastoral_expenses` (C.3)[cite: 2]

**D. Parish Operating & Rectory Expenses** — `salaries_wages_benefits` (D.1) · `govt_contributions` (D.2) · `utilities` (D.3) · `communications` (D.4) · `other_rectory_expenses` (D.5)[cite: 2]

**E. Construction** — `construction_receipts` (E.1) · `construction_expenses` (E.2)[cite: 2]

**F. Remittances & Balances** — `remittance_to_diocese` (F.1) · `bishops_fund_share` (F.2) · `special_collections_remittance` (F.3) · `beginning_balance` · `ending_balance_before_remit` · `ending_balance_after_remit`[cite: 2]

**Derived Variables** — `net_receipts` (numeric, stored) · `pastoral_parish_fund_total_net_receipts` (numeric, stored)[cite: 2]  
*Note: total_inflow = A+B · total_outflow = C+D — dynamically computed and rolled into the analytical layer.*[cite: 2]

### `parishes.fiesta_events` ✅
`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `primary_patron` (text) · `secondary_patron` (text) · `date` (date) · `expected_impact` (text: low/medium/high) · `estimated_collection_increase` (numeric)[cite: 2]

### `parishes.local_calendar` 🆕 *(Per-parish contextual forecasting input)*
`id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `event_date` (date) · `end_date` (date) · `title` (text) · `event_type` (text: fiesta/novena/recollection/wedding-season/outreach/construction/other) · `expected_financial_impact` (text: inflow/outflow/both/none) · `estimated_amount` (numeric) · `linked_fiesta_id` (uuid FK → `parishes.fiesta_events.id`, nullable) · `linked_project_id` (uuid FK → `diocese.projects.id`, nullable) · `notes` (text)[cite: 2]

---

## 3. `schools` Schema (Operational Sub-type)

### `schools.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `principal` (text) · `level` (text, e.g., `'K-12'`) · `enrollment_count` (int) · `capacity_count` (int) · `staff_count` (int)[cite: 2]

### `schools.financial_records` ✅ *(Aligned layout for Star Schema transformation optimization)*
**Header:** `id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `entity_class` (text) · `month` (text) · `year` (smallint) · `status` (text) · `record_timestamp` (timestamptz)[cite: 2]  
**Inflow:** `tuition_revenues` (numeric) · `miscellaneous_fees` (numeric) · `other_income` (numeric) · `subsidy_inflow` (numeric)[cite: 2]  
**Outflow:** `faculty_payroll` (numeric) · `admin_staff_payroll` (numeric) · `utilities` (numeric) · `facilities_maintenance` (numeric) · `supplies` (numeric) · `other_expenses` (numeric)[cite: 2]  
**Derived:** `net_receipts` (numeric, stored)[cite: 2]

---

## 4. `seminaries` Schema (Operational Sub-type)

### `seminaries.details` ✅ *(1:1 Sub-type extension)*
`institution_id` (uuid PK & FK → `diocese.institutions.id`) · `rector` (text) · `enrollment_count` (int) · `capacity_count` (int) · `staff_count` (int)[cite: 2]

### `seminaries.financial_records` ✅ *(SEMINARY TEMPLATE + seminaryMockData.ts)*
**Header:** `id` (uuid PK) · `institution_id` (uuid FK → `diocese.institutions.id`) · `entity_class` (text) · `month` (text) · `year` (smallint) · `status` (text) · `record_timestamp` (timestamptz)[cite: 2]  
**Receipts:** `donations` (numeric) · `seminary_fees` (numeric) · `mass_collections` (numeric) · `other_sources` (numeric) · `subsidy_inflow` *(standardized from central allocations)* (numeric)[cite: 2]  
**Fees Breakdown:** `tuition_fees` (numeric) · `board_lodging_fees` (numeric) · `drm_modules` (numeric) · `sra_reading_lab` (numeric) · `retreat` (numeric) · `honorarium_fee` (numeric) · `miscellaneous_fees` (numeric)[cite: 2]  
**Expenses (22 operational criteria elements):** `daily_food` · `food_others` · `gasoline_seminary` · `gasoline_vocation` · `permits_licenses` · `office_supplies` · `kitchen_equipment` · `medical_supplies` · `liturgical_supplies` · `construction_materials` · `other_supplies` · `lpg` · `repairs_maintenance` · `equipment_furniture` · `utilities` · `labor` · `professional_driver_fee` · `salaries_wages` · `contribution_benefits` · `cash_incentives` · `transportation_bank_charges` · `other_expenses` *(All distinct numeric fields)*[cite: 2]  
**Derived/Metrics:** `net_surplus` (numeric) · `dependency_ratio` *(computed during transformation layer loading = (donations + subsidy_inflow) / total_inflow)*[cite: 2]

---

## 5. `analytics` Schema — Consolidated Star Schema

### Dimensions
**`dim_institutions`** ✅ — `institution_key` (serial PK) · `institution_id` (uuid) · `institution_name` · `entity_type` · `class` · `lat` · `lng` · `is_active` (bool)

**`dim_parishes`** 🆕 — `institution_key` (int PK & FK → `dim_institutions.institution_key`) · `vicariate` (text) · `district` (text) · `cluster` (text) · `pastor` (text) · `primary_patron` (text) · `secondary_patron` (text, nullable) · `fiesta_date` (date) · `address` (text)

**`dim_schools`** 🆕 — `institution_key` (int PK & FK → `dim_institutions.institution_key`) · `principal` (text) · `level` (text) · `address` (text)

**`dim_seminaries`** 🆕 — `institution_key` (int PK & FK → `dim_institutions.institution_key`) · `rector` (text) · `address` (text)

**`dim_date`** — `date_key` (int PK `YYYYMM`) · `month_name` · `month_number` · `month_short` · `year` · `quarter` · `academic_year_period` (bool: handles non-profit tuition cycles) · `is_fiesta_season` (bool)[cite: 2]

**`dim_expense_categories`** — `category_key` (int PK) · `category_name` · `category_description` · `applies_to` (text framework seed references)[cite: 2]

**`dim_priests`** 🆕 — `priest_key` (serial PK) · `profile_id` (uuid) · `full_name` (text) · `email` (text) · `contact_number` (text) · `is_active` (bool)[cite: 2]

### Core Facts (The Transformation Layer Target)

**`fact_parish_monthly_financials`** 🆕
`institution_key` (int FK) · `date_key` (int FK) · `sacraments_total` (numeric) · `confirmation_total` (numeric) · `mass_intentions_total` (numeric) · `mass_intentions_claimed` (numeric) · `mass_intentions_unclaimed` (numeric) · `mass_collection_weekday` (numeric) · `mass_collection_sunday` (numeric) · `mass_collection_saturday` (numeric) · `consumable_collections` (numeric) · `other_collections_total` (numeric) · `donations` (numeric) · `interest_income` (numeric) · `subsidy_inflow` (numeric) · `special_collections` (numeric) · `second_collections` (numeric) · `charge_over_above` (numeric) · `other_receipts` (numeric) · `priest_share` (numeric) · `mass_stipend` (numeric) · `other_pastoral_expenses` (numeric) · `salaries_wages_benefits` (numeric) · `govt_contributions` (numeric) · `utilities` (numeric) · `communications` (numeric) · `other_rectory_expenses` (numeric) · `construction_receipts` (numeric) · `construction_expenses` (numeric) · `remittance_to_diocese` (numeric) · `bishops_fund_share` (numeric) · `special_collections_remittance` (numeric) · `beginning_balance` (numeric) · `ending_balance_before_remit` (numeric) · `ending_balance_after_remit` (numeric) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_receipts` (numeric) · `pastoral_parish_fund_total_net_receipts` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `has_fiesta` (bool) · `total_rainfall_mm` (numeric) — PK (`institution_key`, `date_key`)

**`fact_school_monthly_financials`** 🆕
`institution_key` (int FK) · `date_key` (int FK) · `tuition_revenues` (numeric) · `miscellaneous_fees` (numeric) · `other_income` (numeric) · `subsidy_inflow` (numeric) · `faculty_payroll` (numeric) · `admin_staff_payroll` (numeric) · `utilities` (numeric) · `facilities_maintenance` (numeric) · `supplies` (numeric) · `other_expenses` (numeric) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_receipts` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `total_rainfall_mm` (numeric) — PK (`institution_key`, `date_key`)

**`fact_seminary_monthly_financials`** 🆕
`institution_key` (int FK) · `date_key` (int FK) · `donations` (numeric) · `seminary_fees` (numeric) · `mass_collections` (numeric) · `other_sources` (numeric) · `subsidy_inflow` (numeric) · `tuition_fees` (numeric) · `board_lodging_fees` (numeric) · `drm_modules` (numeric) · `sra_reading_lab` (numeric) · `retreat` (numeric) · `honorarium_fee` (numeric) · `miscellaneous_fees` (numeric) · `daily_food` (numeric) · `food_others` (numeric) · `gasoline_seminary` (numeric) · `gasoline_vocation` (numeric) · `permits_licenses` (numeric) · `office_supplies` (numeric) · `kitchen_equipment` (numeric) · `medical_supplies` (numeric) · `liturgical_supplies` (numeric) · `construction_materials` (numeric) · `other_supplies` (numeric) · `lpg` (numeric) · `repairs_maintenance` (numeric) · `equipment_furniture` (numeric) · `utilities` (numeric) · `labor` (numeric) · `professional_driver_fee` (numeric) · `salaries_wages` (numeric) · `contribution_benefits` (numeric) · `cash_incentives` (numeric) · `transportation_bank_charges` (numeric) · `other_expenses` (numeric) · `total_inflow` (numeric) · `total_outflow` (numeric) · `net_surplus` (numeric) · `dependency_ratio` (numeric) · `typhoon_days_count` (smallint) · `major_events_count` (smallint) · `total_rainfall_mm` (numeric) — PK (`institution_key`, `date_key`)

**`fact_priest_assignments`** 🆕
`priest_key` (int FK) · `institution_key` (int FK) · `start_date_key` (int FK) · `end_date_key` (int FK, nullable) · `status` (text) · `is_active` (bool) — PK (`priest_key`, `institution_key`, `start_date_key`)[cite: 2]

### Analytical / ML Engine Inference Layer
**`fact_financial_forecasts`** ✅ — `forecast_id` (uuid PK) · `institution_key` (int FK) · `date_key` (int FK) · `metric_type` (text: collections/disbursements) · `predicted_value` (numeric) · `lower_confidence` (numeric) · `upper_confidence` (numeric) · `model` (text champion reference identifier) · `generated_at` (timestamptz)[cite: 2]

**`fact_anomaly_alerts`** ✅ *(Diagnostic Result Data Repository mapping)* — `alert_id` (uuid PK) · `institution_key` (int FK) · `date_key` (int FK) · `anomaly_score` (numeric) · `is_anomaly` (bool) · `severity_level` (text) · `anomaly_type` (text) · `root_causes` (jsonb array structures [{factor, contribution}]) · `confidence_score` (numeric) · `analysis` (text descriptive log output) · `detected_at` (timestamptz)[cite: 2]

**`fact_health_snapshots`** ✅ *(Financial Health Score structured history snapshot)* — `snapshot_id` (uuid PK) · `institution_key` (int FK) · `date_key` (int FK) · `composite_score` (numeric) · `liquidity_score` (numeric) · `sustainability_score` (numeric) · `efficiency_score` (numeric) · `stability_score` (numeric) · `growth_score` (numeric) · `trend` (text: up/down/stable) · `percentage_change` (numeric) · `analysis` (text) · `recommendations` (jsonb predictive action logs)[cite: 2]

**`fact_subsidy_allocations`** ✅ *(Mixed-Integer Linear Programming runtime outputs repository)* — `allocation_id` (uuid PK) · `institution_key` (int FK) · `run_key` (uuid identifier) · `annual_deficit` (numeric) · `recommended_subsidy` (numeric) · `allocated_subsidy` (numeric) · `run_at` (timestamptz)[cite: 2]

### Views *(Unified logical schema objects without physical column footprints)*
`diocesan_consolidated_financials`  
*Yields a uniform pipeline interface structure:* `entity_type`, `institution_id`, `month`, `year`, `total_inflow`, `total_outflow`, `net_receipts`, `diocesan_share_inflow`[cite: 2].

---

## 6. `reference` Schema — Climate & Liturgical Time Context

### `reference.liturgical_calendar` 🆕 *(Standardized from the Ordo/Philippine Rite)*
`id` (uuid PK) · `date` (date unique) · `year` (smallint) · `liturgical_season` (text: Advent/Christmas/Lent/Easter/Ordinary Time) · `feast_name` (text) · `rank` (text: Solemnity/Feast/Memorial/Optional) · `liturgical_color` (text) · `is_holy_day_of_obligation` (bool) · `has_special_collection` (bool) · `special_collection_name` (text, nullable) · `expected_collection_impact` (text: low/medium/high) · `notes` (text)[cite: 2]

### `reference.weather_observations` 🆕 *(Sourced from OpenWeather/PAGASA daily logs)*
`id` (uuid PK) · `date` (date) · `institution_id` (uuid FK → `diocese.institutions.id`, nullable for regional province-wide overrides) · `location` (text) · `condition` (text: sunny/rainy/stormy/cloudy) · `temp_avg_c` (numeric) · `rainfall_mm` (numeric) · `typhoon_signal` (smallint references range 0–5) · `is_extreme_event` (bool) · `source` (text) · `recorded_at` (timestamptz)[cite: 2]

---

## 7. Legacy Compatibility Layer

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
| **`parishes`**[cite: 2] | 4[cite: 2] | Normalization parameters matching physical submission components precisely[cite: 2]. |
| **`schools`**[cite: 2] | 2[cite: 2] | Provisions unified with Star layout requirements to capture school fiscal loops safely[cite: 2]. |
| **`seminaries`**[cite: 2] | 2[cite: 2] | Integrates metrics for resource analytics[cite: 2]. |
| **`analytics`**[cite: 2] | 6 | Dimensions, facts, and inference fields updated to store daily reference summaries directly[cite: 2]. |
| **`reference`**[cite: 2] | 2[cite: 2] | Daily weather indices and liturgical event dimensions configured for the model analytics engine[cite: 2]. |