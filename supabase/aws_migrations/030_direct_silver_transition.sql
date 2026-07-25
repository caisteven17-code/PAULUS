-- Decouple silver lineage from the temporary AWS bronze comparison copy.
-- Source UUIDs remain stored as lineage values; only silver-owned relationships
-- and warehouse-control run references remain enforced locally.

ALTER TABLE parish_silver.financial_line_items
  DROP CONSTRAINT IF EXISTS financial_line_items_institution_id_fkey;

ALTER TABLE parish_silver.financial_records
  DROP CONSTRAINT IF EXISTS financial_records_source_record_id_fkey,
  DROP CONSTRAINT IF EXISTS financial_records_institution_id_fkey,
  DROP CONSTRAINT IF EXISTS financial_records_submission_batch_id_fkey;

