-- Run this only if the priest assignment analytics tables already exist.

ALTER TABLE priest_assignment_analytics.fact_priest_assignment_recommendations
  DROP COLUMN IF EXISTS institution_type;

ALTER TABLE priest_assignment_analytics.fact_priest_assignments
  DROP COLUMN IF EXISTS institution_type;

