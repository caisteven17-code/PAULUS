-- =============================================================================
-- Diocese of San Pablo — Consolidated Database DDL (v4.0)
-- 
-- Domain-Partitioned Multi-Schema Database Architecture
-- Bridges operational (OLTP) transactions with analytical (OLAP) data models.
-- 
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run: uses IF NOT EXISTS guards and drops triggers before recreation.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 0. SCHEMA CREATION
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS diocese;
CREATE SCHEMA IF NOT EXISTS parishes;
CREATE SCHEMA IF NOT EXISTS schools;
CREATE SCHEMA IF NOT EXISTS seminaries;
CREATE SCHEMA IF NOT EXISTS analytics;

-- HELPER: Sequence DDL format generator securely
CREATE OR REPLACE FUNCTION public.format_seq_id(prefix TEXT, seq_name TEXT, min_digits INT DEFAULT 5)
RETURNS TEXT AS $$
DECLARE
  val BIGINT;
BEGIN
  val := nextval(seq_name);
  RETURN prefix || lpad(val::text, GREATEST(min_digits, length(val::text))::int, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- =============================================================================
-- 1. DIOCESE SCHEMA (SHARED ADMINISTRATIVE CORE & RBAC)
-- =============================================================================

-- Roles table inside diocese schema
CREATE TABLE IF NOT EXISTS diocese.roles (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  color           TEXT        NOT NULL DEFAULT '#D4AF37',
  is_predefined   BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permissions table inside diocese schema
CREATE TABLE IF NOT EXISTS diocese.permissions (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  description     TEXT,
  category        TEXT        NOT NULL
);

-- Role-Permissions Join table inside diocese schema
CREATE TABLE IF NOT EXISTS diocese.role_permissions (
  role_id         TEXT        REFERENCES diocese.roles(id) ON DELETE CASCADE,
  permission_id   TEXT        REFERENCES diocese.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Profiles table inside diocese schema, referencing diocese.roles
CREATE TABLE IF NOT EXISTS diocese.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  role            TEXT        NOT NULL REFERENCES diocese.roles(id) ON UPDATE CASCADE,
  access_role     TEXT,
  entity_id       TEXT,
  entity_name     TEXT,
  entity_type     TEXT        CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese') OR entity_type IS NULL),
  display_name    TEXT,
  first_name      TEXT,
  last_name       TEXT,
  contact_number  TEXT,
  status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to automatically populate profile row upon Supabase Auth User registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  INSERT INTO diocese.profiles (id, email, role, entity_id, entity_name, entity_type, display_name)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects table inside diocese schema
CREATE SEQUENCE IF NOT EXISTS diocese.projects_id_seq START 1;

CREATE TABLE IF NOT EXISTS diocese.projects (
  id                   TEXT        PRIMARY KEY DEFAULT public.format_seq_id('PRJ-', 'diocese.projects_id_seq', 3),
  name                 TEXT        NOT NULL,
  description          TEXT,
  fund_usage           TEXT,
  target_amount        NUMERIC     NOT NULL DEFAULT 0,
  current_amount       NUMERIC     NOT NULL DEFAULT 0,
  start_date           TEXT,
  end_date             TEXT,
  category             TEXT,
  status               TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on-hold')),
  beneficiaries        TEXT,
  cover_image          TEXT,
  contact_person       TEXT,
  health_score         NUMERIC     DEFAULT 0,
  success_probability  NUMERIC     DEFAULT 0,
  recommendation       TEXT,
  total_expenses       NUMERIC     DEFAULT 0,
  entity_id            TEXT        NOT NULL,
  entity_type          TEXT        NOT NULL CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Donations table inside diocese schema
CREATE SEQUENCE IF NOT EXISTS diocese.donations_id_seq START 1;

CREATE TABLE IF NOT EXISTS diocese.donations (
  id                  TEXT        PRIMARY KEY DEFAULT public.format_seq_id('DON-', 'diocese.donations_id_seq', 5),
  project_id          TEXT        NOT NULL REFERENCES diocese.projects(id) ON DELETE CASCADE,
  donor_name          TEXT,
  amount              NUMERIC     NOT NULL DEFAULT 0,
  date                TEXT,
  payment_method      TEXT        CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer')),
  receipt_issued      BOOLEAN     DEFAULT false,
  receipt_proof_name  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project Expenses table inside diocese schema
CREATE SEQUENCE IF NOT EXISTS diocese.project_expenses_id_seq START 1;

CREATE TABLE IF NOT EXISTS diocese.project_expenses (
  id                  TEXT        PRIMARY KEY DEFAULT public.format_seq_id('EXP-', 'diocese.project_expenses_id_seq', 5),
  project_id          TEXT        NOT NULL REFERENCES diocese.projects(id) ON DELETE CASCADE,
  description         TEXT        NOT NULL,
  amount              NUMERIC     NOT NULL DEFAULT 0,
  date                TEXT,
  payment_method      TEXT        CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer')),
  notes               TEXT,
  receipt_reference   TEXT,
  proof_file_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Announcements table inside diocese schema
CREATE SEQUENCE IF NOT EXISTS diocese.announcements_id_seq START 1;

CREATE TABLE IF NOT EXISTS diocese.announcements (
  id           TEXT        PRIMARY KEY DEFAULT public.format_seq_id('ANC-', 'diocese.announcements_id_seq', 3),
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  author       TEXT        NOT NULL,
  author_role  TEXT        NOT NULL DEFAULT 'admin',
  priority     TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  category     TEXT        NOT NULL DEFAULT 'general' CHECK (category IN ('general','financial','administrative','event')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs table inside diocese schema
CREATE SEQUENCE IF NOT EXISTS diocese.audit_logs_id_seq START 1;

CREATE TABLE IF NOT EXISTS diocese.audit_logs (
  id          TEXT        PRIMARY KEY DEFAULT public.format_seq_id('LOG-', 'diocese.audit_logs_id_seq', 5),
  user_name   TEXT        NOT NULL,
  user_role   TEXT        NOT NULL,
  user_id     UUID        REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  category    TEXT        NOT NULL CHECK (category IN ('auth','finance','analytics','reports','system','access')),
  severity    TEXT        NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  action      TEXT        NOT NULL,
  detail      TEXT        NOT NULL,
  entity      TEXT,
  ip_address  TEXT        NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- B. PARISHES SCHEMA (PARISH OPERATIONAL DOMAIN)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS parishes.parishes_id_seq START 1;

CREATE TABLE IF NOT EXISTS parishes.details (
  id               TEXT        PRIMARY KEY DEFAULT public.format_seq_id('PAR-', 'parishes.parishes_id_seq', 3),
  name             TEXT        NOT NULL,
  vicariate        TEXT        NOT NULL,
  district         TEXT,
  class            TEXT        NOT NULL DEFAULT 'Class C' CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  pastor           TEXT        NOT NULL DEFAULT 'Not assigned',
  address          TEXT        NOT NULL DEFAULT '',
  contact_number   TEXT        NOT NULL DEFAULT '',
  email            TEXT        NOT NULL DEFAULT '',
  primary_patron   TEXT,
  secondary_patron TEXT,
  fiesta_date      TEXT,
  lat              NUMERIC,
  lng              NUMERIC,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS parishes.financial_records_id_seq START 1;

CREATE TABLE IF NOT EXISTS parishes.financial_records (
  id                                      TEXT        PRIMARY KEY DEFAULT public.format_seq_id('FIN-', 'parishes.financial_records_id_seq', 6),
  parish_id                               TEXT        NOT NULL REFERENCES parishes.details(id) ON DELETE CASCADE,
  month                                   TEXT        NOT NULL,
  year                                    INTEGER     NOT NULL,
  collections                             NUMERIC     NOT NULL DEFAULT 0,
  consumable_collections                  NUMERIC     NOT NULL DEFAULT 0,
  disbursements                           NUMERIC     NOT NULL DEFAULT 0,
  sacraments_rate                         NUMERIC     DEFAULT 0,
  sacraments_arancel                      NUMERIC     DEFAULT 0,
  sacraments_parish_share                 NUMERIC     DEFAULT 0,
  sacraments_over_above                   NUMERIC     DEFAULT 0,
  collections_mass                        NUMERIC     DEFAULT 0,
  collections_other                       NUMERIC     DEFAULT 0,
  collections_other_receipts              NUMERIC     DEFAULT 0,
  expenses_pastoral                       NUMERIC     DEFAULT 0,
  expenses_parish                         NUMERIC     DEFAULT 0,
  others_mass_intentions_not_claimed      NUMERIC     DEFAULT 0,
  others_mass_intentions_claimed          NUMERIC     DEFAULT 0,
  others_special_collections              NUMERIC     DEFAULT 0,
  pastoral_parish_fund_total_net_receipts NUMERIC     DEFAULT 0,
  created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parishes.fiesta_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id           TEXT        NOT NULL REFERENCES parishes.details(id) ON DELETE CASCADE,
  primary_patron      TEXT        NOT NULL,
  secondary_patron    TEXT,
  date                TEXT        NOT NULL,
  expected_impact     TEXT        NOT NULL CHECK (expected_impact IN ('low', 'medium', 'high')),
  estimated_increase  NUMERIC     DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- C. SCHOOLS SCHEMA (DIOCESAN SCHOOL OPERATIONAL DOMAIN)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS schools.diocesan_schools_id_seq START 1;

CREATE TABLE IF NOT EXISTS schools.details (
  id           TEXT        PRIMARY KEY DEFAULT public.format_seq_id('SCH-', 'schools.diocesan_schools_id_seq', 3),
  name         TEXT        NOT NULL,
  vicariate    TEXT        NOT NULL,
  district     TEXT,
  class        TEXT        NOT NULL DEFAULT 'Class C' CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  principal    TEXT        NOT NULL DEFAULT 'Not assigned',
  address      TEXT        NOT NULL DEFAULT '',
  level        TEXT        NOT NULL DEFAULT 'K-12',
  enrollment   INTEGER     NOT NULL DEFAULT 0,
  capacity     INTEGER     NOT NULL DEFAULT 0,
  staff        INTEGER     NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS schools.financial_records_id_seq START 1;

CREATE TABLE IF NOT EXISTS schools.financial_records (
  id                  TEXT        PRIMARY KEY DEFAULT public.format_seq_id('FSCH-', 'schools.financial_records_id_seq', 6),
  school_id           TEXT        NOT NULL REFERENCES schools.details(id) ON DELETE CASCADE,
  month               TEXT        NOT NULL,
  year                INTEGER     NOT NULL,
  tuition_revenues    NUMERIC     NOT NULL DEFAULT 0,
  operational_overheads NUMERIC   NOT NULL DEFAULT 0,
  academic_payroll    NUMERIC     NOT NULL DEFAULT 0,
  miscellaneous_fees  NUMERIC     NOT NULL DEFAULT 0,
  total_disbursements NUMERIC     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- D. SEMINARIES SCHEMA (SEMINARY OPERATIONAL DOMAIN)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS seminaries.seminaries_id_seq START 1;

CREATE TABLE IF NOT EXISTS seminaries.details (
  id           TEXT        PRIMARY KEY DEFAULT public.format_seq_id('SEM-', 'seminaries.seminaries_id_seq', 3),
  name         TEXT        NOT NULL,
  vicariate    TEXT        NOT NULL,
  district     TEXT,
  class        TEXT        NOT NULL DEFAULT 'Class C' CHECK (class IN ('Class A','Class B','Class C','Class D','Class E')),
  rector       TEXT        NOT NULL DEFAULT 'Not assigned',
  address      TEXT        NOT NULL DEFAULT '',
  enrollment   INTEGER     NOT NULL DEFAULT 0,
  capacity     INTEGER     NOT NULL DEFAULT 0,
  staff        INTEGER     NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS seminaries.financial_records_id_seq START 1;

CREATE TABLE IF NOT EXISTS seminaries.financial_records (
  id                  TEXT        PRIMARY KEY DEFAULT public.format_seq_id('FSEM-', 'seminaries.financial_records_id_seq', 6),
  seminary_id         TEXT        NOT NULL REFERENCES seminaries.details(id) ON DELETE CASCADE,
  month               TEXT        NOT NULL,
  year                INTEGER     NOT NULL,
  board_and_lodging   NUMERIC     NOT NULL DEFAULT 0,
  diocesan_allocations NUMERIC    NOT NULL DEFAULT 0,
  miscellaneous_income NUMERIC    NOT NULL DEFAULT 0,
  house_disbursements NUMERIC     NOT NULL DEFAULT 0,
  total_disbursements NUMERIC     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- E. ANALYTICS SCHEMA (ML & DECISION SUPPORT DATA MART)
-- =============================================================================

-- Pre-computed Forecast Projections (SARIMA/Prophet)
CREATE TABLE IF NOT EXISTS analytics.financial_forecasts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           TEXT        NOT NULL,
  entity_type         TEXT        NOT NULL CHECK (entity_type IN ('parish', 'school', 'seminary')),
  forecast_date       DATE        NOT NULL,
  metric_type         TEXT        NOT NULL CHECK (metric_type IN ('collections', 'disbursements')),
  model_name          TEXT        NOT NULL DEFAULT 'Prophet',
  predicted_value     NUMERIC     NOT NULL,
  lower_confidence    NUMERIC     NOT NULL,
  upper_confidence    NUMERIC     NOT NULL,
  mae                 NUMERIC,
  mape                NUMERIC,
  rmse                NUMERIC,
  run_timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pre-computed Isolation Forest anomaly detections
CREATE TABLE IF NOT EXISTS analytics.anomaly_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           TEXT        NOT NULL,
  entity_type         TEXT        NOT NULL CHECK (entity_type IN ('parish', 'school', 'seminary')),
  target_month        TEXT        NOT NULL,
  target_year         INTEGER     NOT NULL,
  metric_evaluated    TEXT        NOT NULL CHECK (metric_evaluated IN ('collections', 'disbursements')),
  anomaly_score       NUMERIC     NOT NULL,
  is_anomaly          BOOLEAN     NOT NULL DEFAULT false,
  severity            TEXT        NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  suggested_cause     TEXT,
  user_status         TEXT        NOT NULL DEFAULT 'pending' CHECK (user_status IN ('pending', 'reviewed', 'dismissed')),
  reviewer_notes      TEXT,
  reviewed_by         UUID        REFERENCES diocese.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Multi-dimensional Health Snapshots
CREATE TABLE IF NOT EXISTS analytics.health_snapshots (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           TEXT        NOT NULL,
  entity_type         TEXT        NOT NULL CHECK (entity_type IN ('parish', 'school', 'seminary')),
  snapshot_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  composite_score     NUMERIC     NOT NULL CHECK (composite_score BETWEEN 0 AND 100),
  score_liquidity     NUMERIC     NOT NULL CHECK (score_liquidity BETWEEN 0 AND 100),
  score_sustainability NUMERIC    NOT NULL CHECK (score_sustainability BETWEEN 0 AND 100),
  score_efficiency    NUMERIC     NOT NULL CHECK (score_efficiency BETWEEN 0 AND 100),
  score_stability     NUMERIC     NOT NULL CHECK (score_stability BETWEEN 0 AND 100),
  score_growth        NUMERIC     NOT NULL CHECK (score_growth BETWEEN 0 AND 100),
  trend               TEXT        NOT NULL DEFAULT 'stable' CHECK (trend IN ('up', 'down', 'stable')),
  percentage_change   NUMERIC,
  analysis_summary    TEXT,
  recommendations     TEXT[]      NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LP/MILP Optimization Solver Run Tracking
CREATE TABLE IF NOT EXISTS analytics.subsidy_optimization_runs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  total_budget_pool   NUMERIC     NOT NULL,
  run_date            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_by              UUID        REFERENCES diocese.profiles(id),
  status              TEXT        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'archived')),
  notes               TEXT
);

-- LP/MILP Recommended Parish Subsidy Allocations
CREATE TABLE IF NOT EXISTS analytics.subsidy_optimization_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID        NOT NULL REFERENCES analytics.subsidy_optimization_runs(id) ON DELETE CASCADE,
  entity_id           TEXT        NOT NULL REFERENCES parishes.details(id) ON DELETE CASCADE,
  annual_deficit      NUMERIC     NOT NULL DEFAULT 0,
  recommended_subsidy NUMERIC     NOT NULL DEFAULT 0,
  allocated_subsidy   NUMERIC     NOT NULL DEFAULT 0,
  is_locked           BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- F. INDEXES FOR HIGH-PERFORMANCE ANALYTICAL GRAPH RENDERING
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_parish_financial_period ON parishes.financial_records (parish_id, year, month);
CREATE INDEX IF NOT EXISTS idx_school_financial_period ON schools.financial_records (school_id, year, month);
CREATE INDEX IF NOT EXISTS idx_seminary_financial_period ON seminaries.financial_records (seminary_id, year, month);

CREATE INDEX IF NOT EXISTS idx_forecasts_lookup ON analytics.financial_forecasts (entity_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_anomalies_lookup ON analytics.anomaly_records (entity_id, is_anomaly);
CREATE INDEX IF NOT EXISTS idx_health_lookup ON analytics.health_snapshots (entity_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_run ON analytics.subsidy_optimization_results (run_id);

-- =============================================================================
-- G. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE diocese.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE diocese.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE diocese.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diocese.project_expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE parishes.details ENABLE ROW LEVEL SECURITY;
ALTER TABLE parishes.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE parishes.fiesta_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE schools.details ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools.financial_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE seminaries.details ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminaries.financial_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE analytics.financial_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.anomaly_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.subsidy_optimization_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.subsidy_optimization_results ENABLE ROW LEVEL SECURITY;

-- Dynamic RBAC reading policies (Authenticated users can read their authorized entities)
CREATE POLICY "Auth profiles read" ON diocese.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth projects read" ON diocese.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth donations read" ON diocese.donations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth expenses read" ON diocese.project_expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth parishes details read" ON parishes.details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth parishes finance read" ON parishes.financial_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth parishes fiestas read" ON parishes.fiesta_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth schools details read" ON schools.details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth schools finance read" ON schools.financial_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth seminaries details read" ON seminaries.details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth seminaries finance read" ON seminaries.financial_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth forecasts read" ON analytics.financial_forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth anomalies read" ON analytics.anomaly_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth health read" ON analytics.health_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth opt runs read" ON analytics.subsidy_optimization_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth opt results read" ON analytics.subsidy_optimization_results FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- H. MASTER SEED DATA
-- =============================================================================

-- Seed Master Permissions
INSERT INTO diocese.permissions (id, name, description, category) VALUES
  ('view_diocese', 'Diocesan Level', 'Allows the user to view all records across the entire diocese.', 'Viewing Permissions'),
  ('view_parish', 'Parish Level', 'Allows the user to view records specific to their assigned parish.', 'Viewing Permissions'),
  ('view_seminary', 'Seminary Level', 'Allows the user to view records specific to their assigned seminary.', 'Viewing Permissions'),
  ('view_school', 'School Level', 'Allows the user to view records specific to their assigned school.', 'Viewing Permissions'),
  ('view_school_cluster', 'Cluster School Level', 'Allows the user to view assigned cluster schools.', 'Viewing Permissions'),
  ('view_school_all', 'All Schools Level', 'Allows the user to view all schools in the diocese.', 'Viewing Permissions'),
  ('digital_twin', 'Digital Twin', 'Allows the user to launch scenario simulations and mirror other institution dashboards.', 'Digital Twin'),
  ('view_priests', 'Priest Profiles & Dashboard', 'Allows the user to view priest health trackers, assignments, and personnel dashboards.', 'Priest Management'),
  ('manage_assignments', 'Priest Assignment Simulator', 'Allows the user to launch scenario planning and simulate clergy assignments.', 'Priest Management'),
  ('download_csv', 'Download CSV Templates', 'Allows the user to download blank CSV templates for data entry.', 'Data Management'),
  ('upload_csv_admin', 'Upload Master CSV', 'Allows the user to upload and process master CSV templates for the diocese.', 'Data Management'),
  ('upload_csv_entity', 'Upload Entity CSV', 'Allows the user to upload updated CSVs for their specific entity.', 'Data Management'),
  ('manage_entities', 'Manage Entity Management', 'Allows the user to manage and configure diocesan institutions, parishes, and schools.', 'Entity Management'),
  ('manage_projects', 'Manage Projects', 'Allows the user to create, edit, and manage special diocesan and parish projects.', 'Projects'),
  ('view_projects', 'View Projects Only', 'Allows the user to view project lists and details without administrative modifications.', 'Projects'),
  ('create_users', 'Create User Accounts', 'Allows the user to create new accounts for other personnel.', 'User Management'),
  ('manage_roles', 'Manage User Roles', 'Allows the user to modify role permissions and assign roles to users.', 'User Management'),
  ('view_audit_logs', 'View Audit Logs', 'Allows the user to view administrative action audit logs.', 'User Management'),
  ('manage_announcements', 'Manage Announcements', 'Allows the user to create, edit, and publish announcements across the diocese.', 'Announcements'),
  ('view_announcements', 'View Announcements Only', 'Allows the user to view announcements and news bulletins without publishing rights.', 'Announcements'),
  ('view_parish_dashboard',   'Parish Dashboard',   'Allows the user to access and view the parish-level financial summaries and operational reports dashboard.',     'Dashboard Access'),
  ('view_seminary_dashboard', 'Seminary Dashboard', 'Allows the user to access and view the seminary-level financial summaries and educational timelines dashboard.', 'Dashboard Access'),
  ('view_school_dashboard',   'School Dashboard',   'Allows the user to access and view the school-level financial summaries and academic metrics dashboard.',        'Dashboard Access')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Seed Predefined Roles
INSERT INTO diocese.roles (id, name, color, is_predefined) VALUES
  ('bishop', 'Bishop', '#D4AF37', true),
  ('chancellor', 'Chancellor', '#8B5CF6', true),
  ('diocesan_oeconomus', 'Diocesan Oeconomus', '#1E3A8A', true),
  ('finance_staff', 'Finance Staff', '#3B82F6', true),
  ('parish_priest', 'Parish Priest', '#059669', true),
  ('parish_secretary', 'Parish Secretary', '#10B981', true),
  ('seminary_rector', 'Rector', '#DC2626', true),
  ('seminary_oeconomus', 'Seminary Oeconomus', '#EF4444', true),
  ('school_superintendent', 'School Superintendent', '#6D28D9', true),
  ('finance_supervisor', 'School Finance Supervisor', '#7C3AED', true),
  ('finance_officer', 'School Finance Officer', '#8B5CF6', true),
  ('school_principal', 'School Principal', '#A78BFA', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color;

-- Link Roles and Permissions
DELETE FROM diocese.role_permissions;

-- Bishop
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('bishop', 'view_diocese'), ('bishop', 'download_csv'), ('bishop', 'upload_csv_admin'), ('bishop', 'upload_csv_entity'),
  ('bishop', 'create_users'), ('bishop', 'manage_roles'), ('bishop', 'digital_twin'), ('bishop', 'manage_entities'),
  ('bishop', 'manage_projects'), ('bishop', 'manage_announcements'), ('bishop', 'view_priests'), ('bishop', 'manage_assignments'),
  ('bishop', 'view_audit_logs'), ('bishop', 'view_parish_dashboard'), ('bishop', 'view_seminary_dashboard'), ('bishop', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Diocesan Oeconomus
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('diocesan_oeconomus', 'view_diocese'), ('diocesan_oeconomus', 'download_csv'), ('diocesan_oeconomus', 'upload_csv_admin'), ('diocesan_oeconomus', 'upload_csv_entity'),
  ('diocesan_oeconomus', 'create_users'), ('diocesan_oeconomus', 'manage_roles'), ('diocesan_oeconomus', 'digital_twin'), ('diocesan_oeconomus', 'manage_entities'),
  ('diocesan_oeconomus', 'manage_projects'), ('diocesan_oeconomus', 'manage_announcements'), ('diocesan_oeconomus', 'view_priests'), ('diocesan_oeconomus', 'manage_assignments'),
  ('diocesan_oeconomus', 'view_audit_logs'), ('diocesan_oeconomus', 'view_parish_dashboard'), ('diocesan_oeconomus', 'view_seminary_dashboard'), ('diocesan_oeconomus', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Chancellor
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('chancellor', 'view_diocese'), ('chancellor', 'manage_announcements'), ('chancellor', 'view_priests'), ('chancellor', 'manage_assignments')
ON CONFLICT DO NOTHING;

-- Finance Staff
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('finance_staff', 'view_diocese'), ('finance_staff', 'download_csv'), ('finance_staff', 'upload_csv_admin'), ('finance_staff', 'upload_csv_entity'),
  ('finance_staff', 'manage_projects'), ('finance_staff', 'view_announcements'), ('finance_staff', 'view_priests'),
  ('finance_staff', 'view_parish_dashboard'), ('finance_staff', 'view_seminary_dashboard'), ('finance_staff', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Parish Priest
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_priest', 'view_parish'), ('parish_priest', 'download_csv'), ('parish_priest', 'upload_csv_entity'),
  ('parish_priest', 'manage_projects'), ('parish_priest', 'view_announcements'), ('parish_priest', 'view_priests'),
  ('parish_priest', 'manage_assignments'), ('parish_priest', 'view_parish_dashboard')
ON CONFLICT DO NOTHING;

-- Parish Secretary
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_secretary', 'view_parish'), ('parish_secretary', 'download_csv'), ('parish_secretary', 'upload_csv_entity'),
  ('parish_secretary', 'manage_projects'), ('parish_secretary', 'view_announcements'), ('parish_secretary', 'view_parish_dashboard')
ON CONFLICT DO NOTHING;

-- Seminary Rector
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('seminary_rector', 'view_seminary'), ('seminary_rector', 'download_csv'), ('seminary_rector', 'upload_csv_entity'),
  ('seminary_rector', 'manage_projects'), ('seminary_rector', 'view_announcements'), ('seminary_rector', 'view_priests'),
  ('seminary_rector', 'manage_assignments'), ('seminary_rector', 'view_seminary_dashboard')
ON CONFLICT DO NOTHING;

-- School Superintendent
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_superintendent', 'view_school_all'), ('school_superintendent', 'download_csv'), ('school_superintendent', 'upload_csv_entity'),
  ('school_superintendent', 'manage_projects'), ('school_superintendent', 'view_announcements'), ('school_superintendent', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- School Principal
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_principal', 'view_school'), ('school_principal', 'view_projects'), ('school_principal', 'view_announcements'), ('school_principal', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Done
-- Next: Run the seed-entities.sql to populate parishes, schools, and seminaries details.
-- =============================================================================
