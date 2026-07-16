-- View-only query: total parish operating expenses per parish, year, and month.
-- This does not create, update, or delete anything.
--
-- Operating expenses here include:
-- - salaries, wages, and benefits
-- - government contributions
-- - utilities
-- - communications
-- - other rectory expenses
--
-- To see only one month, uncomment the two marked filter lines below.
-- Example: January 2023.

SELECT
  i.id AS institution_id,
  i.institution_code,
  i.name AS parish_name,
  fr.year,
  public.month_short_to_int(fr.month)::smallint AS month_number,
  fr.month AS month,
  (
    COALESCE(fr.salaries_wages_benefits, 0)
    + COALESCE(fr.govt_contributions, 0)
    + COALESCE(fr.utilities, 0)
    + COALESCE(fr.communications, 0)
    + COALESCE(fr.other_rectory_expenses, 0)
  )::numeric(14, 2) AS total_parish_operating_expenses
FROM diocese.institutions i
JOIN parishes.financial_records fr
  ON fr.institution_id = i.id
  AND fr.is_current_version = true
  AND fr.deleted_at IS NULL
WHERE i.institution_type = 'parish'
  AND i.deleted_at IS NULL
  -- AND fr.year = 2023
  -- AND fr.month = 'Jan'
ORDER BY
  i.name,
  fr.year,
  month_number;
