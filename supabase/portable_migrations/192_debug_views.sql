-- Migration 192: Debug views — readable, pre-joined rows for manual DB inspection.
-- Resolves UUIDs into institution_code / profile_code so backtracking doesn't
-- require hand-written joins. Read-only convenience layer; the app never uses these.

CREATE SCHEMA IF NOT EXISTS debug;

-- ── Saved what-if scenarios (institution financial) ───────────────────────────

CREATE OR REPLACE VIEW debug.v_institution_scenarios AS
SELECT
  i.institution_code,
  s.institution_name,
  p.profile_code   AS created_by_code,
  p.full_name      AS created_by_name,
  s.name           AS scenario_name,
  s.institution_type,
  s.income_change,
  s.expenses_change,
  s.one_time_income,
  s.one_time_expense,
  s.external_support,
  s.timeline_months,
  s.monthly_net,
  s.runway_months,
  s.risk_level,
  s.final_balance,
  s.is_archived,
  s.created_at,
  s.id             AS scenario_id
FROM diocese.institution_simulator_scenarios s
LEFT JOIN diocese.institutions i ON i.id = s.institution_id
LEFT JOIN diocese.profiles     p ON p.id = s.created_by_id
WHERE s.deleted_at IS NULL
ORDER BY s.created_at DESC;

-- ── Saved priest reassignment scenarios ───────────────────────────────────────

CREATE OR REPLACE VIEW debug.v_priest_scenarios AS
SELECT
  s.priest_name,
  tp.institution_code AS target_parish_code,
  s.target_parish_name,
  p.profile_code      AS created_by_code,
  p.full_name         AS created_by_name,
  s.name              AS scenario_name,
  s.transition_support,
  s.handoff_weeks,
  s.timeline_months,
  s.fit_score,
  s.target_lift,
  s.vacated_parish_dip,
  s.diocese_lift,
  s.transition_risk,
  s.risk_band,
  s.confidence,
  s.is_archived,
  s.created_at,
  s.id                AS scenario_id
FROM diocese.priest_reassignment_scenarios s
LEFT JOIN diocese.institutions tp ON tp.id = s.target_parish_id
LEFT JOIN diocese.profiles     p  ON p.id  = s.created_by_id
WHERE s.deleted_at IS NULL
ORDER BY s.created_at DESC;

-- ── Parish financial records ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW debug.v_parish_financials AS
SELECT
  i.institution_code,
  i.name AS parish_name,
  fr.year,
  fr.month,
  fr.status,
  fr.validation_status,
  fr.version_no,
  fr.is_current_version,
  fr.net_receipts,
  fr.beginning_balance,
  fr.ending_balance_after_remit,
  fr.remittance_to_diocese,
  fr.submitted_at,
  fr.id AS record_id
FROM parishes.financial_records fr
LEFT JOIN diocese.institutions i ON i.id = fr.institution_id
WHERE fr.deleted_at IS NULL
ORDER BY i.institution_code, fr.year DESC, fr.month;

-- ── Audit logs ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW debug.v_audit_logs AS
SELECT
  p.profile_code,
  COALESCE(p.full_name, al.user_name) AS user_name,
  COALESCE(al.user_role, al.role)     AS user_role,
  i.institution_code,
  al.category,
  al.severity,
  al.action,
  al.detail,
  al.is_system,
  al.occurred_at,
  al.id AS log_id
FROM diocese.audit_logs al
LEFT JOIN diocese.profiles     p ON p.id = al.user_id
LEFT JOIN diocese.institutions i ON i.id = al.institution_id
WHERE al.deleted_at IS NULL
ORDER BY al.occurred_at DESC;

-- ── Priest health records ─────────────────────────────────────────────────────
-- Note: the priest is stored as a plain name (no FK); only the record creator
-- links to profiles via created_by_user_id.

CREATE OR REPLACE VIEW debug.v_priest_health AS
SELECT
  phr.name AS priest_name,
  phr.position,
  phr.parish,
  phr.health_status,
  phr.last_checkup,
  p.profile_code AS created_by_code,
  p.full_name    AS created_by_name,
  phr.created_at,
  phr.id AS record_id
FROM diocese.priest_health_records phr
LEFT JOIN diocese.profiles p ON p.id = phr.created_by_user_id
WHERE phr.deleted_at IS NULL
ORDER BY phr.name;
