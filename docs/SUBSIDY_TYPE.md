# Subsidy Type Field

Tracks whether a parish, seminary, or school is "Subsidized" or "Independent". Consolidated from three overlapping implementation-note files (`IMPLEMENTATION_SUMMARY.md`, `SUBSIDY_TYPE_NEXT_STEPS.md`, `SUBSIDY_TYPE_SETUP.md`) that documented the same already-shipped feature.

## Architecture

**Frontend** — `src/frontend/src/components/settings/EntityManagementControl.tsx`
- Edit modal has a "Subsidy Type" dropdown; form state collects `subsidyType`, converted to snake_case `subsidy_type` before it's sent to the backend.

**Backend flow**
1. Next.js proxy route (`src/frontend/app/api/admin/entities/route.ts`) forwards to the backend `/admin/entities` endpoint.
2. `entity.controller.ts` (`createAdminEntity` / `updateAdminEntity`) extracts `type`/`id`, passes the rest to the service.
3. `entity.service.ts`:
   - `legacyPayloadFor` preserves snake_case `subsidy_type` for the detail tables (parishes/seminaries/schools).
   - `syncInstitutionFields` additionally syncs `subsidy_type` into the centralized `diocese.institutions` table (by ID and by name + institution_type).
   - The response is normalized back to camelCase `subsidyType` for the frontend.

Data ends up in two places: the entity's own `<schema>.details.subsidy_type` and the centralized `diocese.institutions.subsidy_type`.

## Database schema

Migrations `supabase/portable_migrations/179_add_subsidy_type_entity_tables.sql` and `180_add_subsidy_type_to_institutions.sql`:

```sql
-- parishes.details, seminaries.details, schools.details
ALTER TABLE [schema].details
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized'
  CHECK (subsidy_type IN ('subsidized', 'independent'));
CREATE INDEX IF NOT EXISTS idx_[schema]_details_subsidy_type ON [schema].details(subsidy_type);

-- diocese.institutions
ALTER TABLE diocese.institutions
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized'
  CHECK (subsidy_type IN ('subsidized', 'independent'));
CREATE INDEX IF NOT EXISTS idx_institutions_subsidy_type ON diocese.institutions(subsidy_type);
```

Check whether the migrations are applied:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'parishes' AND table_name = 'details' AND column_name = 'subsidy_type';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'diocese' AND table_name = 'institutions' AND column_name = 'subsidy_type';
```

## Manual test

1. Settings → Entity Management → Parishes → edit an existing parish.
2. Change "Subsidy Type" to "Independent", save, confirm the success message.
3. Re-open the same parish and confirm the value persisted.
4. Optionally verify in the database:
   ```sql
   SELECT institution_id, subsidy_type FROM parishes.details WHERE institution_id = '<id>';
   SELECT id, name, subsidy_type FROM diocese.institutions WHERE institution_type = 'parish' AND id = '<id>';
   ```

`test-subsidy-type.js` at the repo root is the automated verification script for this feature (`node test-subsidy-type.js`).

## Fallback behavior

If the migrations haven't been applied yet, the UI and backend still function, but the column-missing write fails and the system falls back to reporting an offline/local-only save; once the migrations are applied, the next update persists normally.

## Troubleshooting

| Issue | Check | Fix |
|---|---|---|
| "Column subsidy_type does not exist" | Migrations 179/180 applied? | Run both migrations |
| Dropdown doesn't appear | Frontend build stale | `npm run dev:frontend` |
| Changes not saved | Backend logs around `[updateAdminEntity]` | Verify migrations applied, check for API errors |
| Only "Subsidized" shows | Page cached | Hard refresh (Ctrl+Shift+R) |
| Permission/RLS error | Service-role key access | Verify admin service-role key permissions |

## Possible future enhancements

- Include `subsidy_type` in financial reports/analytics and institution classification logic.
- Add subsidy-type filtering to entity lists and data export.
