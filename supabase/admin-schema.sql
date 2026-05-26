-- =============================================================================
-- Diocese of San Pablo — Administrative Tables  (v1)
--
-- Run AFTER schema.sql (profiles, financial_records, projects must exist first).
-- Paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

-- =============================================================================
-- 1. PARISHES
-- =============================================================================
CREATE TABLE IF NOT EXISTS parishes (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name             TEXT        NOT NULL,
  vicariate        TEXT        NOT NULL,
  district         TEXT,
  class            TEXT        NOT NULL DEFAULT 'Class C'
    CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  pastor           TEXT        NOT NULL DEFAULT 'Not assigned',
  address          TEXT        NOT NULL DEFAULT '',
  contact_number   TEXT        NOT NULL DEFAULT '',
  email            TEXT        NOT NULL DEFAULT '',
  primary_patron   TEXT,
  secondary_patron TEXT,
  fiesta_date      TEXT,
  lat              NUMERIC,
  lng              NUMERIC,
  status           TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parishes_vicariate ON parishes (vicariate);
CREATE INDEX IF NOT EXISTS idx_parishes_class     ON parishes (class);

-- =============================================================================
-- 2. SEMINARIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS seminaries (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         TEXT        NOT NULL,
  vicariate    TEXT        NOT NULL,
  district     TEXT,
  class        TEXT        NOT NULL DEFAULT 'Class C'
    CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  rector       TEXT        NOT NULL DEFAULT 'Not assigned',
  address      TEXT        NOT NULL DEFAULT '',
  enrollment   INTEGER     NOT NULL DEFAULT 0,
  capacity     INTEGER     NOT NULL DEFAULT 0,
  staff        INTEGER     NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. DIOCESAN SCHOOLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS diocesan_schools (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         TEXT        NOT NULL,
  vicariate    TEXT        NOT NULL,
  district     TEXT,
  class        TEXT        NOT NULL DEFAULT 'Class C'
    CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  principal    TEXT        NOT NULL DEFAULT 'Not assigned',
  address      TEXT        NOT NULL DEFAULT '',
  level        TEXT        NOT NULL DEFAULT 'K-12',
  enrollment   INTEGER     NOT NULL DEFAULT 0,
  capacity     INTEGER     NOT NULL DEFAULT 0,
  staff        INTEGER     NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. ANNOUNCEMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  author       TEXT        NOT NULL,
  author_role  TEXT        NOT NULL DEFAULT 'admin',
  priority     TEXT        NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high')),
  category     TEXT        NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','financial','administrative','event')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements (priority);
CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements (category);
CREATE INDEX IF NOT EXISTS idx_announcements_created  ON announcements (created_at DESC);

-- =============================================================================
-- 5. AUDIT LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_name   TEXT        NOT NULL,
  user_role   TEXT        NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  category    TEXT        NOT NULL
    CHECK (category IN ('auth','finance','analytics','reports','system','access')),
  severity    TEXT        NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','error','success')),
  action      TEXT        NOT NULL,
  detail      TEXT        NOT NULL,
  entity      TEXT,
  ip_address  TEXT        NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs (category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs (created_at DESC);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE parishes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diocesan_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read entities, announcements, audit logs
DROP POLICY IF EXISTS "auth_read_parishes"        ON parishes;
CREATE POLICY "auth_read_parishes"        ON parishes       FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_read_seminaries"      ON seminaries;
CREATE POLICY "auth_read_seminaries"      ON seminaries     FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_read_schools"         ON diocesan_schools;
CREATE POLICY "auth_read_schools"         ON diocesan_schools FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_read_announcements"   ON announcements;
CREATE POLICY "auth_read_announcements"   ON announcements  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_read_audit_logs"      ON audit_logs;
CREATE POLICY "auth_read_audit_logs"      ON audit_logs     FOR SELECT TO authenticated USING (true);

-- Writes go through service-role key (bypasses RLS).
-- Done. Run seed-entities.sql next to populate parishes, seminaries, and schools.
