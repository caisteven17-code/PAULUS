-- Migration 180: Add subsidy_type column to diocese.institutions
-- Centralized institution table to track subsidy type

ALTER TABLE diocese.institutions
ADD COLUMN IF NOT EXISTS subsidy_type TEXT DEFAULT 'subsidized' CHECK (subsidy_type IN ('subsidized', 'independent'));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_institutions_subsidy_type ON diocese.institutions(subsidy_type);
