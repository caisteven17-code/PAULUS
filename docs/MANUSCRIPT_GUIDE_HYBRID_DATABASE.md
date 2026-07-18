# Manuscript Guide — System Development Timeline & Hybrid Database Architecture

This file tracks the reasoning, terminology, and evidence behind the system's key technical
decisions — starting with the analytics/pipeline layer built earlier and continuing through the
Supabase/AWS hybrid database split — so the capstone manuscript can be written and revised
accurately. It is a living log — update the **Change Log** section at the bottom each time a
phase completes, rather than rewriting from memory later.

Companion reference: `docs/DATABASE_SCHEMA.md`, `docs/DATABASE_*_ANALYTICS_DIAGRAM.md` (existing
schema docs — update these once AWS tables are live, since some are already stale against the
current domain-partitioned schema).

---

## 0. Development timeline (for the System Development / Methodology chapter)

Reconstructed from git history — use these as the dated milestones for your development
narrative. Each row is a real commit, not a plan; cite the date if your manuscript format
expects one.

| Date | Milestone | What it means for the paper |
|---|---|---|
| 2026-06-05 | Python analytics layer + CI/CD pipeline added | The FastAPI analytics microservice (descriptive/diagnostic/predictive/prescriptive tiers) and automated lint/format/test gating were established as the system's analytics foundation. |
| 2026-06-07 | Liturgical calendar pipeline added | External liturgical calendar data (PH context, via `romcal`) begins feeding seasonality features; human-in-the-loop validation workflow introduced. |
| 2026-06-07 | ML model testing suite + real audit logging | `model_lab` framework for offline model evaluation (SARIMA, SARIMAX, XGBoost, MLP, BSTS, Prophet, Holt-Winters, Isolation Forest, SHAP, DEA, MILP, Markov Chain) — this is your model-selection evidence base; audit logging wired to real data (not mock) for the first time. |
| 2026-06-07 | `reference.weather_runs` audit trail | Weather pipeline gains run-level observability — each collection run is logged, not just the data it produces. |
| 2026-06-11 | Centralized events system + weather daily classifier | Weather observations begin being classified per-day (rainfall/temperature/wind/severe/typhoon dimensions) rather than stored as raw readings only. |
| 2026-06-15 | Weather validation pipeline: GPM IMERG, GSOD, WCI confidence scoring | Multi-source weather validation matured — the system cross-checks Open-Meteo/NASA POWER data against independent sources (NOAA GSOD, GPM IMERG) and scores confidence per source, choosing a "champion" data source per municipality. This is a citable methodological contribution (source-of-truth selection under multi-source disagreement). |
| 2026-06-17 to 06-28 | Liturgical source-of-truth validation refined | Iterative correction of liturgical calendar validation flows and fallback columns. |
| 2026-06-29 | IAFR pipeline fixed, ETL analytics bugs resolved, stale weather columns dropped | Single-parish financial submission cleaning (IAFR) pipeline reached a stable state; this is the pipeline that validates and ingests each parish's monthly financial report. |
| 2026-07-13 | Health/stewardship score metrics revised | The financial health-scoring formula (liquidity, sustainability, efficiency, stability, reporting compliance) was tuned — if your manuscript documents the scoring formula, cite this as the most recent revision date. |
| 2026-07-16 | Financial pusher workflow added | Bulk historical financial data import (multi-parish, multi-month consolidated workbooks) — distinct from IAFR's single-parish monthly upload; this is how historical years of data were backfilled. |
| 2026-07-16 to 07-17 | Parish source-code matching, parish/receipt account support | Import-side fuzzy matching between uploaded workbook parish names and the canonical `diocese.institutions` registry — addresses real-world data inconsistency (parishes referred to by multiple names/codes across years of paper records). |
| 2026-07-17 | Hybrid database architecture decided (Supabase OLTP + AWS warehouse) | See §1 onward below. |

**For the manuscript's methodology chapter**, this timeline supports a narrative of: analytics
foundation → external data integration (weather, liturgical) with validation rigor → financial
data ingestion pipeline (IAFR + bulk historical pusher) → infrastructure scaling (hybrid
database). That ordering (build the pipes, then scale the plumbing) is worth stating explicitly
if your paper explains *why* work happened in this sequence.

**Worth flagging for accuracy:** the multi-source weather validation work (GPM IMERG, GSOD, JMA,
NASA POWER, IBTrACS typhoon tracks, confidence scoring, "champion" source selection per
municipality) is genuine methodological depth that's easy to under-report in a manuscript if
you're focused on the ML models. If your Related Literature / Methodology chapter discusses data
quality or multi-source reconciliation, this is where the evidence lives — see
`src/analytics/app/services/weather_validator.py`, `weather_daily_classifier.py`, and the
`src/analytics/scripts/` experiment scripts (`confidence_matrix.py`, `sot_selection*.py`).

---

## 1. What to say drove this decision (Methodology / System Architecture chapter)

Use this order — problem, then evidence, then decision — not "we chose AWS because it's
industry standard." A panel will ask "why," and the honest chain of reasoning is stronger than
a buzzword:

1. **Problem:** the system's single Supabase Postgres database, used for both transactional
   operations and analytical processing, approached its free-tier storage quota during
   development (measured **77% of 500 MB**, 2026-07-16).
2. **Root cause identified:** table-level measurement (`pg_total_relation_size`) showed the
   growth was concentrated in analytically-derived data — daily weather observations
   (`reference.weather_*`, ~176 MB combined) — not the core transactional records.
3. **Adviser direction:** split the database along workload lines to prevent resource
   contention between transactional (submission, approval) and analytical (forecasting,
   health scoring) workloads.
4. **Decision:** adopt a hybrid architecture — Supabase remains the OLTP system of record;
   AWS RDS PostgreSQL hosts a data warehouse with bronze/silver/gold layers for analytical
   workloads.

**Do not write:** "we split the database for scalability" as the primary justification — your
current data volume (tens of thousands of rows) does not require it, and a panelist familiar
with database sizing will notice the mismatch. Storage-quota pressure + workload isolation +
adviser-directed learning objective is the accurate and defensible framing.

## 2. Terminology — use these terms consistently in the manuscript

| Correct term | What it refers to | Do NOT call this... |
|---|---|---|
| **OLTP database** / transactional system | Supabase Postgres | "bronze layer" |
| **Data warehouse** | AWS RDS PostgreSQL | "the AWS database" (too vague for a methodology chapter) |
| **Bronze layer** | Raw mirror of OLTP tables, landed inside the AWS warehouse by ETL | the Supabase database itself |
| **Silver layer** | Cleaned/conformed reference data in the warehouse (weather, liturgical calendar) | — |
| **Gold layer** | Star-schema dimensional/fact tables serving analytics (the `*_analytics` schemas) | — |
| **ETL job** / warehouse refresh | The nightly Python process that mirrors bronze tables and rebuilds gold facts | "sync" (too informal for methodology writing) |

The medallion (bronze/silver/gold) model describes layers **inside the warehouse**, not a label
for two different databases. This distinction matters if a panelist has data engineering
background.

## 3. Measured evidence to cite (use in Results or System Evaluation)

Captured via Supabase Dashboard (Usage report) and a direct `pg_total_relation_size` query,
2026-07-16:

- Database storage: **0.386 / 0.5 GB (77%)** of free-tier quota
- Egress: 0.376 / 5 GB (8%) — **ruled out** as a driver; not the reason for the split
- Top contributors by table size:

| Table | Size | Layer |
|---|---|---|
| audit.change_log | 76 MB | OLTP (retained, addressed via retention policy) |
| reference.weather_temperature_daily | 69 MB | Silver (moved) |
| reference.weather_rainfall_daily | 65 MB | Silver (moved) |
| reference.weather_wind_daily | 42 MB | Silver (moved) |
| operations.financial_push_rows | 42 MB | OLTP staging (addressed via pruning) |
| parishes.iafr_line_items | 21 MB | OLTP (retained — real transactional data) |

**Honesty note for the paper:** attribute storage relief specifically to the weather/reference
tables, not the analytics star schemas — the gold tables were measured near-empty (KB range) at
decision time and move primarily for architectural correctness and future growth, not present
relief. Overstating the gold layer's contribution to storage relief is the kind of detail a
sharp reviewer catches.

## 4. Table inventory at time of decision (for a system architecture diagram/table)

Snapshot taken 2026-07-17 via direct schema inspection, 78 tables total across 13 schemas.

| Schema | Table count | Destination | Domain |
|---|---|---|---|
| diocese | 18 | Supabase (OLTP) | users, roles, institutions, projects, donations, events |
| operations | 9 | Supabase (OLTP) | submission batches, validation, financial import staging |
| parishes | 4 | Supabase (OLTP) | parish master data, financial records |
| schools | 4 | Supabase (OLTP) | school master data, financial records |
| seminaries | 4 | Supabase (OLTP) | seminary master data, financial records |
| audit | 1 | Supabase (OLTP) | change-log trigger audit trail |
| staging | 1 | Supabase (OLTP) | raw liturgical feed landing |
| reference | 8 | AWS (silver) | weather observations/dailies/summary, liturgical calendar |
| shared_analytics | 5 | AWS (gold) | conformed dimensions, model run log, subsidy allocations |
| parish_analytics | 7 | AWS (gold) | parish dims/facts (monthly financials, forecasts, health) |
| school_analytics | 7 | AWS (gold) | school dims/facts (parallel structure) |
| seminary_analytics | 7 | AWS (gold) | seminary dims/facts (parallel structure) |
| priest_assignment_analytics | 3 | AWS (gold) | priest assignment dims/facts |

**41 tables remain exclusively OLTP; 37 tables constitute the warehouse layer.** Note for the
manuscript: this is additive, not subtractive — Supabase does not lose these 37 tables' history;
they become dormant (read-only fallback) once the warehouse is live, per the cutover design in
§6 below. If they are later dropped post-defense to reclaim space, log that as a separate
Change Log entry with the date.

## 5. Known architectural trade-off to address explicitly (Limitations chapter)

**Referential integrity is not real-time across the two databases.** PostgreSQL foreign key
constraints are enforced only within a single database instance; the AWS warehouse's foreign
keys reference a **local mirror** of OLTP tables, refreshed by nightly ETL — not the live
Supabase data. This means:

- A deletion or change on Supabase is not reflected in AWS-side constraint checking until the
  next ETL run (up to ~24 hours).
- This is the standard, accepted trade-off of every medallion/warehouse architecture separated
  from its OLTP source (commonly termed "eventual consistency"), not a defect specific to this
  system.
- Supabase remains the sole source of truth; the AWS mirror is derived and disposable —
  it can be fully rebuilt from Supabase at any time without data loss.

Write this as a deliberate, understood design trade-off in the Limitations/Future Work section,
not something discovered as a flaw. Panels respond well to "we identified X trade-off and
accepted it because Y" and respond poorly to a trade-off surfacing only under cross-examination.

## 6. Migration phases (for a system implementation / development chapter)

Track actual completion dates here as phases finish — this becomes your implementation timeline
narrative.

| Phase | Description | Status | Date |
|---|---|---|---|
| A | AWS RDS PostgreSQL 18.4 (db.t3.micro) provisioned, connectivity verified | Done | 2026-07-17 |
| B | Full schema deployed to AWS: 83 tables / 15 schemas, RBAC seeded, weather rebuild function verified callable. Also found and fixed a pre-existing bug in `rebuild_weather_monthly_summary()` (dangling references to WCI columns dropped by migration 208) — confirmed present on production Supabase too via live function inspection; fix written as migration 219, applied to AWS, pending user decision on applying to Supabase | Done | 2026-07-18 |
| C | Python analytics service dual-connection built (`analytics_db.py`), health scoring (`health_scoring.py`) repointed to write AWS gold tables when `ANALYTICS_DB_URL` is set, verified end-to-end with a real parish's health snapshot landing correctly on AWS | Done | 2026-07-18 |
| D | Minimal bronze mirror built (`warehouse_etl.py`) — `diocese.roles`, `diocese.institutions`, `diocese.profiles` only, enough to satisfy gold-layer FKs. Full 16-table mirror + analytics refresh SQL still pending. Weather pipeline intentionally NOT repointed yet (holding per instruction) | Partial | 2026-07-18 |
| E | Silver pipelines (weather, liturgical) repointed to write AWS | Pending | — |
| F | Cutover — backfill, verification, writers/readers repointed | Pending | — |
| G | Supabase storage hygiene (audit retention, staging pruning) | Pending | — |

## 7. Anticipated defense questions — prepared answers

- **"Why not just upgrade to Supabase Pro ($25/mo)?"** — Cost is comparable to AWS free-tier
  credits over the project timeline; the split additionally provides workload isolation (a
  pipeline failure or bulk analytics query cannot degrade the submission/approval path users
  depend on) and fulfills a stated learning objective in building a warehouse architecture.
- **"Doesn't splitting the database add unnecessary complexity for this data volume?"** —
  Acknowledge directly: at current volume, a single database would perform adequately. The
  decision is driven by the measured storage-quota constraint of the free tier and workload
  isolation, not by scale. State this plainly rather than defend an implied performance claim.
- **"How do you guarantee data consistency across two databases?"** — See §5. Eventual
  consistency via nightly ETL; Supabase is the authoritative source; the AWS copy is a rebuildable
  derived layer.
- **"What happens to personal/sensitive data in the warehouse?"** — State explicitly what is
  and is not mirrored (e.g., if priest names are excluded from `priest_assignment_analytics`
  and only IDs are used) — confirm this against the actual ETL implementation once built, and
  update this section accordingly.

---

## Change Log

*(Append an entry each time a phase completes or a decision changes. Keep entries short —
this feeds the manuscript's development narrative, not a full commit history.)*

- **2026-07-17** — Architecture decided: hybrid Supabase (OLTP) + AWS RDS PostgreSQL (warehouse).
  Storage evidence gathered (77% quota, weather tables identified as primary driver). AWS RDS
  instance provisioned (PostgreSQL 18.4, db.t3.micro, `paulus_db`) and connectivity verified.
  Table inventory taken: 78 tables / 13 schemas in Supabase, 41 will remain OLTP-only, 37 will
  form the warehouse layer.
- **2026-07-18** — Full schema deployed to AWS via `scripts/apply_aws_migrations.py` and
  `supabase/aws_migrations/manifest.txt` (83 tables / 15 schemas; the extra tables/schemas vs.
  the 78/13 counted on Supabase are `debug` views, `public`, and RBAC seed rows — not new
  domain tables). The checked-in migration files were not straightforwardly replayable in
  filename order — several are legacy patches meant only for pre-existing installs (skipped),
  a handful reference columns added by later-numbered files (reordered), and the analytics
  refresh scripts (130/140/150/160) are meant to run last, after all schema DDL, per the
  deployment guide's own step ordering (moved to the end). All decisions are documented inline
  in the manifest. Discovered and fixed a real bug affecting production Supabase: migration
  208 dropped WCI columns from `reference.weather_monthly_summary` but the rebuild function was
  never updated to match — confirmed broken on live Supabase via direct function inspection,
  fixed as migration 219, applied to AWS, application to Supabase pending user review.
- **2026-07-18** — Phase C built and verified: `src/analytics/app/services/analytics_db.py`
  (psycopg-based AWS client, mirrors the supabase_client.py call shape), wired into
  `config.py`/`requirements.txt`/`main.py` shutdown. `health_scoring.py`'s gold-layer
  write-back now branches to AWS when `ANALYTICS_DB_URL` is set. Building this surfaced the
  cross-database FK dependency in practice (see architecture note above): AWS's
  `shared_analytics.dim_institutions` FKs to a local `diocese.institutions`, which was empty.
  Built a minimal bronze mirror (`warehouse_etl.py`) covering just `diocese.roles`,
  `diocese.institutions`, `diocese.profiles` — enough to satisfy the FK. This surfaced three
  real, pre-existing data issues, all now fixed as tracked migrations/logic rather than
  workarounds: (1) `diocese.profiles` schema drift — `birthday`/`onboarding_completed` existed
  live on Supabase via an untracked legacy migration, added as portable migration 220; (2) a
  soft-deleted test profile with a NULL `profile_code` triggered a colliding auto-generated
  code when mirrored — fixed by disabling `trg_profile_code` for the duration of the mirror
  insert, the standard pattern for bulk loads; (3) three real custom roles (`father`, `madre`,
  `sakristan`) created by actual users exist only as live data, never in the static RBAC seed —
  `diocese.roles` is now mirrored, not just seeded. End-to-end verified: a real parish's health
  score computed correctly and its snapshot landed correctly across
  `dim_institutions`/`dim_parishes`/`fact_parish_health_snapshots` on AWS. Weather pipeline
  intentionally not touched this session, per explicit instruction to hold it for separate
  testing.
