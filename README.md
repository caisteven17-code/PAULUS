# Diocese of San Pablo — Financial Analytics System

A capstone financial analytics platform for the Diocese of San Pablo, Philippines. Tracks the financial health of all parishes, diocesan schools, and seminaries under the Diocese through role-based dashboards, monthly IAFR/FS data submission, project and donation management, a geospatial heat map, a Digital Twin simulation mode, a Gemini-powered AI chatbot, and an automated multi-source weather data pipeline covering all 30 Laguna municipalities.

---

## What the System Does

The Diocese of San Pablo oversees dozens of parishes, diocesan schools, and seminaries spread across Laguna Province. Each institution head submits a monthly IAFR (Income and Financial Report) or FS (Financial Statement), and the Chancery needs a consolidated view of every entity's financial position in real time.

This system replaces manual spreadsheet consolidation with an end-to-end analytics platform:

### 1. Data Collection

Each institution head logs in and submits their monthly financial report through a guided form. Reports are entity-specific:

**Parishes** (`parishes.financial_records`) — columns captured per month:
- `collections`, `consumable_collections`, `disbursements`
- `sacraments_rate`, `sacraments_arancel`, `sacraments_parish_share`, `sacraments_over_above`
- `collections_mass`, `collections_other`, `collections_other_receipts`
- `expenses_pastoral`, `expenses_parish`
- `others_mass_intentions_not_claimed`, `others_mass_intentions_claimed`, `others_special_collections`
- `pastoral_parish_fund_total_net_receipts`

**Diocesan Schools** (`schools.financial_records`) — columns captured per month:
- `tuition_revenues`, `miscellaneous_fees`
- `operational_overheads`, `academic_payroll`, `total_disbursements`

**Seminaries** (`seminaries.financial_records`) — columns captured per month:
- `board_and_lodging`, `diocesan_allocations`, `miscellaneous_income`
- `house_disbursements`, `total_disbursements`

Submission status is tracked as **pending → submitted → late → rejected**. The system enforces deadlines (parishes by the 15th of the following month; schools and seminaries by the 1st week) and flags overdue submissions for Chancery follow-up.

### 2. Financial Health Scoring

Submitted data flows through the analytics pipeline, which normalizes entity-specific columns into three common metrics — `total_income`, `total_expenses`, and `balance` — and produces a composite health score:

```
surplusRatio     = (income − expenses) / income
surplusScore     = clamp(surplusRatio + 0.5, 0, 1)          # 40% weight
coverageScore    = min(1, balance / (expenses × 3))          # 30% weight
consistencyScore = max(0, 1 − √variance / avg)  [income history]  # 30% weight

raw       = 0.4 × surplusScore + 0.3 × coverageScore + 0.3 × consistencyScore
healthScore = clamp(round(raw × 100), 10, 99)
risk tier:  ≥ 75 → Low Risk  |  ≥ 55 → Moderate Risk  |  < 55 → High Risk
```

Entities with no recorded income/expenses default to `healthScore = 50, risk = Moderate`.

### 3. Four-Tier Analytics

| Tier | What it answers | Example |
|---|---|---|
| **Descriptive** | What happened? | Monthly collection totals, expense breakdowns by category |
| **Diagnostic** | Why did it happen? | Surplus drop correlated with typhoon days or low mass attendance |
| **Predictive** | What will happen? | 3-month income forecast per entity; project success probability |
| **Prescriptive** | What should we do? | Recommended budget adjustments, subsidy reallocation proposals |

### 4. Role-Based Access

The system resolves two layers of roles. A **fine-grained AccessRole** (what the person's title is) maps to a coarser **AppRole** (which dashboard they see), which in turn grants a specific set of **permissions**:

| AccessRole | Display Name | AppRole | Dashboard |
|---|---|---|---|
| `bishop` | Bishop | `bishop` | Full diocese — all entities, all analytics, Digital Twin |
| `chancellor` | Chancellor | `bishop` | Full diocese — read-only; announcements and events management |
| `diocesan_oeconomus` | Diocesan Oeconomus | `admin` | Financial management, entity config, user/role administration |
| `finance_staff` | Finance Staff | `admin` | Data management, CSV upload/download, financial records |
| `school_superintendent` | School Superintendent | `admin` | Schools oversight, entity management |
| `liturgical_validator` | Liturgical Validator | `admin` | Liturgical calendar validation |
| `parish_priest` | Parish Priest | `parish_priest` | Own parish — dashboard, submission form, projects |
| `parish_secretary` | Parish Secretary | `parish_secretary` | Own parish — submission form and data only |
| `seminary_rector` | Seminary Rector | `seminary` | Own seminary — dashboard, submission form, projects |
| `seminary_oeconomus` | Seminary Oeconomus | `seminary` | Own seminary — submission form and financial data |
| `finance_supervisor` | School Finance Supervisor | `school` | Own school — dashboard and financial data |
| `finance_officer` | School Finance Officer | `school` | Own school — submission form and financial data |
| `school_principal` | School Principal | `school` | Own school — dashboard, submission form, projects |

Custom roles can be created by administrators with any combination of the permissions below.

### 5. Permission System

| Permission ID | Category | What it grants |
|---|---|---|
| `view_diocese` | Access Level | Full diocese-wide access across all parishes, schools, and seminaries |
| `view_parish` | Access Level | Restricted to a single assigned parish |
| `view_seminary` | Access Level | Restricted to a single assigned seminary |
| `view_school` | Access Level | Restricted to an assigned school or cluster |
| `digital_twin` | Digital Twin | Launch diocese-level scenario simulations and mirror institution dashboards |
| `view_priests` | Priest Management | View priest health trackers, assignments, and personnel dashboards |
| `manage_assignments` | Priest Management | Launch scenario planning to simulate clergy assignments |
| `download_csv` | Data Management | Download blank CSV templates for data entry |
| `upload_csv_admin` | Data Management | Upload and process master CSV templates for the diocese |
| `upload_csv_entity` | Data Management | Upload updated CSVs for a specific institution |
| `validate_liturgical_calendar` | Data Management | Approve, revise, or reject imported liturgical calendar events |
| `manage_entities` | Entity Management | Add, configure, and update diocesan institutions |
| `manage_projects` | Projects | Create, edit, and manage capital projects and donation drives |
| `view_projects` | Projects | View project details without administrative access |
| `create_users` | User Management | Add, update, or remove staff accounts |
| `manage_roles` | User Management | Assign or change what each staff member can see and do |
| `view_audit_logs` | User Management | View the tamper-evident log of all staff actions |
| `manage_announcements` | Announcements | Create, edit, and publish diocese-wide announcements |
| `view_announcements` | Announcements | Read published announcements |
| `manage_events` | Events | Create, edit, and delete events |
| `view_events` | Events | View scheduled events |
| `manage_budget` | Budget | Set and update monthly institutional budgets |
| `view_budget` | Budget | View submitted budgets without editing |

### 6. Screens and Views

All navigation is state-based in `App.tsx` (no Next.js page routing). Available views:

| View file | What it shows |
|---|---|
| `Home.tsx` | Landing dashboard — at-a-glance health cards, recent activity |
| `BishopDashboard.tsx` | Diocese-wide consolidated financials and health scores |
| `PriestDashboard.tsx` | Priest personnel tracker and assignment viewer |
| `ParishDataSubmission.tsx` | Monthly IAFR submission form with deadline countdown |
| `ConsolidatedFinancial.tsx` | Cross-entity financial consolidation and comparison table |
| `HealthTracker.tsx` | Per-entity health score timeline and risk classification |
| `Projects.tsx` | Capital project lifecycle — funding status, donations, expenses |
| `Budget.tsx` | Monthly budget entry and variance tracking |
| `AuditLog.tsx` | Tamper-evident log of all financial mutations and security events |
| `Announcements.tsx` | Diocese-wide announcements board |
| `Events.tsx` | Event calendar for liturgical and diocesan events |
| `WhatIfSimulator.tsx` | Institution-level what-if scenario planner |
| `DigitalTwin.tsx` | Diocese-level Digital Twin sandbox (Bishop / Admin only) |
| `Settings.tsx` | User profile, role management, entity configuration |
| `Login.tsx` | Supabase Auth login with localStorage fallback for offline demos |

### 7. Weather Context

A separate Python batch pipeline fetches 3+ years of daily weather data for all 30 Laguna Province municipalities. Data is classified using PAGASA thresholds and stored in the `reference` schema alongside the financial data, enabling the analytics layer to correlate financial dips with weather events.

**PAGASA rainfall thresholds (24-hour accumulation):**
- Light rain: < 60 mm
- Moderate rain: 60 – 180 mm
- Heavy rain: > 180 mm

**PAGASA heat index thresholds (Rothfusz 1990 formula applied to T2M_MAX):**
- Not hazardous: < 27 °C
- Caution: 27 – 33 °C
- Extreme caution: 33 – 42 °C
- Danger: 42 – 52 °C
- Extreme danger: ≥ 52 °C

### 8. Supporting Tools

- **Geospatial heat map** — Google Maps bubble map where each entity's bubble size and color reflect its health score
- **Digital Twin** — A sandboxed simulation mode (Bishop/Admin only) for diocese-level what-if planning without touching production data
- **Steward Chatbot** — A Gemini-powered AI assistant that answers financial questions using aggregated (never raw) analytics outputs. Raw institution-level figures never leave the server.
- **Projects & Donations** — Capital project lifecycle management with donation tracking and expense logging. Health score and success probability (`success_probability` column) are computed per project.
- **Subsidy optimization** — `analytics.subsidy_optimization_runs` and `analytics.subsidy_optimization_results` tables store prescriptive reallocation recommendations

---

## Features

| Feature | Description |
|---|---|
| Role-based dashboards | 13 distinct access roles across bishop, admin, parish, school, and seminary tiers |
| Financial data submission | Monthly IAFR/FS submissions with entity-specific columns, deadline enforcement, and resubmission support |
| Financial health scoring | Composite score (surplus 40% + coverage 30% + consistency 30%), clamped 10–99, with Low/Moderate/High risk tier |
| Projects & donations | Capital project tracking with `success_probability` score, donation inflows, and expense logging |
| Geospatial heat map | Google Maps bubble map showing per-entity health scores across all diocesan locations |
| Digital Twin | Bishop/Admin-only sandbox for diocese-level scenario planning without writing to production data |
| AI Chatbot (Steward) | Gemini-powered chatbot answering questions from aggregated analytics — raw financial records never sent to the LLM |
| Weather pipeline | 37,680 daily records for 30 Laguna municipalities (Jan 2023 – Jun 2026) from 9 independent sources with Fleiss' Kappa + WCI confidence scoring |
| Audit trail | Tamper-evident `diocese.audit_logs` table recording all financial mutations, submissions, and security events |
| CSV import/export | Admin-level master CSV upload, entity-level update CSV, and template download |
| Liturgical calendar | Import and validate liturgical events before they feed into the seasonality analytics layer |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| Backend | NestJS 11 microservices, TypeScript |
| Database | Supabase (PostgreSQL), Row Level Security |
| Auth | Supabase Auth (custom shim `firebase.ts` with `localStorage` fallback for offline demos) |
| AI — Chatbot | Google Gemini API |
| AI — Dev tooling | Anthropic Claude (Claude Code) |
| Maps | Google Maps Platform |
| Analytics | Python 3.11 / FastAPI (`src/analytics/`) |
| Weather sources | NASA POWER AG, Open-Meteo ERA5-Land, CHIRPS v2.0, GPM IMERG Final Run V07, GSMaP NRT, NOAA GSOD, ERA5 Full, ECMWF IFS, UKMO |
| Email | Nodemailer (SMTP) for OTP and transactional email |
| Containerization | Docker Compose |

---

## Repository Structure

```
CAPSTONE/
├── src/
│   ├── frontend/                   # Next.js 16 + React 19 SPA
│   │   ├── app/
│   │   │   ├── api/                # Thin Next.js route handlers (proxy to NestJS)
│   │   │   └── page.tsx            # SSR shell — dynamically imports App.tsx (no SSR)
│   │   └── src/
│   │       ├── App.tsx             # Root SPA — activeTab + role switch, permission gates
│   │       ├── views/              # 15 top-level page components (see list above)
│   │       ├── components/         # Shared UI components (cards, charts, tables, forms)
│   │       ├── hooks/
│   │       │   └── usePermissions.ts  # 4-level fallback: API → localStorage → INITIAL_ROLES → defaults
│   │       ├── lib/
│   │       │   ├── api-client.ts   # Single frontend data entry point (wraps fetch + polling)
│   │       │   ├── backend-proxy.ts # proxyToBackend → NestJS gateway
│   │       │   └── access.ts       # AccessRole → AppRole mapping + normalizeAccessRole()
│   │       ├── firebase.ts         # Supabase Auth shim (mimic Firebase API + localStorage fallback)
│   │       ├── types.ts            # Shared TypeScript types (Parish, School, Seminary, etc.)
│   │       └── constants.ts        # INITIAL_ROLES, ALL_PERMISSIONS, SUBMISSION_CONFIG, COLORS
│   │
│   ├── backend/                    # NestJS 11 microservices
│   │   └── src/
│   │       ├── apps/
│   │       │   ├── api-gateway/    # Port 4000 — routes all /api/* to downstream services
│   │       │   ├── auth/           # Port 4101 — login, logout, OTP email, session lifecycle
│   │       │   ├── entity/         # Port 4102 — parishes, schools, seminaries CRUD + health scores
│   │       │   ├── financial/      # Port 4103 — monthly financial record submission and retrieval
│   │       │   ├── project/        # Port 4104 — projects, donations, project expenses
│   │       │   └── analytics/      # Port 4105 — health scores, insights, chatbot data aggregation
│   │       ├── services/           # Shared business logic providers (imported by all apps)
│   │       │   ├── supabase.service.ts    # .client (anon) + .admin (service-role, bypasses RLS)
│   │       │   ├── entity.service.ts      # computeHealthScore() — the 40/30/30 formula
│   │       │   └── analytics.service.ts   # INSTITUTION_DATA mock map (not yet DB-driven)
│   │       └── shared/
│   │           ├── http/service-urls.ts   # Port constants; override via *_SERVICE_PORT env vars
│   │           └── http/request-downstream.ts  # Gateway → microservice forwarding helper
│   │
│   └── analytics/                  # Python analytics + weather pipeline
│       └── app/services/
│           ├── weather_collector.py        # Fetches 30 municipalities × 9 sources; ThreadPoolExecutor
│           ├── weather_daily_classifier.py # PAGASA classification + Fleiss' Kappa + WCI scoring
│           ├── weather_loader.py           # Upserts classified rows to reference.weather_*_daily
│           └── weather_validator.py        # Monthly validation against NOAA GSOD / CHIRPS
│
├── supabase/
│   ├── schema.sql                          # Legacy flat schema (kept for reference)
│   ├── complete-domain-partitioned-schema.sql  # Current 5-schema partitioned schema
│   ├── portable_migrations/                # Numbered migration files (001 → 191+)
│   │   └── 191_weather_six_validators.sql  # Latest: adds 18 new validator columns + POSIX regex CHECK
│   └── seeds/                              # Reference data seeds
│
├── docs/                                   # DATABASE_SCHEMA.md, ER diagram markdown files
├── weather_output/                         # Local pipeline output JSON files (git-ignored)
├── .env.example                            # All environment variable names with safe placeholders
├── docker-compose.yml
└── package.json                            # npm workspaces root (src/frontend + src/backend)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+ (weather analytics pipeline only)
- A [Supabase](https://supabase.com) project with the schema applied

### 1. Clone and install

```bash
git clone <repo-url>
cd CAPSTONE
npm install       # installs all workspaces (frontend + backend) via npm workspaces
```

### 2. Configure environment

```bash
cp .env.example .env
```

All workspaces and scripts read from the single root `.env` (every script runs through `dotenv -e ../../.env`). See [Environment Variables](#environment-variables) for the full list.

### 3. Apply database migrations

Apply `supabase/complete-domain-partitioned-schema.sql` for a clean setup, then run any numbered migrations in `supabase/portable_migrations/` in ascending order. Use the Supabase dashboard SQL editor or:

```bash
supabase db push
```

### 4. Run locally

```bash
npm run dev          # frontend on :3000 + all 6 NestJS services concurrently
```

Or individually:

```bash
npm run dev:frontend   # Next.js dev server on :3000
npm run dev:backend    # builds backend (tsc), then starts all 6 NestJS apps
```

### 5. Production build

```bash
npm run build        # next build + tsc → src/backend/dist/
npm run start        # serve built frontend + run compiled backend
```

### Docker

```bash
npm run docker:up    # docker compose up --build
```

---

## Architecture

### Request flow

Every browser data call passes through two proxy hops:

```
Browser
  → apiClient  (src/frontend/src/lib/api-client.ts)
       ↓  wraps fetch; fakes realtime with 30s polling via createPoller()
  → Next.js route handler  (app/api/**/route.ts)
       ↓  calls proxyToBackend with path; all handlers have export const dynamic = 'force-dynamic'
  → NestJS API Gateway  :4000  (/api prefix)
       ↓  gateway controller calls requestDownstream(); re-applies Set-Cookie via applyDownstreamCookies()
  → domain microservice  :4101–:4105  (no /api prefix)
       ↓
  → Supabase (PostgreSQL) via SupabaseService
```

`apiClient` is the only place frontend code fetches data — views never call `fetch` to the backend directly. All views must go through `apiClient` to preserve the mock-data fallback chain.

### Backend microservices

| Service | Port | Env var override | Responsibility |
|---|---|---|---|
| API Gateway | 4000 | `API_GATEWAY_PORT` | Routes all `/api/*` requests; never holds business logic |
| Auth | 4101 | `AUTH_SERVICE_PORT` | Login, logout, OTP email, session management |
| Entity | 4102 | `ENTITY_SERVICE_PORT` | Parish/school/seminary CRUD, health score computation |
| Financial | 4103 | `FINANCIAL_SERVICE_PORT` | Monthly financial record submission and retrieval |
| Project | 4104 | `PROJECT_SERVICE_PORT` | Projects, donations, project expenses |
| Analytics | 4105 | `ANALYTICS_SERVICE_PORT` | Health scores, insights, chatbot data aggregation |

Backend must be compiled before running: `npm run build:backend` → `src/backend/dist/apps/<svc>/main.js`.

### Auth & role resolution

`src/frontend/src/firebase.ts` is a **Supabase Auth shim** — not Firebase. It tries a live Supabase session, then falls back to a `localStorage` (`currentUser`) demo session so the prototype works offline.

Role resolution flow:

```
User's role string
  → normalizeAccessRole()  (trims, lowercases, resolves legacy aliases)
  → ACCESS_ROLE_TO_APP_ROLE  (e.g. 'seminary_rector' → 'seminary')
  → usePermissions()  [4-level fallback]
       1. GET /api/admin/roles  (live Supabase)
       2. localStorage('diocese_roles')
       3. INITIAL_ROLES constant in constants.ts
       4. Hardcoded default permission map
  → permissions.* booleans  (view_diocese, digital_twin, manage_projects, …)
  → App.tsx permission gates every view on these booleans
```

---

## Database Schema

PostgreSQL organized into five domain-partitioned schemas with Row Level Security:

| Schema | Tables (key ones) | Purpose |
|---|---|---|
| `diocese` | `roles`, `permissions`, `role_permissions`, `profiles`, `projects`, `donations`, `project_expenses`, `announcements`, `audit_logs` | Cross-cutting diocesan data |
| `parishes` | `details`, `financial_records` | Parish entity profiles and monthly IAFR records |
| `schools` | `details`, `financial_records` | Diocesan school profiles and monthly FS records |
| `seminaries` | `details`, `financial_records` | Seminary profiles and monthly FS records |
| `reference` | `weather_rainfall_daily`, `weather_temperature_daily`, `weather_monthly_summary`, `weather_run_metadata` | Weather pipeline output |

### Entity ID formats

IDs are generated with `format_seq_id(prefix, sequence, digits)`:

| Entity | Prefix | Example |
|---|---|---|
| Parish financial record | `FIN-` | `FIN-000042` |
| School financial record | `FSCH-` | `FSCH-000001` |
| Seminary financial record | `FSEM-` | `FSEM-000007` |
| Project | `PRJ-` | `PRJ-003` |
| Donation | `DON-` | `DON-00012` |

### Financial record columns by entity type

**`parishes.financial_records`** — IAFR (Income and Financial Report):
- Sacraments: `sacraments_rate`, `sacraments_arancel`, `sacraments_parish_share`, `sacraments_over_above`
- Collections: `collections`, `consumable_collections`, `collections_mass`, `collections_other`, `collections_other_receipts`
- Expenses: `disbursements`, `expenses_pastoral`, `expenses_parish`
- Sundry: `others_mass_intentions_not_claimed`, `others_mass_intentions_claimed`, `others_special_collections`, `pastoral_parish_fund_total_net_receipts`

**`schools.financial_records`** — FS (Financial Statement):
- Income: `tuition_revenues`, `miscellaneous_fees`
- Expenses: `operational_overheads`, `academic_payroll`, `total_disbursements`

**`seminaries.financial_records`** — FS (Financial Statement):
- Income: `board_and_lodging`, `diocesan_allocations`, `miscellaneous_income`
- Expenses: `house_disbursements`, `total_disbursements`

All three tables index on `(entity_id, year, month)` for efficient per-period queries.

See `docs/DATABASE_SCHEMA.md` and the `*SchemaDiagram*.md` files at the repo root for full ER diagrams.

---

## Weather Data Pipeline

A standalone Python batch job. Covers all **30 Laguna Province municipalities** for a **3.5-year historical window (2023-01-01 → 2026-06-15)** — 1,256 days × 30 municipalities = **37,680 rows** per weather dimension.

### Covered municipalities

San Pablo City, Calamba City, Santa Rosa City, Biñan City, Cabuyao City, San Pedro City, Los Baños, Santa Cruz, Pagsanjan, Nagcarlan, Liliw, Majayjay, Magdalena, Pila, Bay, Calauan, Luisiana, Cavinti, Lumban, Paete, Pakil, Pangil, Siniloan, Famy, Mabitac, Santa Maria, Rizal, Victoria, Alaminos, Kalayaan.

### Sources by dimension

| Dimension | Source of Truth | Column | Validators |
|---|---|---|---|
| Rainfall | NASA POWER AG | `PRECTOTCORR` | CHIRPS v2.0, Open-Meteo ERA5-Land, GPM IMERG Final V07, GSMaP NRT, ERA5 Full, UKMO |
| Temperature | NASA POWER AG | `T2M_MAX` (daily max) | NOAA GSOD, Open-Meteo ERA5-Land, ERA5 Full, ECMWF IFS, UKMO |

NASA POWER AG was selected as the source of truth in a dual-source-of-truth validation test across all four continuous weather dimensions.

**Note on ERA5 family**: ERA5 Full and ECMWF IFS share infrastructure with ERA5-Land; they are included as reference validators only, not independent validators.

**Note on IMERG coverage**: GPM IMERG Final Run V07 has a ~6-month processing lag. Days beyond October 2025 have no IMERG data and fall back to `null`.

### PAGASA classification thresholds

**Rainfall (24-hour accumulation):**

| Class | Threshold |
|---|---|
| `light_rain` | < 60 mm |
| `moderate_rain` | 60 – 180 mm |
| `heavy_rain` | > 180 mm |

**Temperature (Rothfusz 1990 heat index from T2M_MAX):**

| Class | Heat index range |
|---|---|
| `not_hazardous` | < 27 °C |
| `caution` | 27 – 33 °C |
| `extreme_caution` | 33 – 42 °C |
| `danger` | 42 – 52 °C |
| `extreme_danger` | ≥ 52 °C |

### Confidence scoring

Two metrics are computed and stored in `weather_output/laguna_weather_confidence.json` after each full pipeline run:

**Fleiss' Kappa** (Fleiss 1971; Landis & Koch 1977 strength labels) — multi-rater categorical agreement after binning raw values into PAGASA classes. Computed separately for rainfall (6 raters) and temperature (5 raters), then averaged overall.

| Strength label | κ range |
|---|---|
| Slight | < 0.20 |
| Fair | 0.21 – 0.40 |
| Moderate | 0.41 – 0.60 |
| Substantial | 0.61 – 0.80 |
| Almost Perfect | > 0.80 |

**Weighted Confidence Index (WCI)** — mean per-day majority-vote weight across all validators:
```
weight_map = {6: 1.00, 5: 0.83, 4: 0.67, 3: 0.50, 2: 0.33, 1: 0.17, 0: 0.00}
WCI = mean(weights for all rows) × 100 %
```

**Current confidence scores** (Jan 2023 – Jun 2026, 30 municipalities, 37,680 rows per dimension):

| Dimension | Fleiss κ | Strength | WCI |
|---|---|---|---|
| Rainfall | 0.3041 | Fair | 87.30% |
| Temperature | 0.4434 | Moderate | 69.06% |
| **Overall** | **0.3738** | **Fair** | **78.18%** |

Temperature classifies into more intermediate PAGASA bins (Laguna rarely reaches the extreme tiers), explaining the higher kappa. Rainfall agreement is lower due to high spatial heterogeneity in tropical convective rainfall even across neighboring grid cells.

### Running the pipeline

```bash
cd src/analytics
python -m app.services.weather_collector --load
```

Requires `EARTHDATA_BEARER_TOKEN` in `.env` for GPM IMERG (free [NASA Earthdata](https://urs.earthdata.nasa.gov) account). All other sources are unauthenticated.

**After the run** — if `rebuild_weather_monthly_summary` times out (PostgREST enforces an 8-second statement timeout on large aggregations), run it directly in the Supabase SQL editor or via MCP:

```sql
SELECT reference.rebuild_weather_monthly_summary(NULL, NULL);
```

Output files are written to `weather_output/` (git-ignored): `laguna_weather_classified.json`, `laguna_weather_confidence.json`, and per-municipality validity reports.

### Parallelization

- **GPM IMERG**: `ThreadPoolExecutor(max_workers=8)` across all 1,256 day-files — reduces per-municipality IMERG fetch from ~40 min to ~9 min.
- **GSMaP NRT (JAXA FTP)**: `ThreadPoolExecutor(max_workers=3)` — JAXA's FTP server rate-limits at 6+ concurrent connections (WinError 10060/10054); 3 workers is stable.
- **Per-municipality**: Open-Meteo base + NASA AG + NASA SB run in parallel (3 workers); CHIRPS runs in a background thread while ERA5/ECMWF IFS/UKMO run sequentially with 2-second gaps.

---

## Environment Variables

Copy `.env.example` to `.env` at the repo root. Key variables:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key — safe for browser; respects RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server-side only; bypasses RLS |
| `SUPABASE_JWT_SECRET` | Yes | JWT secret for token verification in the auth service |
| `NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY` | Yes | Google Maps API key (geospatial heat map) |
| `GEMINI_API_KEY` | Optional | Gemini API key for the Steward chatbot (chatbot disabled if absent) |
| `EARTHDATA_BEARER_TOKEN` | Optional | NASA Earthdata bearer token for GPM IMERG rainfall validator |
| `SMTP_HOST` | Optional | SMTP server hostname (OTP codes print to console if unset) |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `SMTP_PORT` | Optional | SMTP port (default 587) |
| `SMTP_FROM` | Optional | From address for transactional email |
| `BACKEND_PROXY_BASE_URL` | Optional | NestJS gateway URL (default `http://127.0.0.1:4000/api`) |
| `ANALYTICS_PYTHON_URL` | Optional | Python analytics service URL (default `http://127.0.0.1:8000`) |

---

## Diagnostic Scripts

Standalone Node.js scripts at the repo root — parse root `.env` themselves, run with `node`:

| Script | Purpose |
|---|---|
| `node test-db.js` | Verify Supabase connection and basic table access |
| `node check-*.js` | Data integrity checks (entity counts, submission gaps, etc.) |
| `node sync-*.js` | Data synchronization utilities |
| `node geocode-*.cjs` | Geocode municipality and entity coordinates for the heat map |

---

## Prototype Notes

This is a capstone prototype. Several features degrade gracefully when credentials are absent:

- **No Supabase** — auth falls back to a `localStorage` demo session; data falls back to mock constants in `analytics.service.ts` (`INSTITUTION_DATA` map, hardcoded by entity name)
- **No Gemini key** — Steward chatbot is disabled
- **No SMTP credentials** — OTP codes are printed to the auth-service terminal console instead of emailed
- **No Earthdata token** — GPM IMERG rainfall validator is skipped; confidence scores decrease slightly
- **No Google Maps key** — geospatial heat map is disabled

TypeScript build errors do not fail the Next.js build (`typescript.ignoreBuildErrors: true` in `next.config.ts`). Run `npm run lint --workspace=src/frontend` to check types deliberately.

The analytics health score (`analytics.service.ts`) currently uses a hardcoded `INSTITUTION_DATA` map keyed by entity name — it is mock data, not yet computed live from `financial_records`. The formula itself (`entity.service.ts: computeHealthScore()`) is fully implemented and correct; it is used for any entity not in the mock map.

---

## License

Academic capstone project — Diocese of San Pablo, Philippines.
