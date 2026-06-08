-- Priest health records for the Executive Health Tracker (was localStorage-only)
CREATE TABLE IF NOT EXISTS diocese.priest_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid,
  name text NOT NULL,
  position text NOT NULL DEFAULT '',
  parish text NOT NULL DEFAULT '',
  birth_date date,
  last_checkup date,
  health_status text NOT NULL DEFAULT 'good'
    CHECK (health_status IN ('good', 'fair', 'needs-attention')),
  notes text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  document_name text NOT NULL DEFAULT '',
  document_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Add columns if table already exists (safe to re-run)
ALTER TABLE diocese.priest_health_records
  ADD COLUMN IF NOT EXISTS document_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_url  text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_priest_health_records_user
  ON diocese.priest_health_records (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_priest_health_records_active
  ON diocese.priest_health_records (deleted_at) WHERE deleted_at IS NULL;

-- Grants: diocese schema requires explicit grants unlike public schema
GRANT ALL PRIVILEGES ON diocese.priest_health_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON diocese.priest_health_records TO authenticated;
GRANT SELECT ON diocese.priest_health_records TO anon;
