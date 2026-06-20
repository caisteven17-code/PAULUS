-- Migration 193: Expand audit_logs category constraint to 10 values.
-- Old categories: auth | finance | analytics | reports | system | access
-- New categories: auth | users | projects | finance | data | events | announcements | calendar | analytics | system
--
-- Also migrates existing rows so old data stays consistent:
--   'access'  → 'users'
--   'reports' → 'system'
--   rows with entity='event'        and category='system' → 'events'
--   rows with entity='announcement' and category='system' → 'announcements'

-- Step 1: Drop old constraint
ALTER TABLE diocese.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_category_check;

-- Step 2: Migrate existing data
UPDATE diocese.audit_logs SET category = 'announcements' WHERE category = 'system' AND entity = 'announcement';
UPDATE diocese.audit_logs SET category = 'events'        WHERE category = 'system' AND entity = 'event';
UPDATE diocese.audit_logs SET category = 'users'         WHERE category = 'access';
UPDATE diocese.audit_logs SET category = 'system'        WHERE category = 'reports';

-- Step 3: Add updated constraint
ALTER TABLE diocese.audit_logs
  ADD CONSTRAINT audit_logs_category_check
  CHECK (category IN (
    'auth',
    'users',
    'projects',
    'finance',
    'data',
    'events',
    'announcements',
    'calendar',
    'analytics',
    'system'
  ));

-- Step 4: Add index for category+severity combined queries (analytics panel)
CREATE INDEX IF NOT EXISTS idx_audit_logs_cat_sev ON diocese.audit_logs (category, severity);
