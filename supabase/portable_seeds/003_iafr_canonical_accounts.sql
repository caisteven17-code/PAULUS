-- Final IAFR canonical account seed for the PUSHER financial import.
-- Source planning reference: IAFR SAMPLE.xlsx, 2024-2026 layouts.
--
-- This seed is intentionally idempotent:
-- - removes old canonical accounts for a fresh IAFR chart
-- - inserts missing final IAFR canonical accounts
-- - updates matching final IAFR account_code values if rerun
--
-- Run this before importing financial records. If line items already reference
-- old account titles, this delete will be blocked by the foreign key and the
-- safer soft-deactivation approach should be used instead.

DELETE FROM parishes.iafr_account_titles;

INSERT INTO parishes.iafr_account_titles (
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification,
  parent_account_code,
  source_template,
  source_sheet_name,
  is_active
)
VALUES
  -- A. Pastoral Fund Receipts
  ('A', 'sacraments', 'A.1.01', 'Baptism - General / Regular', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.01.01', 'Baptism - General / Regular - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.01', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.01.02', 'Baptism - General / Regular - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.01', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.02', 'Baptism - Infant', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.02.01', 'Baptism - Infant - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.02', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.02.02', 'Baptism - Infant - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.02', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.03', 'Baptism - Adult', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.03.01', 'Baptism - Adult - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.03', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.03.02', 'Baptism - Adult - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.03', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.04', 'Wedding with Mass', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.04.01', 'Wedding with Mass - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.04', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.04.02', 'Wedding with Mass - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.04', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.05', 'Wedding without Mass', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.05.01', 'Wedding without Mass - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.05', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.05.02', 'Wedding without Mass - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.05', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.06', 'Funeral Mass', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.06.01', 'Funeral Mass - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.06', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.06.02', 'Funeral Mass - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.06', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.07', 'Funeral Blessings', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.07.01', 'Funeral Blessings - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.07', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.07.02', 'Funeral Blessings - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.07', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.08', 'Certificates', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.08.01', 'Certificates - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.08', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.08.02', 'Certificates - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.08', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.09', 'Marriage Banns', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.09.01', 'Marriage Banns - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.09', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.09.02', 'Marriage Banns - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.09', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.10', 'Permits', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.10.01', 'Permits - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.10', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.1.10.02', 'Permits - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.1.10', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacraments', 'A.1.11', 'Charge Over and Above', 'receipt', 'pastoral_fund_receipts', 'A.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'confirmation', 'A.2.01', 'Confirmation', 'receipt', 'pastoral_fund_receipts', 'A.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.2.01.01', 'Confirmation - Total Prescribed Amount', 'receipt', 'pastoral_fund_receipts', 'A.2.01', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'sacrament_breakdown', 'A.2.01.02', 'Confirmation - Total Over/Above Amount', 'receipt', 'pastoral_fund_receipts', 'A.2.01', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'mass_intentions', 'A.3.01', 'Mass Intentions - Total Receipts', 'receipt', 'pastoral_fund_receipts', 'A.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'mass_intentions', 'A.3.02', 'Mass Intentions - Claimed by Parish Priest', 'personal_contribution', 'pastoral_fund_receipts', 'A.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('A', 'mass_intentions', 'A.3.03', 'Mass Intentions - Unclaimed', 'receipt', 'pastoral_fund_receipts', 'A.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),

  -- B. Parish Fund Receipts
  ('B', 'mass_collections', 'B.1.01', 'Weekday Collections', 'receipt', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'mass_collections', 'B.1.02', 'Sunday Collections', 'receipt', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'mass_collections', 'B.1.03', 'Saturday Anticipated Mass Collections', 'receipt', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'mass_collections', 'B.1.04', 'Tax Rate', 'memo', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'mass_collections', 'B.1.05', 'Weekday Collections Including Envelopes', 'receipt', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'mass_collections', 'B.1.06', 'Sunday Collections Including Envelopes', 'receipt', 'parish_fund_receipts', 'B.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.01', 'Rentals', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.02', 'Mortuary / Columbary', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.03', 'Kandilaan', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.04', 'Donation Boxes', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.05', 'Envelopes', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_collections', 'B.2.06', 'Other Sources', 'receipt', 'parish_fund_receipts', 'B.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.01', 'Donations', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.02', 'Interest Income from Bank Accounts', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.03', 'Subsidy from Diocese', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.04', 'Special Collections', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.05', 'Second Collections', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.06', 'Charge Over / Above', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('B', 'other_receipts', 'B.3.07', 'Other Receipts', 'receipt', 'parish_fund_receipts', 'B.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),

  -- C. Pastoral Fund Expenses
  ('C', 'priest_share', 'C.1.01', 'Sacraments - Priest Share', 'expense', 'pastoral_fund_expenses', 'C.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'priest_share', 'C.1.02', 'Mass Intentions - Priest Share', 'expense', 'pastoral_fund_expenses', 'C.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'priest_share', 'C.1.03', 'Confirmation - Priest Share', 'expense', 'pastoral_fund_expenses', 'C.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'priest_share', 'C.1.04', 'Confirmation Minister - Priest', 'expense', 'pastoral_fund_expenses', 'C.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'priest_share', 'C.1.05', 'Others - Priest Share', 'expense', 'pastoral_fund_expenses', 'C.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'mass_stipend', 'C.2.01', 'Parish Priest Stipend / Share', 'expense', 'pastoral_fund_expenses', 'C.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'mass_stipend', 'C.2.02', 'Parochial Vicar Stipend', 'expense', 'pastoral_fund_expenses', 'C.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'mass_stipend', 'C.2.03', 'Guest Priest Stipend', 'expense', 'pastoral_fund_expenses', 'C.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'mass_stipend', 'C.2.04', 'Parish and Guest Priest Stipend', 'expense', 'pastoral_fund_expenses', 'C.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'other_pastoral_expenses', 'C.3.01', 'Confirmation Minister - Others', 'expense', 'pastoral_fund_expenses', 'C.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('C', 'other_pastoral_expenses', 'C.3.02', 'Other Pastoral Expense', 'expense', 'pastoral_fund_expenses', 'C.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),

  -- D. Parish Operating and Rectory Expenses
  ('D', 'salaries_wages_benefits', 'D.1.01', 'Salaries and Wages - Employees', 'expense', 'parish_operating_expenses', 'D.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'salaries_wages_benefits', 'D.1.02', 'Remuneration - Priests / Deacons / Nuns', 'expense', 'parish_operating_expenses', 'D.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'salaries_wages_benefits', 'D.1.03', 'Other Compensations / Allowances', 'expense', 'parish_operating_expenses', 'D.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'salaries_wages_benefits', 'D.1.04', '13th Month and Bonuses', 'expense', 'parish_operating_expenses', 'D.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'government_contributions', 'D.2.01', 'SSS Contributions', 'expense', 'parish_operating_expenses', 'D.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'government_contributions', 'D.2.02', 'HDMF / Pag-IBIG Contributions', 'expense', 'parish_operating_expenses', 'D.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'government_contributions', 'D.2.03', 'PHIC / PhilHealth Contributions', 'expense', 'parish_operating_expenses', 'D.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'utilities', 'D.3.01', 'Electric Bill', 'expense', 'parish_operating_expenses', 'D.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'utilities', 'D.3.02', 'Water Bill', 'expense', 'parish_operating_expenses', 'D.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'postage_communications', 'D.4.01', 'Telephone Bill', 'expense', 'parish_operating_expenses', 'D.4', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'postage_communications', 'D.4.02', 'Cable Bill', 'expense', 'parish_operating_expenses', 'D.4', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'postage_communications', 'D.4.03', 'Internet Bill', 'expense', 'parish_operating_expenses', 'D.4', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'postage_communications', 'D.4.04', 'Mailing Expenses', 'expense', 'parish_operating_expenses', 'D.4', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'postage_communications', 'D.4.05', 'Telephone, Internet, and Communication Expense', 'expense', 'parish_operating_expenses', 'D.4', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.01', 'Food and Groceries', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.02', 'Meetings and Representations', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.03', 'Gasoline Expenses', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.04', 'Transportation and Related Expenses', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.05', 'Office Expenses and Supplies', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.06', 'Security Services', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.07', 'Liturgical Paraphernalia', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.08', 'Parish Real Properties', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.09', 'Repairs and Maintenance Expenses', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.10', 'Charitable Contributions', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.11', 'Subscriptions and Newspapers', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.12', 'Hospital and Medicine Expenses', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('D', 'other_parish_rectory_expenses', 'D.5.13', 'Other Expenses', 'expense', 'parish_operating_expenses', 'D.5', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),

  -- E. Construction Receipts and Disbursements
  ('E', 'construction_receipts', 'E.1.01', 'Construction Donations', 'receipt', 'construction', 'E.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_receipts', 'E.1.02', 'Borrowings from Banks', 'receipt', 'construction', 'E.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_receipts', 'E.1.03', 'Borrowings from Other Parishes', 'receipt', 'construction', 'E.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_receipts', 'E.1.04', 'Construction Other Receipts', 'receipt', 'construction', 'E.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_expenses', 'E.2.01', 'Labor and Materials', 'expense', 'construction', 'E.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_expenses', 'E.2.02', 'Payment of Borrowings from Banks', 'expense', 'construction', 'E.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_expenses', 'E.2.03', 'Payment of Borrowings from Other Parishes', 'expense', 'construction', 'E.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('E', 'construction_expenses', 'E.2.04', 'Construction Other Expenses', 'expense', 'construction', 'E.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),

  -- F. Remittances
  ('F', 'remittance_to_diocese', 'F.1.01', 'Sacraments - Diocese Share', 'remittance', 'remittance', 'F.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'remittance_to_diocese', 'F.1.02', 'Confirmation - Diocese Fund', 'remittance', 'remittance', 'F.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'remittance_to_diocese', 'F.1.03', 'Confirmation - Pension Fund', 'remittance', 'remittance', 'F.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'remittance_to_diocese', 'F.1.04', 'Progressive Tax Collections - Diocese Share', 'remittance', 'remittance', 'F.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'remittance_to_diocese', 'F.1.05', '5% Tax Collections - Diocese Share', 'remittance', 'remittance', 'F.1', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'bishops_fund_share', 'F.2.01', 'Confirmation - Bishop''s Share', 'remittance', 'remittance', 'F.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'bishops_fund_share', 'F.2.02', 'Confirmation Minister - Bishop', 'remittance', 'remittance', 'F.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'bishops_fund_share', 'F.2.03', 'Others - Bishop Share', 'remittance', 'remittance', 'F.2', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true),
  ('F', 'special_collections', 'F.3.01', 'Special Collections', 'remittance', 'remittance', 'F.3', 'IAFR_SAMPLE_2024_2026', 'IAFR SAMPLE.xlsx', true)
ON CONFLICT (account_code) DO UPDATE SET
  section_code = EXCLUDED.section_code,
  subsection_code = EXCLUDED.subsection_code,
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  classification = EXCLUDED.classification,
  parent_account_code = EXCLUDED.parent_account_code,
  source_template = EXCLUDED.source_template,
  source_sheet_name = EXCLUDED.source_sheet_name,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();
