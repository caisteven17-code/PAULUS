-- Run this only if the tables already exist with `entity_*` column names.

ALTER TABLE diocese.institutions
  RENAME COLUMN entity_type TO institution_type;

ALTER TABLE parishes.financial_records
  RENAME COLUMN entity_class TO institution_class;

ALTER TABLE schools.financial_records
  RENAME COLUMN entity_class TO institution_class;

ALTER TABLE seminaries.financial_records
  RENAME COLUMN entity_class TO institution_class;

ALTER TABLE shared_analytics.dim_institutions
  RENAME COLUMN entity_type TO institution_type;

