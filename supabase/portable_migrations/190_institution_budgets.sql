-- Migration 190: Monthly institution budgets.
--
-- Each institution (parish / school / seminary) submits a budget amount per
-- month of a given year. Diocese-level roles get a read-only overview of
-- every institution's submitted budget; institution roles manage only their
-- own. Scoping is enforced in the backend service (service_role key bypasses
-- RLS, matching the rest of the app).

CREATE TABLE IF NOT EXISTS diocese.institution_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_institution_budgets_institution_year
  ON diocese.institution_budgets (institution_id, year);

CREATE INDEX IF NOT EXISTS idx_institution_budgets_year
  ON diocese.institution_budgets (year);

DROP TRIGGER IF EXISTS set_updated_at_institution_budgets ON diocese.institution_budgets;
CREATE TRIGGER set_updated_at_institution_budgets
BEFORE UPDATE ON diocese.institution_budgets
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

GRANT ALL PRIVILEGES ON diocese.institution_budgets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON diocese.institution_budgets TO authenticated;
GRANT SELECT ON diocese.institution_budgets TO anon;

-- ── Permissions ───────────────────────────────────────────────────────────────
-- Same radio-group pattern as announcements/events: manage implies full
-- access, view is read-only.

INSERT INTO diocese.permissions (id, name, description, category) VALUES
  ('manage_budget', 'Manage Budget',    'Allows the user to set and update the monthly budget for their institution.', 'Budget'),
  ('view_budget',   'View Budget Only', 'Allows the user to view submitted institution budgets without editing them.', 'Budget')
ON CONFLICT (id) DO NOTHING;

-- ── Role assignments ──────────────────────────────────────────────────────────
-- manage_budget → institution heads who submit their own budget
-- view_budget   → diocese-level oversight and read-only staff

-- Diocese team: overview only (per requirement, the diocese does not input
-- budgets on behalf of institutions).
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('bishop', 'view_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('chancellor', 'view_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('diocesan_oeconomus', 'view_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('finance_staff', 'view_budget')
ON CONFLICT DO NOTHING;

-- Parish team: manage own budget
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_priest', 'manage_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('parish_secretary', 'manage_budget')
ON CONFLICT DO NOTHING;

-- Seminary team: manage own budget
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('seminary_rector', 'manage_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('seminary_oeconomus', 'manage_budget')
ON CONFLICT DO NOTHING;

-- School team: finance officer manages, supervisory roles view
INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('finance_officer', 'manage_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_principal', 'view_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('school_superintendent', 'view_budget')
ON CONFLICT DO NOTHING;

INSERT INTO diocese.role_permissions (role_id, permission_id) VALUES
  ('finance_supervisor', 'view_budget')
ON CONFLICT DO NOTHING;
