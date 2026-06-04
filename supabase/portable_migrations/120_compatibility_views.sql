-- Shared compatibility layer for current app migration.

CREATE OR REPLACE VIEW shared_analytics.diocesan_consolidated_financials AS
SELECT
  'parish'::text AS entity_type,
  i.id AS institution_id,
  r.month,
  r.year,
  (
    r.sacraments_total +
    r.confirmation_total +
    r.mass_intentions_total +
    r.mass_collection_weekday +
    r.mass_collection_sunday +
    r.mass_collection_saturday +
    r.consumable_collections +
    r.other_collections_total +
    r.donations +
    r.interest_income +
    r.subsidy_inflow +
    r.special_collections +
    r.second_collections +
    r.charge_over_above +
    r.other_receipts +
    r.construction_receipts
  )::numeric(14, 2) AS total_inflow,
  (
    r.priest_share +
    r.mass_stipend +
    r.other_pastoral_expenses +
    r.salaries_wages_benefits +
    r.govt_contributions +
    r.utilities +
    r.communications +
    r.other_rectory_expenses +
    r.construction_expenses +
    r.remittance_to_diocese +
    r.bishops_fund_share +
    r.special_collections_remittance
  )::numeric(14, 2) AS total_outflow,
  r.net_receipts,
  (
    r.remittance_to_diocese +
    r.bishops_fund_share +
    r.special_collections_remittance
  )::numeric(14, 2) AS diocesan_share_inflow
FROM parishes.financial_records r
JOIN diocese.institutions i ON i.id = r.institution_id
WHERE r.is_current_version = true
  AND r.deleted_at IS NULL

UNION ALL

SELECT
  'school'::text AS entity_type,
  i.id AS institution_id,
  r.month,
  r.year,
  (
    r.tuition_revenues +
    r.miscellaneous_fees +
    r.other_income +
    r.subsidy_inflow
  )::numeric(14, 2) AS total_inflow,
  (
    r.faculty_payroll +
    r.admin_staff_payroll +
    r.utilities +
    r.facilities_maintenance +
    r.supplies +
    r.other_expenses
  )::numeric(14, 2) AS total_outflow,
  r.net_receipts,
  0::numeric(14, 2) AS diocesan_share_inflow
FROM schools.financial_records r
JOIN diocese.institutions i ON i.id = r.institution_id
WHERE r.is_current_version = true
  AND r.deleted_at IS NULL

UNION ALL

SELECT
  'seminary'::text AS entity_type,
  i.id AS institution_id,
  r.month,
  r.year,
  (
    r.donations +
    r.seminary_fees +
    r.mass_collections +
    r.other_sources +
    r.subsidy_from_rbscp
  )::numeric(14, 2) AS total_inflow,
  r.total_expenses::numeric(14, 2) AS total_outflow,
  r.net_surplus::numeric(14, 2) AS net_receipts,
  0::numeric(14, 2) AS diocesan_share_inflow
FROM seminaries.financial_records r
JOIN diocese.institutions i ON i.id = r.institution_id
WHERE r.is_current_version = true
  AND r.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.financial_records_compat AS
SELECT
  institution_id AS entity_id,
  entity_type,
  month,
  year,
  total_inflow,
  total_outflow,
  net_receipts,
  diocesan_share_inflow
FROM shared_analytics.diocesan_consolidated_financials;

