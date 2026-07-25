# Parish Bronze Pipeline: Phase 3 Pilot Automation

## Implemented Runtime

Phase 3 runs as a background task in the existing FastAPI analytics service.
It polls Supabase every 30 seconds and is restricted to the explicit
`WAREHOUSE_PILOT_INSTITUTION_IDS` allowlist.

The current allowlist contains only Blessed Sacrament Parish:

`aec32176-c296-4928-880f-180985f9a376`

This local pilot runtime was selected because the workstation has no AWS CLI
credentials or deployment profile. The worker code is cloud-neutral, but
Lambda/EventBridge deployment remains pending until AWS deployment access is
available.

## Safety Behavior

- The first poll initializes at the current Supabase source tip and does not
  backfill older years.
- Only changes after the stored watermark are processed automatically.
- Each changed financial record is fetched with its complete line-item
  snapshot and dependencies.
- Target line items for that record are replaced while AWS business triggers
  are disabled, then reconciled before the watermark advances.
- Failed records do not advance the watermark and are written to
  `warehouse_control.etl_failures` for retry on the next poll.
- Success resolves prior open failures for the same source record.
- Silver and gold tables are not refreshed.
- Supabase is read-only to this polling worker.

## Configuration

```dotenv
WAREHOUSE_PILOT_SYNC_ENABLED=true
WAREHOUSE_PILOT_INSTITUTION_IDS=aec32176-c296-4928-880f-180985f9a376
WAREHOUSE_PILOT_POLL_SECONDS=30
```

The pilot is disabled by setting `WAREHOUSE_PILOT_SYNC_ENABLED=false` and
restarting FastAPI.

## Commands

Force one idempotent record sync for testing:

```powershell
cd src/analytics
python -m app.services.warehouse_worker --record-id <financial-record-uuid>
```

Poll the allowlist once:

```powershell
python -m app.services.warehouse_worker --once
```

Run the automatic worker with FastAPI:

```powershell
python -m uvicorn main:app --port 8000
```

Worker status is available at:

`GET http://127.0.0.1:8000/warehouse/pilot-status`

## Verification Result

- One existing pilot record was force-synced through the incremental path.
- The record contained 24 line items and produced 39 passed reconciliation
  checks with no open failures.
- The worker watermark initialized at the source tip without loading the other
  reporting years.
- A full idle polling interval left bronze at 12 records and 367 line items.
- Parish monthly and breakdown gold facts remained empty.

## Remaining Production Work

FastAPI must be running for this pilot worker to poll. A production deployment
should move the same `run_once` entrypoint to AWS Lambda, add EventBridge
one-minute recovery scheduling, and use AWS-managed secrets and networking.
