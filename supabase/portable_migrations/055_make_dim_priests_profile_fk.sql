-- Run this only if `priest_assignment_analytics.dim_priests` already exists.
-- Assumes every priest must have a profile.

ALTER TABLE priest_assignment_analytics.dim_priests
  ALTER COLUMN profile_id SET NOT NULL;

ALTER TABLE priest_assignment_analytics.dim_priests
  ADD CONSTRAINT dim_priests_profile_id_unique UNIQUE (profile_id);

ALTER TABLE priest_assignment_analytics.dim_priests
  ADD CONSTRAINT dim_priests_profile_id_fkey
  FOREIGN KEY (profile_id)
  REFERENCES diocese.profiles(id);

