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
4. **Decision:** adopt a hybrid architecture — Supabase remains the OLTP system of record and,
   with row-level mutation history, the logical source/bronze tier; AWS RDS PostgreSQL hosts
   cleaned silver and analytical gold data. A physical AWS bronze copy is retained only during
   migration comparison.

**Do not write:** "we split the database for scalability" as the primary justification — your
current data volume (tens of thousands of rows) does not require it, and a panelist familiar
with database sizing will notice the mismatch. Storage-quota pressure + workload isolation +
adviser-directed learning objective is the accurate and defensible framing.

## 2. Terminology — use these terms consistently in the manuscript

| Correct term | What it refers to | Do NOT call this... |
|---|---|---|
| **OLTP database** / transactional system | Supabase Postgres | a warehouse table |
| **Data warehouse** | AWS RDS PostgreSQL | "the AWS database" (too vague for a methodology chapter) |
| **Logical source/bronze tier** | Supabase current data plus `audit.change_log` row history | `diocese.audit_logs` alone |
| **Transitional AWS bronze copy** | Temporary source-faithful comparison tables in AWS | the final analytical source |
| **Silver layer** | Cleaned/conformed AWS data, including `parish_silver` | — |
| **Gold layer** | Star-schema dimensional/fact tables serving analytics (the `*_analytics` schemas) | — |
| **ETL job** / warehouse refresh | Python extraction, cleaning, reconciliation, and loading into AWS | "sync" (too informal for methodology writing) |

The layers are logical data-quality stages and do not have to reside in one database. Be explicit
that Supabase is simultaneously the live OLTP system and logical source tier; its mutation log is
the historical control that makes direct-to-silver defensible.

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

**Referential integrity is not cross-database.** PostgreSQL foreign keys are enforced only
within one database. Direct silver therefore stores Supabase UUIDs as lineage values without
foreign keys back to Supabase; silver-owned parent/child relationships remain enforced locally.
Gold dimensions may still use temporary local reference copies during transition. This means:

- A deletion or change on Supabase reaches AWS after the watermark poll and successful
  reconciliation, rather than in the same OLTP transaction.
- This is the standard, accepted trade-off of every medallion/warehouse architecture separated
  from its OLTP source (commonly termed "eventual consistency"), not a defect specific to this
  system.
- Supabase remains the sole source of truth; AWS silver is derived and rebuildable from the
  current source plus retained row-level audit history.

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
| D | Direct Supabase-to-silver transition validated for one parish across 2021-2025: 60 records and 2,344 lines matched the temporary bronze copy by IDs and PHP 33,816,254.76 total. Audit migration 221 is live and end-to-end incremental verification passed. | Done | 2026-07-18 |
| E | Parish finance gold/data mart formulas approved and fact refresh implemented | Pending | — |
| F | Silver pipelines (weather, liturgical) repointed to write AWS | Pending | — |
| G | Cutover — full backfill, verification, writers/readers repointed | Pending | — |
| H | Supabase storage hygiene (audit retention, staging pruning) | Pending | — |

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
  consistency via watermark-driven ETL; Supabase is authoritative, and counts, UUID sets, and
  amount totals are reconciled before a watermark advances.
- **"What happens to personal/sensitive data in the warehouse?"** — State explicitly what is
  and is not mirrored (e.g., if priest names are excluded from `priest_assignment_analytics`
  and only IDs are used) — confirm this against the actual ETL implementation once built, and
  update this section accordingly.

## 8. Financial Health Score — citation basis and defense (for Methodology / Related Literature chapter)

The composite score (`health_scoring.py`) blends five weighted dimensions: liquidity (25%),
sustainability/operating margin (25%), efficiency (20%), stability (15%), and reporting
compliance (15%). Each dimension is grounded in cited literature; the specific weights and
scaling constants are not — be precise about which is which in the manuscript.

**Citation mapping — use this table in Methodology or Related Literature:**

| Dimension / decision | Supporting source |
|---|---|
| Using a composite index at all (not one ratio) | Bunting, "Dimensions and indicators of non-profit financial condition" (100+ ratios exist in the literature, no single agreed measure); Zietlow, "A Financial Health Index for Achieving Nonprofit Financial Sustainability" (direct precedent for combining liquidity/solvency/flexibility into one index) |
| Liquidity (25%) | Nonprofit Finance Fund, "Top Indicators of Nonprofit Financial Health" (liquidity as a critical measure of ability to withstand risk); "A Methodology for Measuring the Financial Sustainability of Non-Profit Organizations" (lists liquidity explicitly among weighted indicators) |
| Sustainability / operating margin (25%) | Tuckman & Chang's nonprofit financial vulnerability model (operating margin is one of the model's core variables, discussed in *Voluntas*/Cambridge); Lewis Center, "9 Questions to Assess Your Church's Financial Health" ("long-term sustainability") |
| Efficiency (20%) | The Methodology paper above (lists efficiency explicitly, alongside liquidity/profitability/solvency) |
| Stability (15%) | General volatility-as-risk-proxy technique, standard in financial/time-series analysis (coefficient of variation on monthly revenue, MoM growth) |
| Reporting compliance (15%) | **USCCB Diocesan Financial Management Guide** (finance councils, budgets, financial statements, and pastor accountability as parish financial management requirements); **Code of Canon Law, Book V, Canons 1284 and 1287** (organized books, annual reports, and accountability for ecclesiastical goods are a canonical requirement, not a data-quality convenience) |

**What this table does and does not establish — state this explicitly in the defense:** the
citations justify *which five categories* belong in a Catholic parish financial health score and
*why*. They do not specify the arithmetic. Nobody in the cited literature weights liquidity at
25% or scales operating margin by ×200 — those are tuned parameters, and per the 2026-07-13
Change Log entry above, that revision date is what should be cited for the formula itself, not
any of the sources in this table. If a panel member asks "why 25% and not 30%?", the honest
answer is design judgment tuned against the diocese's real data, not a research finding — say so
directly rather than reaching for a citation that isn't there.

**Reporting compliance is the model's most original contribution.** It is the one dimension with
no equivalent in the generic nonprofit financial-health literature (Tuckman & Chang, Zietlow,
Bunting) — it exists because Catholic canon law imposes a specific recordkeeping and reporting
obligation the secular models have no reason to include. This is worth stating explicitly as a
context-specific extension of the general framework, not just a fifth generic ratio.

**Known, named limitation: no reserve/net-asset dimension.** Tuckman & Chang and the Lewis Center
both include reserve/equity strength as a distinct dimension of nonprofit financial health.
Checked directly against both data sources on 2026-07-22: Supabase's `parishes.financial_records`
has the right-shaped columns (`beginning_balance`, `ending_balance_after_remit`) but they are
unpopulated (zero) for all 92 parishes; the AWS warehouse's closest field,
`pastoral_parish_fund_total_net_receipts_deficit`, is a monthly net-flow figure, not an
accumulated balance. A reserve dimension is not addable today because the underlying data does
not exist yet, not because it was overlooked. State this as: *"per Tuckman & Chang and the Lewis
Center, reserve/net-asset strength is a recognized dimension of nonprofit financial health; it
was excluded here because the diocese's reporting pipeline does not yet capture balance-sheet
data, only income-and-expense flows. Incorporating it is identified as future work contingent on
that data becoming available."* This reads as more rigorous than silently omitting the
dimension — it shows the gap was identified, understood, and explicitly deferred for a named
reason.

## 9. Parish Cluster Analysis — citation basis and design evolution (for Methodology chapter)

The rule-based parish clustering (`descriptive/parish_cluster.py`, and its forecasting
counterpart `predictive/cluster_forecast.py`) assigns every parish to one of four clusters
(A/B/C/D) using a 2x2 quadrant: **stability** (seasonally-adjusted collection volatility) ×
**net margin** (positive/negative), with both axis thresholds set by a dynamic median-split
computed diocese-wide (recomputed against the full 92-parish set regardless of which filter is
active in the UI, so "high" and "low" mean the same thing no matter what scope a user is
viewing).

**Design evolution — state this explicitly, don't let a panel discover it:** the original
prototype (`src/analytics/model_lab/model_rule_based_segmentation.py`) documents a different
A/B/C/D quadrant — collection volume × net margin, with no stability component. The
implementation described here deliberately diverges from that prototype because the client
specified clustering should reflect parish *stability*, which the original design does not
capture at all (a parish could have high, wildly volatile collections and still land in the same
cluster as a parish with high, steady collections). Frame this as a client-directed refinement of
an early prototype, not an inconsistency — the quadrant *structure* (four clusters from two binary
dimensions) is preserved; one axis was replaced to match the actual requirement.

**Citation basis — three layers, cite each for what it actually supports:**

| What needs justifying | Source | What it supports |
|---|---|---|
| Why stability matters as a nonprofit/church financial health dimension at all | Tuckman & Chang's nonprofit financial vulnerability model; Lewis Center, "9 Questions to Assess Your Church's Financial Health" ("recurring income") | Same citations already used in §8 — stability/predictability of revenue is a recognized dimension of nonprofit financial condition, not something invented for this system. |
| Why stability is measured from the STL *residual*, not raw variance | Cleveland, Cleveland, McRae & Terpenning (1990), "STL: A Seasonal-Trend Decomposition Procedure Based on Loess," *Journal of Official Statistics*; Hyndman & Athanasopoulos, "Forecasting: Principles and Practice" | Raw month-to-month variance would flag every parish as "volatile" purely from predictable liturgical-calendar swings (Christmas, Holy Week) that this system's own seasonality analysis already confirms are large and universal. STL decomposition — already used elsewhere in this codebase for anomaly detection — separates trend and seasonal pattern from the *remainder*, so only genuinely unexplained volatility counts against a parish's stability score. This is standard time-series methodology, not a bespoke technique. |
| Why pairing a volatility axis with a margin axis into one quadrant is a sound structure | Markowitz (1952), "Portfolio Selection," *Journal of Finance* | The foundational risk-return framework: classify entities simultaneously by a performance measure (margin ≈ return) and a volatility measure (stability ≈ inverse of risk). Not nonprofit-specific — cite it for the *structural* choice of a 2-axis quadrant, adapted here from investment portfolios to parishes. |

**What remains yours to defend as design, not literature:** the median-split mechanism and the
STL-residual approach are both citable methodology; the *specific* threshold values that result
from running median-split against this diocese's actual data, and the exact quadrant boundaries,
are empirical outputs of your data, not a claim from any of the sources above — same distinction
as the Health Score's weights in §8.

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
- **2026-07-18** — Parish bronze pipeline Phases 0-2 completed. Added the source-to-bronze
  contract and AWS-only `warehouse_control` run, watermark, failure, and reconciliation tables.
  Extended `warehouse_etl.py` with explicit dry-run and manual-pilot modes. Verified Blessed
  Sacrament Parish (`D1-23`) for 2021: 12 monthly records and 367 line items loaded with all 40
  reconciliation checks passing; an idempotency rerun retained the same counts. The complete
  114-account Supabase catalog was aligned to AWS source UUIDs before the first financial load.
  No silver objects or parish gold facts were populated.
- **2026-07-18** — Phase 3 limited automation enabled for Blessed Sacrament Parish only. Added
  a FastAPI background polling worker with an explicit allowlist, per-parish source watermark,
  full child-snapshot replacement, record-level reconciliation, failure logging, and retry by
  withholding watermark advancement. A forced incremental record sync passed all checks, and
  an idle poll left bronze at 12 records/367 lines with no gold facts. Lambda/EventBridge
  deployment remains pending because no AWS deployment credentials are configured locally.
- **2026-07-18** — Phase 4 parish finance silver layer deployed and verified. Added the AWS-only
  `parish_silver` schema with current parish-month and source-line-item grains, canonical account
  enrichment, normalized dates/text/statuses, lineage timestamps and ETL run IDs, and explicit
  quality flags. Backfilled 12 pilot months into 12 record rows and 367 line rows; counts and
  amount sums reconciled, an idempotency rerun produced no duplicates, and gold facts remained
  empty. Legacy missing submission/preparer/certifier/validation metadata remains as warnings.
- **2026-07-18** — Architecture simplified to direct Supabase-to-AWS-silver ETL. Added portable
  migration 221 for complete line-item, account-title, and parish-detail OLD/NEW audit history;
  it is deployed on AWS for parity and pending execution in Supabase. Decoupled silver lineage
  UUIDs from temporary bronze foreign keys and verified all 60 current records/2,344 lines for
  the pilot parish across 2021-2025. Direct silver and bronze comparison IDs and the
  PHP 33,816,254.76 total match exactly. The source profile found 24 absent parish-years, all
  in 2023, requiring authoritative-file review before correction.
- **2026-07-18** — Migration 221 applied to live Supabase and verified with a controlled
  line-item update that preserved the amount while recording complete OLD/NEW JSONB through
  the secure audit view. The automatic transition run passed 39 bronze comparison checks and
  four direct-silver checks, advanced the source watermark, and left zero open failures.
- **2026-07-22** — Added §8: citation basis for the Financial Health Score's five dimensions,
  mapping each to specific nonprofit/church financial-health literature (Bunting, Zietlow,
  Nonprofit Finance Fund, the NPO financial sustainability methodology paper, Tuckman & Chang,
  the Lewis Center, USCCB's Diocesan Financial Management Guide, and Canon Law 1284/1287).
  Documented the reasoning for why the specific weights/scaling remain engineering judgment
  (cite the 2026-07-13 revision for those, not this literature). Checked both Supabase and the
  AWS warehouse directly for reserve/net-asset data to support a possible sixth dimension:
  confirmed neither has usable data yet (Supabase's balance columns exist but are unpopulated;
  AWS only has a monthly net-flow figure, not an accumulated balance) — logged as a named,
  data-availability-driven limitation rather than an oversight.
- **2026-07-22** — Added §9: documented that the parish cluster design (`descriptive/parish_cluster.py`,
  `predictive/cluster_forecast.py`) will move to an A/B/C/D quadrant of stability (seasonally-adjusted,
  STL-residual-based volatility) × net margin, replacing both the original prototype's
  collection-level × margin design (`model_rule_based_segmentation.py`, no stability component) and
  today's live deficit/growth/variance rule cascade — driven by an explicit client requirement that
  clustering reflect parish stability, which neither prior version captured cleanly. Logged the
  three-layer citation basis (Tuckman & Chang/Lewis Center for why stability matters; Cleveland et
  al. 1990 and Hyndman & Athanasopoulos for deseasonalizing via STL residual before measuring
  volatility; Markowitz 1952 for the risk-return quadrant structure itself) and flagged the
  design-evolution reasoning to state explicitly in the manuscript rather than leave for a panel to
  discover.
