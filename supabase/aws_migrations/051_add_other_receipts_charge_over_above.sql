-- Add the B.3.06 Charge Over / Above receipt account to the versioned
-- parish monthly formula. This is distinct from sacramental A.*.02 charges.

DELETE FROM warehouse_control.parish_metric_account_rules
WHERE formula_version = 'parish_monthly_v1'
  AND metric_name = 'collections_other_receipts'
  AND account_code = 'B.3.06';

INSERT INTO warehouse_control.parish_metric_account_rules (
  formula_version,
  metric_name,
  effective_start_year,
  effective_end_year,
  account_code,
  rule_role,
  multiplier,
  allocation_priority,
  notes
)
VALUES (
  'parish_monthly_v1',
  'collections_other_receipts',
  2021,
  2025,
  'B.3.06',
  'include',
  1,
  30,
  'Charge Over / Above'
);
