-- Liturgical Calendar Validator (human-in-the-loop review).
-- Adds the validate_liturgical_calendar permission and a dedicated
-- liturgical_validator role. Every imported liturgical event in
-- reference.liturgical_calendar must be approved, revised, or rejected
-- by a human validator before downstream features rely on it.

INSERT INTO diocese.permissions (id, name, description, category) VALUES
  ('validate_liturgical_calendar', 'Validate Liturgical Calendar',
   'Allows the user to review imported liturgical calendar events — approving, revising, or rejecting dates before they are used by the system.',
   'Data Management')
ON CONFLICT (id) DO NOTHING;

-- Dedicated validator role: only sees the Liturgical Validator admin tab.
INSERT INTO diocese.roles (id, name, color, is_predefined) VALUES
  ('liturgical_validator', 'Liturgical Validator', '#0E7490', true)
ON CONFLICT (id) DO NOTHING;

-- ── Role assignments ──────────────────────────────────────────────────────────
-- liturgical_validator → its sole purpose
-- bishop / diocesan_oeconomus → full-access roles keep oversight

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('liturgical_validator', 'validate_liturgical_calendar')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('bishop', 'validate_liturgical_calendar')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('diocesan_oeconomus', 'validate_liturgical_calendar')
ON CONFLICT DO NOTHING;
