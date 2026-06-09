-- Shared administrative core.

CREATE TABLE IF NOT EXISTS diocese.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution_type text NOT NULL CHECK (institution_type IN ('diocese', 'parish', 'school', 'seminary')),
  vicariate text,
  district text,
  cluster text,
  class text CHECK (class IN ('A', 'B', 'C', 'D', 'E') OR class IS NULL),
  address text,
  contact_number text,
  email text UNIQUE,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#D4AF37',
  is_predefined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.permissions (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.role_permissions (
  role_id text NOT NULL REFERENCES diocese.roles(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES diocese.permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS diocese.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_auth_id uuid UNIQUE,
  full_name text,
  email text UNIQUE,
  role_id text REFERENCES diocese.roles(id),
  institution_id uuid REFERENCES diocese.institutions(id),
  contact_number text,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT profiles_active_requires_role CHECK (is_active = false OR role_id IS NOT NULL),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  name text NOT NULL,
  description text,
  fund_usage text,
  category text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on-hold')),
  target_amount numeric(14, 2) NOT NULL DEFAULT 0,
  current_amount numeric(14, 2) NOT NULL DEFAULT 0,
  total_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  beneficiaries text,
  contact_person text,
  cover_image text,
  health_score numeric(5, 2) DEFAULT 0,
  success_probability numeric(5, 2) DEFAULT 0,
  health_score_updated_at timestamptz,
  recommendation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES diocese.projects(id) ON DELETE CASCADE,
  donor_name text,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  date date,
  payment_method text CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer') OR payment_method IS NULL),
  receipt_issued boolean NOT NULL DEFAULT false,
  receipt_proof_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES diocese.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  date date,
  payment_method text CHECK (payment_method IN ('Cash', 'Check', 'Online', 'Bank Transfer') OR payment_method IS NULL),
  receipt_reference text,
  proof_file_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  author_id uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  author text,
  author_role text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'financial', 'administrative', 'event')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS diocese.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_reference text NOT NULL UNIQUE,
  user_name text,
  role text,
  is_system boolean NOT NULL DEFAULT false,
  category text NOT NULL CHECK (category IN ('auth', 'finance', 'analytics', 'reports', 'system', 'access')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'success')),
  action text NOT NULL,
  detail text,
  institution_id uuid REFERENCES diocese.institutions(id),
  ip_address text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_institutions_type_active
  ON diocese.institutions (institution_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_institution
  ON diocese.profiles (institution_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_institution_status
  ON diocese.projects (institution_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_occurred_at
  ON diocese.audit_logs (institution_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_institutions ON diocese.institutions;
CREATE TRIGGER set_updated_at_institutions
BEFORE UPDATE ON diocese.institutions
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_roles ON diocese.roles;
CREATE TRIGGER set_updated_at_roles
BEFORE UPDATE ON diocese.roles
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_permissions ON diocese.permissions;
CREATE TRIGGER set_updated_at_permissions
BEFORE UPDATE ON diocese.permissions
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_role_permissions ON diocese.role_permissions;
CREATE TRIGGER set_updated_at_role_permissions
BEFORE UPDATE ON diocese.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON diocese.profiles;
CREATE TRIGGER set_updated_at_profiles
BEFORE UPDATE ON diocese.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_projects ON diocese.projects;
CREATE TRIGGER set_updated_at_projects
BEFORE UPDATE ON diocese.projects
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_donations ON diocese.donations;
CREATE TRIGGER set_updated_at_donations
BEFORE UPDATE ON diocese.donations
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_project_expenses ON diocese.project_expenses;
CREATE TRIGGER set_updated_at_project_expenses
BEFORE UPDATE ON diocese.project_expenses
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_announcements ON diocese.announcements;
CREATE TRIGGER set_updated_at_announcements
BEFORE UPDATE ON diocese.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_audit_logs ON diocese.audit_logs;
CREATE TRIGGER set_updated_at_audit_logs
BEFORE UPDATE ON diocese.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Grant schema and table access to Supabase built-in roles.
-- Custom schemas require explicit grants; the public schema gets these automatically.
GRANT USAGE ON SCHEMA diocese TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA diocese TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA diocese TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE  ON ALL TABLES    IN SCHEMA diocese TO authenticated;
GRANT USAGE                           ON ALL SEQUENCES IN SCHEMA diocese TO authenticated;
GRANT SELECT                          ON ALL TABLES    IN SCHEMA diocese TO anon;
