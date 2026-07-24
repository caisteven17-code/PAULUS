# Weather and Liturgical Reference Medallion

Gold table names remain unchanged.

## Deployment status

- AWS migrations 077 and 078 applied successfully.
- AWS legacy-to-`reference_silver` backfill and content reconciliation passed.
- Weather and liturgical Gold refresh functions now read `reference_silver`.
- Local analytics runtime now targets `reference_silver`.
- Supabase migration 229 is pending a Supabase database/management connection.
- RDS Bronze is implemented by AWS migration 079.

## Weather

```text
Weather APIs
  -> operations.weather_ingestion_*
  -> reference_bronze.weather_api_raw
  -> reference_silver.weather_*_daily
  -> reference_silver.weather_municipality_monthly
  -> parish_analytics.agg_parish_weather_monthly
```

Bronze is fail-closed: when `WEATHER_BRONZE_ENABLED=true`, a failed RDS Bronze
insert prevents Silver writes. `operations` stores only workflow state and a
foreign key to the immutable raw payload.

## Liturgical calendar

```text
External sources
  -> Supabase operations.liturgical_calendar_ingestion_*
  -> Supabase reference.liturgical_calendar (human-reviewed canonical master)
  -> AWS reference_silver.liturgical_calendar
  -> parish_analytics.dim_liturgical_day
  -> parish_analytics.agg_liturgical_month
```

Only `approved` and `approved_with_revisions` records are eligible for Gold.

## Safe rollout

1. Apply Supabase migration `229_liturgical_calendar_operations.sql`.
2. Apply AWS migration `077_reference_medallion_foundation.sql`.
3. Apply AWS migration `079_rds_weather_bronze.sql`.
4. Enable weather Bronze.
5. With explicit data-operation approval, backfill and reconcile shadow
   `reference_silver` tables.
6. Switch Silver readers/writers and Gold refresh functions.
7. Enable the Supabase calendar operations workflow and approval synchronizer.
8. Retire legacy objects only after a separate retention decision.

`REFERENCE_SILVER_SCHEMA=reference_silver` is now the active local target.
