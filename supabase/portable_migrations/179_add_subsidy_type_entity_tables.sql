-- Migration 179: Add subsidy_type column to entity detail tables
-- Tracks whether a parish, seminary, or school is subsidized or independent

-- Add subsidy_type to parishes
ALTER TABLE parishes.details
ADD COLUMN subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Add subsidy_type to seminaries
ALTER TABLE seminaries.details
ADD COLUMN subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Add subsidy_type to diocesan_schools (schools.details)
ALTER TABLE schools.details
ADD COLUMN subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Create indexes for better query performance
CREATE INDEX idx_parishes_details_subsidy_type ON parishes.details(subsidy_type);
CREATE INDEX idx_seminaries_details_subsidy_type ON seminaries.details(subsidy_type);
CREATE INDEX idx_schools_details_subsidy_type ON schools.details(subsidy_type);
