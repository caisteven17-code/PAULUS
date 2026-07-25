# Parish Pipeline Phase 6 Monitoring and Recovery

## Runtime Health

The analytics API exposes a read-only operational summary at:

```text
GET http://127.0.0.1:8000/warehouse/health
```

Possible states:

- `healthy`: fresh worker heartbeat, no queued retries, dead letters, or alerts.
- `degraded`: stale heartbeat, pending retries, or warning alerts.
- `unhealthy`: a dead-letter record or critical alert requires intervention.

The response contains operational counts and latest-run metadata only. It does
not expose parish financial rows or amounts.

## Retry Behavior

When an incremental Supabase-to-Silver-to-Gold operation fails, the worker:

1. records the source record in `warehouse_control.etl_retry_queue`;
2. opens or refreshes an operational warning in `warehouse_control.etl_alerts`;
3. advances the source watermark so unrelated records can continue;
4. retries the current source snapshot with exponential backoff; and
5. promotes the retry to `dead_letter` with a critical alert after five attempts.

Because retries fetch the current source snapshot by record ID, an older queued
event cannot overwrite a newer source version.

## Manual Retry

After correcting the underlying issue, queue one source record immediately:

```powershell
cd "C:\Users\user\Downloads\NEWEST TO THE NEW CAPSTONE\PAULUS\src\analytics"
python -m app.services.warehouse_monitor retry --record-id <SOURCE_RECORD_UUID>
```

The background worker claims it on the next poll. Use the health endpoint to
confirm that pending retries and alerts return to zero.

## CLI Health and Cleanup

```powershell
python -m app.services.warehouse_monitor health
python -m app.services.warehouse_monitor cleanup
```

The worker also runs cleanup at most once per day. Successful ETL history and
resolved retry entries are retained for 30 days; failed/partial runs and resolved
alerts are retained for 180 days. Open alerts and active retries are never removed
by retention cleanup.

## Configuration

Optional environment overrides:

```env
WAREHOUSE_RETRY_MAX_ATTEMPTS=5
WAREHOUSE_RETRY_BASE_SECONDS=30
WAREHOUSE_RETRY_BATCH_SIZE=20
WAREHOUSE_WATERMARK_STALE_SECONDS=180
WAREHOUSE_ETL_SUCCESS_RETENTION_DAYS=30
WAREHOUSE_ETL_FAILURE_RETENTION_DAYS=180
```

## Acceptance Result

The Phase 6 acceptance test queued one current source record, claimed it, and
completed its Silver and Gold refresh successfully on the first retry. No retry
was rescheduled or sent to dead letter. After service restart, the health endpoint
reported a fresh heartbeat with zero pending retries, dead letters, and open
alerts.
