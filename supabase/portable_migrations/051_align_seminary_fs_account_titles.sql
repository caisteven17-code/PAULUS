-- Run this if you already created the database before `050_seminaries.sql` was updated.
-- It aligns `seminaries.fs_account_titles` closer to `seminary_analytics.dim_seminary_fs_account`.

ALTER TABLE seminaries.fs_account_titles
  ADD COLUMN IF NOT EXISTS classification text;

UPDATE seminaries.fs_account_titles
SET classification = COALESCE(
  classification,
  expense_category,
  receipt_category,
  expense_group,
  receipt_group
)
WHERE classification IS NULL;

ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS source_template;
ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS source_sheet_name;
ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS source_row_number;

-- Optional cleanup after you confirm no code depends on the old columns:
-- ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS receipt_group;
-- ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS receipt_category;
-- ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS expense_group;
-- ALTER TABLE seminaries.fs_account_titles DROP COLUMN IF EXISTS expense_category;
