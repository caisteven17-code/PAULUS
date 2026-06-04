-- Run this only if `seminaries.details` already exists with these columns.

ALTER TABLE seminaries.details
  DROP COLUMN IF EXISTS enrollment_count,
  DROP COLUMN IF EXISTS capacity_count,
  DROP COLUMN IF EXISTS staff_count;

