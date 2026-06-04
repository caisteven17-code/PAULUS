# Portable PostgreSQL Deployment Guide

This migration pack is based on `DATABASE_COLUMNS_UPDATED_SEPARATED_SCHEMA.md` and intentionally excludes the `sandbox` schema for now.

## What This Pack Includes

- Shared admin core: `diocese.*`
- Upload lifecycle: `operations.*`
- Operational entry schemas: `parishes.*`, `schools.*`, `seminaries.*`
- Analytics schemas: `shared_analytics.*`, `parish_analytics.*`, `school_analytics.*`, `seminary_analytics.*`
- Priest assignment analytics: `priest_assignment_analytics.*`
- Context/reference tables: `reference.*`
- Compatibility views for transition
- Seed files for roles and permissions

## What This Pack Does Not Include Yet

- `sandbox.*`
- production RLS policies
- ETL procedures that populate analytics facts from operational tables
- AWS IAM / Supabase Auth application code

## Step By Step In Supabase

1. Back up the current database.
   Export your current schema and data first.

2. Create a clean test project in Supabase.
   Do not run this in production first.

3. Run the migration files in this exact order:

```text
portable_migrations/000_extensions_and_helpers.sql
portable_migrations/001_create_schemas.sql
portable_migrations/010_diocese_core.sql
portable_migrations/020_operations.sql
portable_migrations/030_parishes.sql
portable_migrations/040_schools.sql
portable_migrations/050_seminaries.sql
portable_migrations/060_shared_analytics.sql
portable_migrations/070_parish_analytics.sql
portable_migrations/080_school_analytics.sql
portable_migrations/090_seminary_analytics.sql
portable_migrations/100_priest_assignment_analytics.sql
portable_migrations/110_reference.sql
portable_migrations/120_compatibility_views.sql
portable_migrations/125_seed_dim_date.sql
portable_migrations/130_sync_analytics_dimensions.sql
portable_migrations/140_refresh_parish_analytics.sql
portable_migrations/150_refresh_school_analytics.sql
portable_migrations/160_refresh_seminary_analytics.sql
```

4. If you want Supabase Auth to auto-create `diocese.profiles`, run:

```text
portable_optional/140_supabase_auth_sync.sql
```

5. Run the seed files:

```text
portable_seeds/001_roles_permissions.sql
portable_seeds/002_entities_template.sql
```

6. Replace the sample institutions in `002_entities_template.sql` with your real data.

7. Migrate your old operational rows.
   Recommended order:
   - move institutions first into `diocese.institutions`
   - move users into `diocese.profiles`
   - move parish rows into `parishes.financial_records`
   - move school rows into `schools.financial_records`
   - move seminary rows into `seminaries.financial_records`
   - use [170_legacy_backfill_template.sql](/c:/Users/user/Downloads/PAULUS/CAPSTONE-PROTOTYPE/supabase/portable_migrations/170_legacy_backfill_template.sql:1) as your starting template if you are migrating from the old monolithic structure

8. Populate analytics.
   Run:
   - `portable_migrations/130_sync_analytics_dimensions.sql`
   - `portable_migrations/140_refresh_parish_analytics.sql`
   - `portable_migrations/150_refresh_school_analytics.sql`
   - `portable_migrations/160_refresh_seminary_analytics.sql`

9. Switch the app to read from:
   - operational tables for data entry
   - `shared_analytics.diocesan_consolidated_financials` for unified reporting
   - `public.financial_records_compat` only as a temporary bridge

10. After validation, retire the old monolithic `public.financial_records` table.
   Do this only after the app no longer depends on it directly.

## Recommended Migration Strategy From Your Current Setup

1. Keep your current working DB unchanged.
2. Spin up a new Supabase test project.
3. Apply this portable pack there.
4. Write one data backfill script from old tables to new schemas.
5. Validate totals per entity and month.
6. Update app queries and services.
7. Run user acceptance testing.
8. Cut over production.

## AWS RDS Notes

This pack stays close to plain PostgreSQL:

- It uses `pgcrypto`, which is available on PostgreSQL and typically available on AWS RDS.
- Core tables do not depend on `auth.users`.
- The Supabase Auth sync is isolated in `portable_optional/140_supabase_auth_sync.sql`.
- You can keep the same table design on AWS and replace auth integration later with:
  - Cognito
  - custom app auth
  - another identity provider

When moving to AWS RDS later:

1. Create the database.
2. Enable `pgcrypto`.
3. Run the same `portable_migrations/*.sql` files.
4. Skip `portable_optional/140_supabase_auth_sync.sql`.
5. Load your production data backup.
6. Point the application to the RDS endpoint.

## Next SQL You Will Still Need Later

- a finalized backfill script based on your actual legacy tables
- RLS policies after your final auth flow is stable
- indexes tuned from real query plans
- optional stored procedures for scheduled analytics refresh

## Suggested Next Task

Finalize the placeholder backfill file with your real current tables and then we can generate a production-safe cutover script.
