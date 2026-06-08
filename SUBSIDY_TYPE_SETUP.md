# Subsidy Type Field Implementation - Complete Guide

## Overview
The subsidy type field has been fully implemented to track whether a parish, seminary, or school is "Subsidized" or "Independent". This document outlines the complete implementation and how to verify it's working.

## Architecture

### Frontend (Edit Modal)
- **File**: `src/frontend/src/components/settings/EntityManagementControl.tsx`
- **Implementation**: Lines 406, 894, 997, 1009, 1024
- Collects `subsidyType` from the form dropdown
- Converts to snake_case `subsidy_type` when sending to backend

### Backend Flow

#### 1. API Route (Next.js Proxy)
- **File**: `src/frontend/app/api/admin/entities/route.ts`
- Routes POST/PATCH requests to backend `/admin/entities` endpoint

#### 2. Entity Controller
- **File**: `src/backend/src/controllers/entity.controller.ts`
- Lines 93-102: `createAdminEntity` handler
- Lines 104-118: `updateAdminEntity` handler
- Extracts `type` and `id` from request, passes remaining data to service

#### 3. Entity Service
- **File**: `src/backend/src/services/entity.service.ts`

#### Key Methods:

**syncInstitutionFields** (Lines 126-174)
- Syncs entity data to the centralized `diocese.institutions` table
- Handles subsidy_type conversion at lines 127 and 139
- Updates both by ID and by name + institution_type

**legacyPayloadFor** (Lines 176-192)
- Prepares data for the detail tables (parishes, seminaries, schools)
- Removes camelCase `subsidyType`, keeps snake_case `subsidy_type`
- Preserves `subsidy_type` for storage in detail tables (per line 181 comment)

**createAdminEntity** (Lines 194-224)
- Inserts into detail table with subsidy_type
- Calls syncInstitutionFields to also update diocese.institutions

**updateAdminEntity** (Lines 226-268)
- Updates detail table with subsidy_type
- Calls syncInstitutionFields to also update diocese.institutions
- Includes logging for debugging (lines 248-249)

### Database Schema

#### Migrations Required (in order):
1. **Migration 179**: `portable_migrations/179_add_subsidy_type_entity_tables.sql`
   - Adds `subsidy_type` column to:
     - `parishes.details`
     - `seminaries.details`
     - `schools.details`

2. **Migration 180**: `portable_migrations/180_add_subsidy_type_to_institutions.sql`
   - Adds `subsidy_type` column to `diocese.institutions`

#### Table Structure:
```sql
-- parishes.details, seminaries.details, schools.details
ALTER TABLE [schema].details
ADD COLUMN subsidy_type TEXT DEFAULT 'subsidized' 
  CHECK (subsidy_type IN ('subsidized', 'independent'));

-- diocese.institutions
ALTER TABLE diocese.institutions
ADD COLUMN subsidy_type TEXT DEFAULT 'subsidized' 
  CHECK (subsidy_type IN ('subsidized', 'independent'));
```

## Data Flow - When User Updates a Parish

1. **Frontend**: User selects "Independent" in the "Subsidy Type" dropdown
   - Form state: `subsidyType: 'independent'`

2. **API Call**: PATCH request to `/api/admin/entities?type=parish&id=<id>`
   ```json
   {
     "name": "Christ the King Parish",
     "vicariate": "Holy Family",
     "class": "A",
     "address": "...",
     "lat": 14.1686,
     "lng": 121.3253,
     "district": "District I",
     "subsidy_type": "independent",  // ← Converted to snake_case
     "status": "active"
   }
   ```

3. **Backend Processing**:
   ```
   Controller receives request
   ↓
   EntityService.updateAdminEntity('parish', id, updates)
   ↓
   Create legacyPayload (removes subsidyType, keeps subsidy_type)
   ↓
   Update parishes detail table with subsidy_type
   ↓
   Call syncInstitutionFields
   ↓
   Update diocese.institutions table with subsidy_type
   ↓
   Return normalized response with subsidyType (camelCase)
   ```

4. **Database Updates**:
   - `parishes.details.subsidy_type` = 'independent'
   - `diocese.institutions.subsidy_type` = 'independent' (via sync)
   - Both tables updated atomically in same transaction

5. **Response**: Normalized with `subsidyType` camelCase for frontend

## Verification Checklist

### ✅ Code Implementation
- [x] Frontend UI has subsidy type dropdown
- [x] Frontend converts subsidyType → subsidy_type in payload
- [x] Backend controller passes updates to service
- [x] Entity service includes syncInstitutionFields call
- [x] legacyPayloadFor preserves subsidy_type for detail tables
- [x] Response normalization handles both table sources

### 📋 Database Requirements

#### Check if migrations are applied:
```sql
-- Check if subsidy_type exists in parishes.details
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'parishes' AND table_name = 'details' 
AND column_name = 'subsidy_type';

-- Check if subsidy_type exists in diocese.institutions
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'diocese' AND table_name = 'institutions' 
AND column_name = 'subsidy_type';
```

#### Apply migrations if needed:
```bash
# Using Supabase Dashboard
# 1. Go to SQL Editor
# 2. Run: supabase/portable_migrations/179_add_subsidy_type_entity_tables.sql
# 3. Run: supabase/portable_migrations/180_add_subsidy_type_to_institutions.sql

# Or via CLI:
supabase migration up --linked
```

## Testing the Implementation

### Manual Test Steps:
1. Open Entity Management Control (Admin Settings)
2. Click Edit on an existing parish
3. Change the "Subsidy Type" dropdown to "Independent"
4. Click "Update"
5. Verify success message appears
6. Refresh the page
7. Edit the same parish again and confirm the subsidy type was saved

### Backend Logging:
The service includes console logs at `entity.service.ts:248-249`:
```
[updateAdminEntity] type: parish
[updateAdminEntity] legacyPayload: { ... subsidy_type: 'independent' ... }
```

Check your backend logs to confirm the subsidy_type is in the payload.

### Database Verification:
```sql
-- Verify data in parishes.details
SELECT institution_id, subsidy_type FROM parishes.details 
WHERE institution_id = '<id>';

-- Verify data in diocese.institutions
SELECT id, name, subsidy_type FROM diocese.institutions 
WHERE institution_type = 'parish' AND name = 'Christ the King Parish';
```

## Fallback Behavior

If migrations haven't been applied, the system gracefully degrades:
- Frontend still shows the UI dropdown
- Backend still processes the data
- If the column doesn't exist:
  - INSERT/UPDATE may fail
  - Fallback: `offline mode` response indicates data saved to local state
  - Once migrations are applied, next sync will persist to database

## Future Enhancements

1. **Add subsidy type to queries**: Update `getGeoInstitutions()` to select subsidy_type
2. **Add subsidy type to analytics**: Include in financial profiles filtering/analysis
3. **Subsidy-based classification**: Use subsidy type for institution classification logic
4. **Reporting**: Generate reports filtered by subsidy type

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Subsidy Type not saving | Backend logs for errors | Apply migrations 179 & 180 |
| Type not persisting after refresh | Database column exists | Verify migrations applied |
| API returns 500 error | Backend logs | Check syncInstitutionFields logic |
| Permission denied error | RLS policies | Verify admin service-role key access |

## Related Files

- Entity management UI: `src/frontend/src/components/settings/EntityManagementControl.tsx`
- Backend service: `src/backend/src/services/entity.service.ts`
- Controller: `src/backend/src/controllers/entity.controller.ts`
- API gateway: `src/backend/src/apps/api-gateway/controllers/entity-gateway.controller.ts`
- Migration 179: `supabase/portable_migrations/179_add_subsidy_type_entity_tables.sql`
- Migration 180: `supabase/portable_migrations/180_add_subsidy_type_to_institutions.sql`
