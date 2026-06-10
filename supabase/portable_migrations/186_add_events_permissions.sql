-- Add view_events and manage_events to the permissions table.
-- These follow the same radio-group pattern as announcements:
-- only one can be active per role at a time (manage implies full access,
-- view is read-only). Disabling view also disables manage in the UI.

INSERT INTO diocese.permissions (id, name, description, category) VALUES
  ('manage_events', 'Manage Events',    'Allows the user to create, edit, and delete events for their institution.',      'Events'),
  ('view_events',   'View Events Only', 'Allows the user to view scheduled events without the ability to modify them.',   'Events')
ON CONFLICT (id) DO NOTHING;

-- ── Role assignments ──────────────────────────────────────────────────────────
-- manage_events  → diocesan/institutional heads who schedule and run events
-- view_events    → staff/principals who need visibility but not edit rights

-- Bishop: full manage
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('bishop', 'manage_events')
ON CONFLICT DO NOTHING;

-- Diocesan Oeconomus: full manage
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('diocesan_oeconomus', 'manage_events')
ON CONFLICT DO NOTHING;

-- Chancellor: full manage
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('chancellor', 'manage_events')
ON CONFLICT DO NOTHING;

-- Finance Staff: view only
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('finance_staff', 'view_events')
ON CONFLICT DO NOTHING;

-- Parish Priest: full manage (owns parish events)
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_priest', 'manage_events')
ON CONFLICT DO NOTHING;

-- Parish Secretary: full manage (assists priest with scheduling)
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_secretary', 'manage_events')
ON CONFLICT DO NOTHING;

-- Seminary Rector: full manage (owns seminary events)
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('seminary_rector', 'manage_events')
ON CONFLICT DO NOTHING;

-- School Superintendent: view only
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_superintendent', 'view_events')
ON CONFLICT DO NOTHING;

-- School Principal: view only
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_principal', 'view_events')
ON CONFLICT DO NOTHING;
