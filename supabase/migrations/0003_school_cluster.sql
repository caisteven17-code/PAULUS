-- Migration: Change schools vicariate field to cluster (numeric: 1, 2, 3)
-- This migration updates the diocesan_schools table to use a cluster field instead of vicariate

-- Add the new cluster column as nullable first
ALTER TABLE schools.details
ADD COLUMN cluster INTEGER;

-- Update existing records to have a default cluster value
-- Assuming schools with vicariate 'San Pablo' belong to different clusters
UPDATE schools.details
SET cluster =
  CASE
    WHEN name = 'Liceo de San Pablo' THEN 1
    WHEN name = 'Canossa College San Pablo' THEN 2
    ELSE 1
  END
WHERE cluster IS NULL;

-- Make cluster NOT NULL with default
ALTER TABLE schools.details
ALTER COLUMN cluster SET DEFAULT 1;

ALTER TABLE schools.details
ALTER COLUMN cluster SET NOT NULL;

-- Drop the old vicariate column (keeping a backup first would be recommended in production)
ALTER TABLE schools.details
DROP COLUMN vicariate;
