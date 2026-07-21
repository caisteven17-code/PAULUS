# PAULUS Hybrid Database Target Architecture

## Status

This document is the migration contract for moving PAULUS from a broad
Supabase-to-AWS operational mirror to a purpose-built analytics warehouse.

- Phase 1: complete in the repository.
- Phase 2: deployed and verified on AWS on 2026-07-21.
- Phase 3: deployed and verified on AWS on 2026-07-21.
- Phase 4: deployed and reconciled on AWS on 2026-07-21.
- Phase 5: reversible observation period started on AWS on 2026-07-21;
  permanent deletion is pending.

No AWS operational table may be dropped until the exit checks in this document
pass. Supabase remains authoritative throughout the migration.

## Architecture decision

### Supabase owns operational data

Supabase is the only system in which application users create or update:

- authentication identities, profiles, roles, and permissions;
- institutions and entity details;
- events, announcements, projects, donations, and expenses;
- financial submissions and workflow state;
- application audit records and OTP records.

### AWS owns derived analytical data

AWS stores only data required to clean, reconcile, aggregate, model, or serve
analytics:

- `shared_analytics` dimensions;
- parish, school, seminary, and priest-assignment analytical dimensions/facts;
- cleaned silver financial data;
- forecasts, health snapshots, anomaly results, and aggregates;
- warehouse watermarks, runs, failures, retries, alerts, and reconciliation
  results;
- analytical weather and liturgical reference data.

AWS is derived and rebuildable. Application code must not treat AWS as the
authoritative editor for an institution or another operational record.

## Required institution flow

```text
Application write
      |
      v
Supabase diocese.institutions  (authoritative UUID)
      |
      | incremental, idempotent ETL
      v
AWS shared_analytics.dim_institutions
      |
      | local AWS foreign keys using institution_key
      v
AWS silver, fact, aggregate, and model tables
```

AWS cannot enforce a normal PostgreSQL foreign key against a table in the
separate Supabase database. The Supabase UUID is therefore retained as a unique
lineage key, while AWS relationships use the local warehouse surrogate key.

## Minimal institution contract

`shared_analytics.dim_institutions` may retain only fields needed for analytics:

| Field | Purpose |
| --- | --- |
| `institution_key` | Local AWS surrogate key and foreign-key target |
| `institution_id` | Unique Supabase source UUID |
| `institution_code` | Stable reporting identifier, when available |
| `institution_name` | Dashboard label |
| `institution_type` | Parish, school, seminary, or diocese grouping |
| `vicariate` | Analytical grouping |
| `district` | Analytical grouping |
| `cluster` | Analytical grouping |
| `institution_class` | Analytical grouping |
| `subsidy_type` | Subsidy analysis, when applicable |
| `latitude`, `longitude` | Geospatial analytics, when required |
| `is_active` | Current source status |
| `source_updated_at` | Incremental-source watermark and lineage |
| `warehouse_updated_at` | Warehouse load lineage |

Do not copy passwords, password hashes, OTPs, private profile/contact fields, or
unrelated operational payloads into this dimension.

## Synchronization rules

1. Select records using a source `updated_at` watermark plus a stable ID
   tiebreaker.
2. Upsert by the Supabase institution UUID; reruns must not create duplicates.
3. Advance the watermark only after the AWS transaction and reconciliation
   checks succeed.
4. Represent removals through `deleted_at` or inactive status during migration;
   do not silently hard-delete dimension members used by historical facts.
5. Retry failures without advancing past the failed source change.
6. Run a scheduled full key-set and checksum reconciliation in addition to the
   incremental process.
7. Store only redacted diagnostics in ETL logs.

District, vicariate, cluster, class, and assignment changes need an explicit
history policy. Phase 2 will introduce current-state synchronization first;
historical Type 2 dimension behavior will be added before the old operational
mirror is retired.

## Migration phases and gates

### Phase 1 - Ownership and dependency baseline

- Publish this ownership contract.
- Inventory executable AWS dependencies on operational `diocese` objects.
- Add a repeatable static dependency audit.
- Do not change or delete deployed database objects.

Exit gate: the dependency audit runs successfully and reports the known current
dependencies.

### Phase 2 - Minimal institution dimension and ETL

- Make `shared_analytics.dim_institutions` independent of the AWS operational
  `diocese.institutions` foreign key.
- Add source and warehouse lineage fields.
- Add a dedicated Supabase-to-AWS incremental institution synchronizer.
- Add idempotency, watermark, retry, and reconciliation tests.

Exit gate: creating, editing, deactivating, and retrying an institution produces
the expected AWS current dimension without a financial-record change.

Phase 2 deployment sequence:

```powershell
python scripts/apply_aws_migrations.py --only 068_decouple_institution_dimension
$env:PYTHONPATH='src/analytics'
python -m app.services.institution_dimension_sync --once
```

After the controlled first run succeeds, set these values in the deployment
environment and restart the analytics service:

```dotenv
WAREHOUSE_INSTITUTION_SYNC_ENABLED=true
WAREHOUSE_INSTITUTION_POLL_SECONDS=60
```

Keep the worker disabled until migration 068 has successfully committed.

### Phase 3 - Repoint AWS relationships

- Change silver and analytical relations to local `institution_key` foreign
  keys targeting `shared_analytics.dim_institutions`.
- Update loaders to resolve Supabase UUIDs to AWS keys.
- Remove runtime writes to AWS `diocese.institutions` and `diocese.profiles`.
- Replace analytical display-name dependencies on operational profiles with
  privacy-reviewed dimensions or source-neutral labels.

Exit gate: all new analytical loads work with writes to the AWS operational
mirror disabled.

Phase 3 implementation adds `institution_key` to parish Silver financial
records, line items, and reporting coverage. The Supabase UUID remains as a
lineage value, while the enforced AWS foreign key targets
`shared_analytics.dim_institutions`.

Deployment sequence, only after the Phase 2 exit gate passes:

```powershell
python scripts/apply_aws_migrations.py --only 069_repoint_parish_silver_institution_keys
```

The migration deliberately fails before adding `NOT NULL` constraints if any
existing Silver or coverage row cannot be mapped to the institution dimension.
This is a safety stop, not an instruction to discard an unmatched row.

The deployment environment must also use:

```dotenv
WAREHOUSE_BRONZE_COMPARISON_ENABLED=false
```

This prevents the automatic financial worker from continuing to populate the
temporary AWS operational mirror. The direct Supabase-to-Silver comparison and
reconciliation remain active.

### Phase 4 - Refresh migration and parallel verification

- Replace AWS refresh queries that read operational `diocese` tables.
- Source event-derived measures through an approved analytical event feed or
  precomputed event aggregates.
- Run old and new paths in parallel without changing production reads.
- Reconcile keys, required-field completeness, facts, aggregates, and dashboard
  output.

Exit gate: no executable runtime or refresh dependency remains on the AWS
operational `diocese` schema.

Phase 4 is split into three controlled deployments:

1. **4A - Parish dimension:** migration 070 makes parish identity come from
   `shared_analytics.dim_institutions`; the refresh service reads operational
   parish details directly from Supabase and no longer copies profiles to AWS.
2. **4B - Weather:** migration 071 replaces the operational institution foreign
   key with the local `institution_key`; collectors, loaders, run logs, and
   summaries write to AWS `reference` tables only.
3. **4C - Liturgical calendar:** generated candidates remain pending in
   Supabase, where users can edit and approve them. Canonical Supabase rows are
   synchronized to AWS, and analytical views include approved states only.

Deployment sequence:

```powershell
python scripts/apply_aws_migrations.py --only 070_decouple_parish_dimension_refresh
python scripts/apply_aws_migrations.py --only 071_decouple_weather_ownership
$env:PYTHONPATH='src/analytics'
python -m app.services.liturgical_calendar_loader --sync-approved-from-supabase
```

Set the canonical calendar owner explicitly in the deployment environment:

```dotenv
LITURGICAL_CANONICAL_SOURCE=supabase
LITURGICAL_APPROVAL_SYNC_ENABLED=true
LITURGICAL_APPROVAL_POLL_SECONDS=300
```

The four legacy portable refresh scripts (`130`, `140`, `150`, and `160`) are
excluded from the AWS manifest because they query the operational mirror. They
remain historical migration artifacts and must not be used as scheduled jobs.

### Phase 5 - Retirement

- Back up the AWS operational schema.
- Revoke writes, then rename it to `legacy_diocese` for a monitored observation
  period.
- Run ETL, analytics APIs, dashboards, scheduled jobs, and recovery tests.
- Drop the legacy schema only after the dependency audit is clean and the
  rollback window is accepted.

Exit gate: production analytics operates solely from analytical schemas and the
approved Supabase source feeds.

Phase 5 observation deployment completed these reversible steps:

- created and checksum-verified a custom-format backup of the AWS `diocese`
  schema;
- deployed migration 073 to remove all cross-schema foreign keys, retire the
  legacy debug views, and repoint the consolidated financial view;
- renamed `diocese` to `legacy_diocese` using
  `supabase/maintenance/retire_aws_diocese.sql`;
- verified zero external foreign keys into the legacy schema, zero missing
  Silver institution keys, zero parish/weather dimension orphans, all three
  background workers, and the analytics status API;
- retained `supabase/maintenance/rollback_aws_diocese_retirement.sql` for an
  immediate schema-name rollback.

Do not permanently drop `legacy_diocese` until the agreed observation period
has passed and production logs, scheduled jobs, dashboards, and recovery tests
remain clean.

## Current blockers discovered in Phase 1

The current AWS deployment cannot drop `diocese.institutions` because:

- `shared_analytics.dim_institutions` was originally defined with a foreign key
  to it;
- `parish_silver.financial_records` and
  `parish_silver.financial_line_items` reference it;
- the master-data ETL mirrors institutions and profiles into AWS;
- dimension refresh SQL reads institutions and profiles locally;
- parish dimension identity SQL joins it;
- school, seminary, and parish analytical refreshes read local events;
- other portable schemas deployed to AWS contain operational foreign keys.

These are migration dependencies, not reasons to preserve the full duplicate as
the final architecture.

## Non-goals

- No direct browser-to-AWS database access.
- No cross-database foreign keys.
- No `postgres_fdw` dependency for normal dashboard requests.
- No dual-write from an application request to both databases.
- No immediate destructive removal of the AWS `diocese` schema.
