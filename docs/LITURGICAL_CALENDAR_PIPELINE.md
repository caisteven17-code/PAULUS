# Liturgical Calendar Pipeline

This pipeline follows the same service-file pattern as the weather pipeline.

## Files

- `src/analytics/app/services/liturgical_calendar_collector.py` - bulk extraction and source comparison.
- `src/analytics/app/services/liturgical_calendar_updater.py` - scheduled yearly/quarterly refresh logic.
- `src/analytics/app/services/liturgical_calendar_loader.py` - loads JSON output into Supabase.
- `src/analytics/app/services/liturgical_romcal_helper.mjs` - Node helper for the Romcal Philippines package.

## Source Roles

- Romcal Philippines is the primary structured extraction source.
- LitCal API is wired as a secondary source, but currently reports PH as unsupported on the JSON API route.
- GCatholic Philippines is the validator source only. It is not loaded as its own calendar row.
- Human review is still required for rows marked `pending`.

## Review Status

- `pending` - newly extracted Romcal/LitCal row waiting for human review. This is used even when sources match.
- `approved` - human reviewer accepted the row.
- `approved_with_revisions` - human reviewer edited the row and accepted it.
- `rejected` - human reviewer decided the row should not be used.

## Manual Commands

Run initial collection from 2023 to the current year:

```powershell
npm run calendar:collect -- --start-year 2023 --end-year 2026
```

Run scheduled-style refresh manually:

```powershell
npm run calendar:update -- --force
```

Load generated matched-candidate rows into Supabase. These rows are from the primary sources only; GCatholic details are stored in `review_notes` and `revision_payload`.

```powershell
npm run calendar:load
```

Collect and load in one command. Use `--load-review` if you also want mismatch/missing-validator rows inserted for review:

```powershell
npm run calendar:collect -- --start-year 2023 --end-year 2026 --load
```

## Automation

GitHub Actions workflow:

```text
.github/workflows/liturgical-calendar-refresh.yml
```

Schedules:

- 2nd week of November: preload next year's Philippine calendar.
- Quarterly refresh: re-check Philippine context changes.

Required GitHub secrets:

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
