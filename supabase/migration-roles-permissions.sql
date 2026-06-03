-- =============================================================================
-- Diocese of San Pablo — Roles & Permissions Schema Migration (v3)
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================================

-- 1. Create ROLES table
CREATE TABLE IF NOT EXISTS roles (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  color           TEXT        NOT NULL DEFAULT '#D4AF37',
  is_predefined   BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create PERMISSIONS table
CREATE TABLE IF NOT EXISTS permissions (
  id              TEXT        PRIMARY KEY,
  name            TEXT        NOT NULL,
  description     TEXT,
  category        TEXT        NOT NULL
);

-- 3. Create ROLE_PERMISSIONS join table (referencing roles and permissions)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         TEXT        REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   TEXT        REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Select policies (Allow authenticated users to read)
DROP POLICY IF EXISTS "auth_read_roles" ON roles;
CREATE POLICY "auth_read_roles" ON roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_read_permissions" ON permissions;
CREATE POLICY "auth_read_permissions" ON permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_read_role_permissions" ON role_permissions;
CREATE POLICY "auth_read_role_permissions" ON role_permissions FOR SELECT TO authenticated USING (true);

-- Seed Permissions Master Data
INSERT INTO permissions (id, name, description, category) VALUES
  -- Viewing Permissions
  ('view_diocese', 'Diocesan Level', 'Allows the user to view all records across the entire diocese.', 'Viewing Permissions'),
  ('view_parish', 'Parish Level', 'Allows the user to view records specific to their assigned parish.', 'Viewing Permissions'),
  ('view_seminary', 'Seminary Level', 'Allows the user to view records specific to their assigned seminary.', 'Viewing Permissions'),
  ('view_school', 'School Level', 'Allows the user to view records specific to their assigned school.', 'Viewing Permissions'),
  ('view_school_cluster', 'Cluster School Level', 'Allows the user to view assigned cluster schools.', 'Viewing Permissions'),
  ('view_school_all', 'All Schools Level', 'Allows the user to view all schools in the diocese.', 'Viewing Permissions'),
  
  -- Digital Twin
  ('digital_twin', 'Digital Twin', 'Allows the user to launch scenario simulations and mirror other institution dashboards.', 'Digital Twin'),
  
  -- Priest Management
  ('view_priests', 'Priest Profiles & Dashboard', 'Allows the user to view priest health trackers, assignments, and personnel dashboards.', 'Priest Management'),
  ('manage_assignments', 'Priest Assignment Simulator', 'Allows the user to launch scenario planning and simulate clergy assignments.', 'Priest Management'),
  
  -- Data Management
  ('download_csv', 'Download CSV Templates', 'Allows the user to download blank CSV templates for data entry.', 'Data Management'),
  ('upload_csv_admin', 'Upload Master CSV', 'Allows the user to upload and process master CSV templates for the diocese.', 'Data Management'),
  ('upload_csv_entity', 'Upload Entity CSV', 'Allows the user to upload updated CSVs for their specific entity.', 'Data Management'),
  
  -- Entity Management
  ('manage_entities', 'Manage Entity Management', 'Allows the user to manage and configure diocesan institutions, parishes, and schools.', 'Entity Management'),
  
  -- Projects
  ('manage_projects', 'Manage Projects', 'Allows the user to create, edit, and manage special diocesan and parish projects.', 'Projects'),
  ('view_projects', 'View Projects Only', 'Allows the user to view project lists and details without administrative modifications.', 'Projects'),
  
  -- User Management
  ('create_users', 'Create User Accounts', 'Allows the user to create new accounts for other personnel.', 'User Management'),
  ('manage_roles', 'Manage User Roles', 'Allows the user to modify role permissions and assign roles to users.', 'User Management'),
  ('view_audit_logs', 'View Audit Logs', 'Allows the user to view administrative action audit logs.', 'User Management'),
  
  -- Announcements
  ('manage_announcements', 'Manage Announcements', 'Allows the user to create, edit, and publish announcements across the diocese.', 'Announcements'),
  ('view_announcements', 'View Announcements Only', 'Allows the user to view announcements and news bulletins without publishing rights.', 'Announcements'),

  -- Dashboard Sub-Access (added in v4)
  ('view_parish_dashboard',   'Parish Dashboard',   'Allows the user to access and view the parish-level financial summaries and operational reports dashboard.',     'Dashboard Access'),
  ('view_seminary_dashboard', 'Seminary Dashboard', 'Allows the user to access and view the seminary-level financial summaries and educational timelines dashboard.', 'Dashboard Access'),
  ('view_school_dashboard',   'School Dashboard',   'Allows the user to access and view the school-level financial summaries and academic metrics dashboard.',        'Dashboard Access')
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Predefined Roles
INSERT INTO roles (id, name, color, is_predefined) VALUES
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
ON CONFLICT (id) DO NOTHING;

-- Seed Permissions for Predefined Roles (based on INITIAL_ROLES)
DELETE FROM role_permissions WHERE role_id IN ('bishop', 'chancellor', 'diocesan_oeconomus', 'finance_staff', 'parish_priest', 'parish_secretary', 'seminary_rector', 'seminary_oeconomus', 'school_superintendent', 'finance_supervisor', 'finance_officer', 'school_principal');

-- Bishop Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('bishop', 'view_diocese'), ('bishop', 'download_csv'), ('bishop', 'upload_csv_admin'), ('bishop', 'upload_csv_entity'),
  ('bishop', 'create_users'), ('bishop', 'manage_roles'), ('bishop', 'digital_twin'), ('bishop', 'manage_entities'),
  ('bishop', 'manage_projects'), ('bishop', 'manage_announcements'),
  ('bishop', 'view_priests'), ('bishop', 'manage_assignments'), ('bishop', 'view_audit_logs'),
  ('bishop', 'view_parish_dashboard'), ('bishop', 'view_seminary_dashboard'), ('bishop', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Chancellor Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('chancellor', 'view_diocese'),
  ('chancellor', 'manage_announcements'), ('chancellor', 'view_priests'),
  ('chancellor', 'manage_assignments')
ON CONFLICT DO NOTHING;

-- Diocesan Oeconomus Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('diocesan_oeconomus', 'view_diocese'), ('diocesan_oeconomus', 'download_csv'), ('diocesan_oeconomus', 'upload_csv_admin'), ('diocesan_oeconomus', 'upload_csv_entity'),
  ('diocesan_oeconomus', 'create_users'), ('diocesan_oeconomus', 'manage_roles'), ('diocesan_oeconomus', 'digital_twin'), ('diocesan_oeconomus', 'manage_entities'),
  ('diocesan_oeconomus', 'manage_projects'), ('diocesan_oeconomus', 'manage_announcements'),
  ('diocesan_oeconomus', 'view_priests'), ('diocesan_oeconomus', 'manage_assignments'), ('diocesan_oeconomus', 'view_audit_logs'),
  ('diocesan_oeconomus', 'view_parish_dashboard'), ('diocesan_oeconomus', 'view_seminary_dashboard'), ('diocesan_oeconomus', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Finance Staff Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('finance_staff', 'view_diocese'), ('finance_staff', 'download_csv'), ('finance_staff', 'upload_csv_admin'), ('finance_staff', 'upload_csv_entity'),
  ('finance_staff', 'manage_projects'), ('finance_staff', 'view_announcements'), ('finance_staff', 'view_priests'),
  ('finance_staff', 'view_parish_dashboard'), ('finance_staff', 'view_seminary_dashboard'), ('finance_staff', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Parish Priest Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('parish_priest', 'view_parish'), ('parish_priest', 'download_csv'), ('parish_priest', 'upload_csv_entity'),
  ('parish_priest', 'manage_projects'), ('parish_priest', 'view_announcements'),
  ('parish_priest', 'view_priests'), ('parish_priest', 'manage_assignments'),
  ('parish_priest', 'view_parish_dashboard')
ON CONFLICT DO NOTHING;

-- Parish Secretary Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('parish_secretary', 'view_parish'), ('parish_secretary', 'download_csv'), ('parish_secretary', 'upload_csv_entity'),
  ('parish_secretary', 'manage_projects'), ('parish_secretary', 'view_announcements'),
  ('parish_secretary', 'view_parish_dashboard')
ON CONFLICT DO NOTHING;

-- Seminary Rector Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('seminary_rector', 'view_seminary'), ('seminary_rector', 'download_csv'), ('seminary_rector', 'upload_csv_entity'),
  ('seminary_rector', 'manage_projects'), ('seminary_rector', 'view_announcements'),
  ('seminary_rector', 'view_priests'), ('seminary_rector', 'manage_assignments'),
  ('seminary_rector', 'view_seminary_dashboard')
ON CONFLICT DO NOTHING;

-- Seminary Oeconomus Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('seminary_oeconomus', 'view_seminary'), ('seminary_oeconomus', 'download_csv'), ('seminary_oeconomus', 'upload_csv_entity'),
  ('seminary_oeconomus', 'manage_projects'), ('seminary_oeconomus', 'view_announcements'),
  ('seminary_oeconomus', 'view_seminary_dashboard')
ON CONFLICT DO NOTHING;

-- School Superintendent Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('school_superintendent', 'view_school_all'), ('school_superintendent', 'download_csv'), ('school_superintendent', 'upload_csv_entity'),
  ('school_superintendent', 'manage_projects'), ('school_superintendent', 'view_announcements'),
  ('school_superintendent', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Finance Supervisor Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('finance_supervisor', 'view_school_cluster'), ('finance_supervisor', 'download_csv'), ('finance_supervisor', 'upload_csv_entity'),
  ('finance_supervisor', 'view_projects'), ('finance_supervisor', 'view_announcements'),
  ('finance_supervisor', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- Finance Officer Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('finance_officer', 'view_school'), ('finance_officer', 'download_csv'), ('finance_officer', 'upload_csv_entity'),
  ('finance_officer', 'manage_projects'), ('finance_officer', 'view_announcements'),
  ('finance_officer', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- School Principal Permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('school_principal', 'view_school'),
  ('school_principal', 'view_projects'), ('school_principal', 'view_announcements'),
  ('school_principal', 'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PATCH v4 — Run ONLY this block if your Supabase DB already has the v3 schema
--            (i.e. you ran the migration before and just need the 3 new dashboard
--            permissions). Copy from here to the end and paste in SQL Editor.
-- =============================================================================

INSERT INTO permissions (id, name, description, category) VALUES
  ('view_parish_dashboard',   'Parish Dashboard',   'Allows the user to access and view the parish-level financial summaries and operational reports dashboard.',     'Dashboard Access'),
  ('view_seminary_dashboard', 'Seminary Dashboard', 'Allows the user to access and view the seminary-level financial summaries and educational timelines dashboard.', 'Dashboard Access'),
  ('view_school_dashboard',   'School Dashboard',   'Allows the user to access and view the school-level financial summaries and academic metrics dashboard.',        'Dashboard Access')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
  -- Diocesan roles → all three dashboards
  ('bishop',             'view_parish_dashboard'),   ('bishop',             'view_seminary_dashboard'), ('bishop',             'view_school_dashboard'),
  ('chancellor',         'view_parish_dashboard'),   ('chancellor',         'view_seminary_dashboard'), ('chancellor',         'view_school_dashboard'),
  ('diocesan_oeconomus', 'view_parish_dashboard'),   ('diocesan_oeconomus', 'view_seminary_dashboard'), ('diocesan_oeconomus', 'view_school_dashboard'),
  ('finance_staff',      'view_parish_dashboard'),   ('finance_staff',      'view_seminary_dashboard'), ('finance_staff',      'view_school_dashboard'),
  -- Parish roles → parish dashboard only
  ('parish_priest',      'view_parish_dashboard'),
  ('parish_secretary',   'view_parish_dashboard'),
  -- Seminary roles → seminary dashboard only
  ('seminary_rector',    'view_seminary_dashboard'),
  ('seminary_oeconomus', 'view_seminary_dashboard'),
  -- School roles → school dashboard only
  ('school_superintendent', 'view_school_dashboard'),
  ('finance_supervisor',    'view_school_dashboard'),
  ('finance_officer',       'view_school_dashboard'),
  ('school_principal',      'view_school_dashboard')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PATCH v5 — Announcement Permission Mutual Exclusivity Fix
--
-- Run this block if your Supabase DB already has data from a previous migration.
-- It removes the stale `view_announcements` permission from every role that
-- already has `manage_announcements` (since they are now mutually exclusive).
--
-- Roles that only have `view_announcements` (finance_staff, finance_supervisor,
-- finance_officer) are NOT affected.
-- =============================================================================

DELETE FROM role_permissions
WHERE permission_id = 'view_announcements'
  AND role_id IN (
    SELECT role_id FROM role_permissions WHERE permission_id = 'manage_announcements'
  );
