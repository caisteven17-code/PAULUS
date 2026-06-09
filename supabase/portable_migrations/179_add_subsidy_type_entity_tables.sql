-- Migration 179: Add subsidy_type column to entity detail tables
-- Tracks whether a parish, seminary, or school is subsidized or independent

-- Add subsidy_type to parishes
ALTER TABLE parishes.details
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Add subsidy_type to seminaries
ALTER TABLE seminaries.details
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Add subsidy_type to diocesan_schools (schools.details)
ALTER TABLE schools.details
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_parishes_details_subsidy_type ON parishes.details(subsidy_type);
CREATE INDEX IF NOT EXISTS idx_seminaries_details_subsidy_type ON seminaries.details(subsidy_type);
CREATE INDEX IF NOT EXISTS idx_schools_details_subsidy_type ON schools.details(subsidy_type);

-- The backend syncs subsidy_type with the service role.
GRANT SELECT, INSERT, UPDATE ON parishes.details TO service_role;
GRANT SELECT, INSERT, UPDATE ON seminaries.details TO service_role;
GRANT SELECT, INSERT, UPDATE ON schools.details TO service_role;
