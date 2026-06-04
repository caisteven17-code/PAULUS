-- Core RBAC seed data.

INSERT INTO diocese.roles (id, name, color, is_predefined)
VALUES
  ('bishop', 'Bishop', '#D4AF37', true),
  ('chancellor', 'Chancellor', '#8B5CF6', true),
  ('diocesan_oeconomus', 'Diocesan Oeconomus', '#1E3A8A', true),
  ('finance_staff', 'Finance Staff', '#3B82F6', true),
  ('parish_priest', 'Parish Priest', '#059669', true),
  ('parish_secretary', 'Parish Secretary', '#10B981', true),
  ('seminary_rector', 'Seminary Rector', '#DC2626', true),
  ('seminary_oeconomus', 'Seminary Oeconomus', '#EF4444', true),
  ('school_superintendent', 'School Superintendent', '#6D28D9', true),
  ('finance_supervisor', 'School Finance Supervisor', '#7C3AED', true),
  ('finance_officer', 'School Finance Officer', '#8B5CF6', true),
  ('school_principal', 'School Principal', '#A78BFA', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO diocese.permissions (id, name, category, description)
VALUES
  ('view_diocese', 'Diocesan Level', 'Viewing Permissions', 'Allows the user to view all records across the entire diocese.'),
  ('view_parish', 'Parish Level', 'Viewing Permissions', 'Allows the user to view records specific to their assigned parish.'),
  ('view_seminary', 'Seminary Level', 'Viewing Permissions', 'Allows the user to view records specific to their assigned seminary.'),
  ('view_school', 'School Level', 'Viewing Permissions', 'Allows the user to view records specific to their assigned school.'),
  ('view_school_cluster', 'Cluster School Level', 'Viewing Permissions', 'Allows the user to view assigned cluster schools.'),
  ('view_school_all', 'All Schools Level', 'Viewing Permissions', 'Allows the user to view all schools in the diocese.'),
  ('view_priests', 'Priest Profiles & Dashboard', 'Priest Management', 'Allows the user to view priest health trackers, assignments, and personnel dashboards.'),
  ('manage_assignments', 'Priest Assignment Simulator', 'Priest Management', 'Allows the user to launch scenario planning and simulate clergy assignments.'),
  ('download_csv', 'Download CSV Templates', 'Data Management', 'Allows the user to download blank CSV templates for data entry.'),
  ('upload_csv_admin', 'Upload Master CSV', 'Data Management', 'Allows the user to upload and process master CSV templates for the diocese.'),
  ('upload_csv_entity', 'Upload Entity CSV', 'Data Management', 'Allows the user to upload updated CSVs for their specific entity.'),
  ('manage_entities', 'Manage Entity Management', 'Entity Management', 'Allows the user to manage and configure diocesan institutions, parishes, schools, and seminaries.'),
  ('manage_projects', 'Manage Projects', 'Projects', 'Allows the user to create, edit, and manage projects.'),
  ('view_projects', 'View Projects Only', 'Projects', 'Allows the user to view project lists and details without administrative modifications.'),
  ('create_users', 'Create User Accounts', 'User Management', 'Allows the user to create new accounts for other personnel.'),
  ('manage_roles', 'Manage User Roles', 'User Management', 'Allows the user to modify role permissions and assign roles to users.'),
  ('view_audit_logs', 'View Audit Logs', 'User Management', 'Allows the user to view administrative action audit logs.'),
  ('manage_announcements', 'Manage Announcements', 'Announcements', 'Allows the user to create, edit, and publish announcements across the diocese.'),
  ('view_announcements', 'View Announcements Only', 'Announcements', 'Allows the user to view announcements and news bulletins without publishing rights.'),
  ('view_parish_dashboard', 'Parish Dashboard', 'Dashboard Access', 'Allows the user to access parish dashboards.'),
  ('view_seminary_dashboard', 'Seminary Dashboard', 'Dashboard Access', 'Allows the user to access seminary dashboards.'),
  ('view_school_dashboard', 'School Dashboard', 'Dashboard Access', 'Allows the user to access school dashboards.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id, granted)
VALUES
  ('bishop', 'view_diocese', true),
  ('bishop', 'download_csv', true),
  ('bishop', 'upload_csv_admin', true),
  ('bishop', 'upload_csv_entity', true),
  ('bishop', 'create_users', true),
  ('bishop', 'manage_roles', true),
  ('bishop', 'manage_entities', true),
  ('bishop', 'manage_projects', true),
  ('bishop', 'manage_announcements', true),
  ('bishop', 'view_priests', true),
  ('bishop', 'manage_assignments', true),
  ('bishop', 'view_audit_logs', true),
  ('bishop', 'view_parish_dashboard', true),
  ('bishop', 'view_seminary_dashboard', true),
  ('bishop', 'view_school_dashboard', true),
  ('parish_priest', 'view_parish', true),
  ('parish_priest', 'upload_csv_entity', true),
  ('parish_priest', 'view_projects', true),
  ('parish_priest', 'view_parish_dashboard', true),
  ('parish_secretary', 'view_parish', true),
  ('parish_secretary', 'upload_csv_entity', true),
  ('parish_secretary', 'view_parish_dashboard', true),
  ('seminary_rector', 'view_seminary', true),
  ('seminary_rector', 'upload_csv_entity', true),
  ('seminary_rector', 'view_seminary_dashboard', true),
  ('seminary_oeconomus', 'view_seminary', true),
  ('seminary_oeconomus', 'upload_csv_entity', true),
  ('seminary_oeconomus', 'view_seminary_dashboard', true),
  ('school_superintendent', 'view_school_all', true),
  ('school_superintendent', 'view_school_dashboard', true),
  ('finance_supervisor', 'view_school_cluster', true),
  ('finance_supervisor', 'view_school_dashboard', true),
  ('finance_officer', 'view_school', true),
  ('finance_officer', 'upload_csv_entity', true),
  ('finance_officer', 'view_school_dashboard', true),
  ('school_principal', 'view_school', true),
  ('school_principal', 'view_school_dashboard', true)
ON CONFLICT (role_id, permission_id) DO UPDATE
SET granted = EXCLUDED.granted;

