-- View-only query: total prescribed amount per parish, year, and month.
-- This does not create, update, or delete anything.
--
-- To see only one month, uncomment the two marked filter lines below.
-- Example: January 2023.

SELECT
  i.id AS institution_id,
  i.name AS parish_name,
  fr.year,
  public.month_short_to_int(fr.month)::smallint AS month_number,
  fr.month AS month,
  COALESCE(
    SUM(li.amount) FILTER (
      WHERE COALESCE(at.section_code, li.section_code) = 'A'
        AND (
          at.account_name ILIKE '%Total Prescribed Amount%'
          OR li.item_label ILIKE '%Total Prescribed Amount%'
        )
    ),
    0
  )::numeric(14, 2) AS total_prescribed_amount
FROM diocese.institutions i
LEFT JOIN parishes.financial_records fr
  ON fr.institution_id = i.id
  AND fr.is_current_version = true
  AND fr.deleted_at IS NULL
LEFT JOIN parishes.iafr_line_items li
  ON li.financial_record_id = fr.id
  AND li.deleted_at IS NULL
LEFT JOIN parishes.iafr_account_titles at ON at.id = li.account_title_id
WHERE i.institution_type = 'parish'
  AND i.deleted_at IS NULL
  -- AND fr.year = 2023
  -- AND fr.month = 'Jan'
GROUP BY
  i.id,
  i.name,
  fr.year,
  fr.month
ORDER BY
  i.name,
  fr.year,
  month_number;
