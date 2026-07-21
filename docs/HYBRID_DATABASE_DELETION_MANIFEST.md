# Hybrid Database Deletion Manifest

No object in this document is authorized for permanent deletion merely by
appearing here. Backups, reconciliation, quarantine, observation, and explicit
final approval are mandatory.

## Cutover status (2026-07-21)

- AWS migrations 074 and 075 are deployed.
- Institution, school, and seminary synchronization completed; key, count, and
  amount reconciliation passed for the currently available source records.
- AWS `operations`, `parishes`, `schools`, and `seminaries` are reversibly
  quarantined as `legacy_operations`, `legacy_parishes`, `legacy_schools`, and
  `legacy_seminaries`.
- The application and all analytics workers are running with direct Supabase
  operational sources and AWS-local Silver/Gold relationships.
- Supabase weather quarantine is complete: all six weather tables are under
  `retired_analytics` and unavailable through `reference`.
- Analytical schema names remain available because they are configured as
  exposed API schemas. Renaming them caused a PostgREST schema-cache outage;
  the schemas were restored and the quarantine script was corrected.
- No quarantined object is approved for permanent deletion. A full restore test
  and observation window are still required before requesting that approval.

## Supabase: retain

- authentication and storage;
- `diocese`, `operations`, `parishes`, `schools`, and `seminaries` operational
  schemas;
- operational audit data;
- `reference.liturgical_calendar`, the canonical user-reviewed calendar.

## Supabase: quarantine candidates

- `reference.weather_observations`;
- `reference.weather_rainfall_daily`;
- `reference.weather_temperature_daily`;
- `reference.weather_wind_daily`;
- `reference.weather_monthly_summary`;
- `reference.weather_runs`;
- analytical tables can be considered later, but their schema names must not be
  renamed while Supabase lists them as exposed API schemas. The current tables
  are empty compatibility structures and consume negligible data storage.

Use `supabase/maintenance/quarantine_supabase_analytics.sql`; do not drop the
entire `reference` schema.

## AWS: retain

- `shared_analytics`;
- `parish_silver`, `school_silver`, and `seminary_silver`;
- `parish_analytics`, `school_analytics`, `seminary_analytics`, and
  `priest_assignment_analytics`;
- `reference`, `staging`, and `warehouse_control`;
- `audit.change_log` only if the final audit confirms it records analytical
  warehouse changes rather than operational mirror activity.

## AWS: quarantine candidates

- current `legacy_diocese` (already quarantined);
- `operations` (9 tables);
- `parishes` (4 tables);
- `schools` (4 tables);
- `seminaries` (4 tables);
- obsolete `public.financial_records_compat` and
  `shared_analytics.diocesan_consolidated_financials` views (removed by
  migration 074).

Use `supabase/maintenance/quarantine_aws_operational_mirrors.sql` only after
migrations 074/075 and the school/seminary backfills pass.

## Mandatory exit gates

1. Zero executable Supabase weather consumers.
2. Calendar review CRUD writes Supabase, never AWS.
3. Zero Supabase analytical fallback writes.
4. Zero external AWS dependencies into each quarantined operational schema.
5. Source/target key, count, required-field, and aggregate reconciliations pass.
6. Backups are checksum-verified and restore-tested.
7. Financial submission, institution edit, calendar review, weather update,
   workers, APIs, and dashboards pass while quarantine names are active.
8. The observation window completes without dependency errors.
9. A new explicit approval names every schema/table to be permanently dropped.
