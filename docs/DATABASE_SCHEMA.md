# Diocese of San Pablo — Operational Database Schema Specification

This document details the operational database schema definitions, institutional boundaries, and administrative domains for the Diocese of San Pablo Financial Analytics System.

---

## 1. diocese Schema (Shared & Administrative Core)
These tables manage authentication, global roles and permission privileges, projects, communications, and compliance audits shared across the entire diocese.

*   **roles**: Stores system roles (Bishop, Parish Priest, School Principal, etc.) with custom UI identification colors and tags.
*   **permissions**: Stores the absolute list of system permission tags (e.g., `view_diocese`, `manage_projects`, `digital_twin`, `upload_csv_admin`).
*   **role_permissions**: A many-to-many join table mapping specific permissions to their respective assigned roles.
*   **profiles**: Extends authentication mapping. It links logged-in user credentials (from Supabase auth) to their active role in `diocese.roles` and maps them to the specific ID and type of institution they manage.
*   **projects**: Tracks capital improvement and outreach projects (e.g., church repairs, school computer labs) across all entities, storing target budgets, timelines, and active progress descriptions.
*   **donations**: Logs individual donor contributions, payment methods (Cash, Check, Online, Bank Transfer), and receipt issuance statuses tied to specific capital projects.
*   **project_expenses**: Itemizes individual expenditures and costs disbursed during capital projects, supporting receipt reference verification.
*   **events**: Stores shared calendar and contextual event records for parishes, schools, seminaries, and diocesan offices, linked by institution.
*   **announcements**: Provides a central bulletin board for administrative or financial advisories published by Chancery staff.
*   **audit_logs**: Tracks critical actions (such as logins, role modifications, or financial submissions) for security audits and tracking.

---

## 2. parishes Schema (Parish Domain)
These tables isolate data unique to parochial administration and local community logistics.

*   **details**: Stores parish profile metadata (assigned vicariate, pastoral district, current priest, coordinates, primary/secondary patron saints, and annual fiesta dates).
*   **financial_records**: Holds monthly financial reports logged by priests or parish secretaries (mass collections, consumable cash, sacrament arancels, and parish/pastoral expenditures).

---

## 3. schools Schema (Diocesan School Domain)
Schools run on completely different educational and administrative structures from parishes. These tables capture school-specific parameters.

*   **details**: Stores school profile parameters (principal name, district, class, educational level such as K-12, active student enrollment headcount, capacity, and active staff counts).
*   **financial_records**: Tracks monthly school operations, focusing on academic accounting metrics (tuition collections, miscellaneous fee income, academic faculty payroll, and campus operational overheads).

---

## 4. seminaries Schema (Priestly Formation Domain)
Seminaries run on boarding-house logistics and direct Curia subsidies. These tables capture seminary-specific parameters.

*   **details**: Stores seminary profile parameters (assigned rector, district, maximum capacity, current seminarian enrollment headcount, and active staff count).
*   **financial_records**: Captures monthly seminary accounting metrics (board and lodging collections, direct diocesan subsidies, sponsor donations, and kitchen/house operating expenses).

---

## 5. Visual Demonstration: How Raw Data Maps to Analytical Views

Below is a step-by-step visual mapping showing how operational data rows are standardized and consolidated for advanced dashboards.

### Step 1: The Raw Operational Tables (Different Columns)
Priests and school principals enter data into separate tables containing different, entity-specific column names.

#### Parish Operational Table (`parishes.financial_records`)
This table tracks collections, arancels, and pastoral disbursements.

parish_id | month | year | collections | sacraments_arancel | disbursements
---|---|---|---|---|---
`PAR-001` | `'Jan'` | 2026 | 150000 | 30000 | 120000

#### School Operational Table (`schools.financial_records`)
This table tracks tuition, miscellaneous fees, and school disbursements.

school_id | month | year | tuition_revenues | miscellaneous_fees | total_disbursements
---|---|---|---|---|---
`SCH-001` | `'Jan'` | 2026 | 400000 | 50000 | 300000

---

### Step 2: The Analytical Tables (Identical Columns)
The database staging layer maps the raw transactional tables above into two separate analytical tables. The column structures are now identical, and the unique operational fields have been consolidated into `total_inflow` and `total_outflow`.

#### Parish Analytics Table (`analytics.parish_monthly_financials`)
*Formulas used: total_inflow = collections + sacraments_arancel | total_outflow = disbursements*

entity_id | month | year | total_inflow | total_outflow | net_receipts
---|---|---|---|---|---
`PAR-001` | `'Jan'` | 2026 | **180000** *(150k + 30k)* | 120000 | 60000

#### School Analytics Table (`analytics.school_monthly_financials`)
*Formulas used: total_inflow = tuition_revenues + miscellaneous_fees | total_outflow = total_disbursements*

entity_id | month | year | total_inflow | total_outflow | net_receipts
---|---|---|---|---|---
`SCH-001` | `'Jan'` | 2026 | **450000** *(400k + 50k)* | 300000 | 150000

---

### Step 3: The Bishop's Consolidated View
For the Bishop's global dashboard, the database dynamically stacks (unions) the identical analytical tables together into a single virtual view.

#### Bishop's Consolidated View (`analytics.diocesan_consolidated_financials`)

entity_type | entity_id | month | year | total_inflow | total_outflow | net_receipts
---|---|---|---|---|---|---
`'parish'` | `PAR-001` | `'Jan'` | 2026 | 180000 | 120000 | 60000
`'school'` | `SCH-001` | `'Jan'` | 2026 | 450000 | 300000 | 150000

---

## 6. Visual Demonstration: How Star Schema (OLAP) Dimension & Fact Tables Map

Following standard Kimball Data Warehouse modeling, we separate the descriptive contexts (**Dimension Tables**) from the numerical measures (**Fact Tables**), replacing string keys with clean integer surrogate keys for maximum analytical performance.

### Step 4: The Dimension Tables (Dim Tables)
Dimension tables store descriptive attributes, hierarchies, and contexts (the Who, Where, When, and What) to slice, group, and filter calculations.

#### Table A: Unified Entity Context (`analytics.dim_institutions`)
Consolidates parishes, schools, and seminaries details into a single dimension table.

institution_key | institution_id | institution_name | entity_type | vicariate | district | class | head_pastor_or_principal
---|---|---|---|---|---|---|---
**1** | `'PAR-001'` | `'St. Paul Parish'` | `'Parish'` | `'San Pablo'` | `'Pastoral District 1'` | `'Class B'` | `'Fr. Juan Dela Cruz'`
**2** | `'SCH-001'` | `'Liceo de San Pablo'` | `'School'` | `'San Pablo'` | `'Pastoral District 1'` | `'Class A'` | `'Dr. Maria Santos'`

#### Table B: Calendar Context (`analytics.dim_date`)
Standardizes periods, dates, and quarterly hierarchies across the entire database.

date_key | month_name | month_number | year | quarter
---|---|---|---|---
**202601** | `'January'` | 1 | 2026 | `'Q1'`
**202602** | `'February'` | 2 | 2026 | `'Q1'`

#### Table C: Expense Categories Context (`analytics.dim_expense_categories`)
Defines the categories used to slice financial outflows.

category_key | category_name | category_description
---|---|---
**101** | `'Pastoral & Social Programs'` | `'Outreach, community services, and parish programs'`
**102** | `'Administrative & Utilities'` | `'Rectory utility bills, staff salaries, and office overheads'`
**103** | `'Academic & Faculty Payroll'` | `'School teachers and administrative faculty salaries'`
**104** | `'School Facilities & Overheads'` | `'School utility bills, classroom maintenance, and sports labs'`
**105** | `'House & Domestic Operations'` | `'Seminary house kitchen, board, laundry, and dormitory utility costs'`

---

### Step 5: The Core Fact Tables (Fact Tables)
Fact tables store quantitative, measurable numerical facts (the How Much). They consist only of foreign keys pointing to Dimension tables, surrounded by metrics.

#### Table A: Historical Monthly Metrics (`analytics.fact_monthly_financials`)
Tracks consolidated total monthly collections and disbursements.

institution_key (FK) | date_key (FK) | total_inflow | total_outflow | net_receipts
---|---|---|---|---
**1** *(St. Paul Parish)* | **202601** *(Jan 2026)* | 180000 | 120000 | 60000
**2** *(Liceo de San Pablo)* | **202601** *(Jan 2026)* | 450000 | 300000 | 150000

#### Table B: Granular Monthly Expense Breakdowns (`analytics.fact_monthly_expenses`)
Links individual spending categories to `dim_expense_categories` for advanced cost slicing.

institution_key (FK) | date_key (FK) | category_key (FK) | amount
---|---|---|---
**1** *(St. Paul Parish)* | **202601** | **101** *(Pastoral Programs)* | 40000
**1** *(St. Paul Parish)* | **202601** | **102** *(Parish Admin)* | 80000
**2** *(Liceo de San Pablo)* | **202601** | **103** *(Faculty Payroll)* | 200000
**2** *(Liceo de San Pablo)* | **202601** | **104** *(Campus Overheads)* | 100000

---

### Step 6: Analytical Snapshot Fact Tables
These fact tables store advanced machine learning, performance diagnostic, and optimization output metrics.

#### Table A: Predictive Financial Forecasts (`analytics.fact_financial_forecasts`)
Stores Prophet/SARIMA time-series projections.

institution_key (FK) | date_key (FK) | metric_type | predicted_value | lower_confidence | upper_confidence
---|---|---|---|---|---
**1** | **202602** *(Feb 2026)* | `'collections'` | 192000 | 185000 | 201000

#### Table B: Anomaly Detection Logs (`analytics.fact_anomaly_alerts`)
Stores Isolation Forest anomaly scores.

institution_key (FK) | date_key (FK) | anomaly_score | is_anomaly | severity_level
---|---|---|---|---
**1** | **202601** *(Jan 2026)* | 0.82 | `true` | 3 *(Critical)*

#### Table C: Multi-Dimensional Performance Indexes (`analytics.fact_health_snapshots`)
Stores aggregated entity financial health indicators.

institution_key (FK) | date_key (FK) | composite_score | liquidity_score | sustainability_score
---|---|---|---|---
**1** | **202601** *(Jan 2026)* | 85.5 | 90.0 | 82.0

#### Table D: LP Optimization Solver Results (`analytics.fact_subsidy_allocations`)
Stores recommended Curia subsidy allocations.

institution_key (FK) | run_key (FK) | annual_deficit | recommended_subsidy | allocated_subsidy
---|---|---|---|---
**1** | **550** *(Run #550)* | 720000 | 600000 | 600000

---

## Supabase Storage Buckets

File storage buckets managed by Supabase Storage. All buckets are **public** (files accessible via direct URL). RLS policies restrict who can upload.

### Bucket: `health-documents`
Stores priest health record attachments.

| Setting | Value |
|---|---|
| Public | Yes |
| File size limit | 50 MB (unset default) |
| Allowed MIME types | Any |
| Migration | (created manually in dashboard) |

### Bucket: `financial-submissions`
Stores uploaded financial submission files (Excel, CSV, PDF) from the data submission workflow.

| Setting | Value |
|---|---|
| Public | No (authenticated only) |
| File size limit | 15 MB |
| Allowed MIME types | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `text/csv`, `application/pdf` |
| Migration | (created manually in dashboard) |

### Bucket: `disbursement-proofs`
Stores proof-of-disbursement files (images, PDFs) attached to project expenses. The public URL is saved in `diocese.project_expenses.proof_file_name`. Uploaded from `ExpenseEntryModal`.

| Setting | Value |
|---|---|
| Public | Yes |
| File size limit | 10 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf` |
| Migration | `183_disbursement_proof_storage.sql` |

### Bucket: `donation-receipts`
Stores proof-of-receipt files (images, PDFs) attached to project donations. The public URL is saved in `diocese.donations.receipt_proof_name`. Uploaded from `DonationEntryModal`.

| Setting | Value |
|---|---|
| Public | Yes |
| File size limit | 10 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf` |
| Migration | `184_donation_receipt_storage.sql` |
