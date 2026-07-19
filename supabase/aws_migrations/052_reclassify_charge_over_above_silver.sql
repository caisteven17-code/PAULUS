-- Align AWS Silver with the corrected Supabase B.3.06 classification.
-- Exact matching excludes the aggregate and sacrament-detail line labels.

UPDATE parish_silver.financial_line_items l
SET source_account_title_id = a.source_account_title_id,
    account_code = a.account_code,
    account_name = a.account_name,
    section_code = a.section_code,
    subsection_code = a.subsection_code,
    source_updated_at = now(),
    transformed_at = now()
FROM parish_analytics.dim_iafr_account a
WHERE a.account_code = 'B.3.06'
  AND l.account_code = 'A.1.11'
  AND lower(regexp_replace(btrim(COALESCE(l.item_label, l.source_label, '')), '\s+', ' ', 'g'))
      IN ('charge over/above', 'charge over / above');
