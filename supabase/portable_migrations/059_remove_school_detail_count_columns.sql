-- Run this only if `schools.details` already exists with these columns.

ALTER TABLE schools.details
  DROP COLUMN IF EXISTS enrollment_count,
  DROP COLUMN IF EXISTS capacity_count,
  DROP COLUMN IF EXISTS staff_count;

