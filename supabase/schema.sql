-- =============================================================================
-- Diocese of San Pablo — Financial Analytics System
-- Supabase / PostgreSQL Schema  (v2)
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run: all statements use IF NOT EXISTS / DO NOTHING guards.
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. USER PROFILES
--    Extends Supabase auth.users with diocese-specific metadata.
--    Automatically populated by the trigger below on first sign-in.
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  role            TEXT        NOT NULL DEFAULT 'parish_priest'
    CHECK (role IN (
      'bishop', 'diocese_admin',
      'parish_priest', 'parish_secretary',
      'seminary_rector', 'school_registrar'
    )),
  entity_id       TEXT,
  entity_name     TEXT,
  entity_type     TEXT
    CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese') OR entity_type IS NULL),
  display_name    TEXT,
  first_name      TEXT,
  last_name       TEXT,
  contact_number  TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user signs up or is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, entity_id, entity_name, entity_type, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'parish_priest'),
    NEW.raw_user_meta_data->>'entityId',
    NEW.raw_user_meta_data->>'entityName',
    NEW.raw_user_meta_data->>'entityType',
    COALESCE(NEW.raw_user_meta_data->>'displayName', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email        = EXCLUDED.email,
    role         = COALESCE(EXCLUDED.role, profiles.role),
    entity_id    = COALESCE(EXCLUDED.entity_id, profiles.entity_id),
    entity_name  = COALESCE(EXCLUDED.entity_name, profiles.entity_name),
    entity_type  = COALESCE(EXCLUDED.entity_type, profiles.entity_type),
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    updated_at   = NOW();
  RETURN NEW;
END;
$$;

-- Attach the trigger (drop first to make this re-runnable)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 2. FINANCIAL RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS financial_records (
  id                                      TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  month                                   TEXT        NOT NULL,
  year                                    INTEGER,          -- ← required for time-travel / Digital Twin
  collections                             NUMERIC     NOT NULL DEFAULT 0,
  consumable_collections                  NUMERIC     NOT NULL DEFAULT 0,
  disbursements                           NUMERIC     NOT NULL DEFAULT 0,
  net_receipts                            NUMERIC,
  sacraments_rate                         NUMERIC,
  sacraments_arancel                      NUMERIC,
  sacraments_parish_share                 NUMERIC,
  sacraments_over_above                   NUMERIC,
  collections_mass                        NUMERIC,
  collections_other                       NUMERIC,
  collections_other_receipts              NUMERIC,
  expenses_pastoral                       NUMERIC,
  expenses_parish                         NUMERIC,
  others_mass_intentions_not_claimed      NUMERIC,
  others_mass_intentions_claimed          NUMERIC,
  others_special_collections              NUMERIC,
  pastoral_parish_fund_total_net_receipts NUMERIC,
  entity_id                               TEXT        NOT NULL,
  entity_type                             TEXT        NOT NULL
    CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese')),
  entity_class                            TEXT
    CHECK (entity_class IN ('Class A', 'Class B', 'Class C', 'Class D', 'Class E')),
  record_timestamp                        BIGINT,
  created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add year column if this is being run as an upgrade on an existing table
ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS year INTEGER;

CREATE INDEX IF NOT EXISTS idx_financial_records_entity
  ON financial_records (entity_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_financial_records_period
  ON financial_records (entity_id, year, month);

-- =============================================================================
-- 3. PROJECTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                 TEXT        NOT NULL,
  description          TEXT,
  fund_usage           TEXT,
  target_amount        NUMERIC     NOT NULL DEFAULT 0,
  current_amount       NUMERIC     NOT NULL DEFAULT 0,
  start_date           TEXT,
  end_date             TEXT,
  category             TEXT,
  status               TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'on-hold')),
  beneficiaries        TEXT,
  cover_image          TEXT,
  contact_person       TEXT,
  health_score         NUMERIC     DEFAULT 0,
  success_probability  NUMERIC     DEFAULT 0,
  recommendation       TEXT,
  total_expenses       NUMERIC     DEFAULT 0,
  entity_id            TEXT        NOT NULL,
  entity_type          TEXT        NOT NULL
    CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_entity
  ON projects (entity_id, entity_type);

-- =============================================================================
-- 4. DONATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS donations (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id          TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  donor_name          TEXT,
  amount              NUMERIC     NOT NULL DEFAULT 0,
  date                TEXT,
  payment_method      TEXT
    CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer')),
  receipt_issued      BOOLEAN     DEFAULT false,
  receipt_proof_name  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donations_project
  ON donations (project_id);

-- =============================================================================
-- 5. PROJECT EXPENSES
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_expenses (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id          TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description         TEXT        NOT NULL,
  amount              NUMERIC     NOT NULL DEFAULT 0,
  date                TEXT,
  payment_method      TEXT
    CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer')),
  notes               TEXT,
  receipt_reference   TEXT,
  proof_file_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_project
  ON project_expenses (project_id);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses   ENABLE ROW LEVEL SECURITY;

-- Profiles: each user can read their own; service-role can read all
DROP POLICY IF EXISTS "users_read_own_profile"   ON profiles;
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Financial records: any authenticated user can read (bishop/admin diocese-wide)
DROP POLICY IF EXISTS "authenticated_read_financial"  ON financial_records;
CREATE POLICY "authenticated_read_financial"
  ON financial_records FOR SELECT TO authenticated
  USING (true);

-- Projects / donations / expenses: any authenticated user can read
DROP POLICY IF EXISTS "authenticated_read_projects"   ON projects;
CREATE POLICY "authenticated_read_projects"
  ON projects FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_donations"  ON donations;
CREATE POLICY "authenticated_read_donations"
  ON donations FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_expenses"   ON project_expenses;
CREATE POLICY "authenticated_read_expenses"
  ON project_expenses FOR SELECT TO authenticated
  USING (true);

-- Write operations go through the service-role key (bypasses RLS automatically).
-- To allow authenticated users to also write, uncomment:
--
-- CREATE POLICY "authenticated_write_financial"
--   ON financial_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "authenticated_write_projects"
--   ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Done.
-- Next: create users in Supabase Dashboard → Authentication → Users
-- See: supabase/seed-users.md for the recommended test accounts.
-- =============================================================================
