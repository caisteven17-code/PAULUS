-- Migration 0005: Digital Twin sandbox scenarios
-- Stores bishop-only Digital Twin counterfactual scenarios (adjusted values +
-- historical replay results). Strictly private to the creator — every backend
-- query filters by created_by_id, same pattern as institution_simulator_scenarios.
-- This table is sandbox-only: the analytics pipeline never reads from it and
-- official financial_records are never written from it.

CREATE TABLE IF NOT EXISTS diocese.digital_twin_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OWNERSHIP (scenarios are visible only to their creator)
  created_by_id uuid NOT NULL REFERENCES diocese.profiles(id) ON DELETE CASCADE,

  -- INSTITUTION CLASSIFICATION
  institution_type text NOT NULL CHECK (institution_type IN ('parish', 'seminary', 'school')),
  institution_id uuid,  -- soft reference; null when launched from demo/fallback profiles
  institution_name text,  -- cached for UI display

  -- SCENARIO METADATA
  name text NOT NULL,
  description text,

  -- COUNTERFACTUAL STARTING POINT (which past period the bishop modified)
  starting_month smallint CHECK (starting_month BETWEEN 1 AND 12),
  starting_year smallint,

  -- SANDBOX VALUES (the bishop's adjusted figures; SandboxState JSON)
  modified_values jsonb NOT NULL,

  -- REPLAY RESULTS (static snapshot at time of save: actual vs counterfactual trajectories)
  replay_results jsonb,
  calculated_at timestamptz,

  -- STATE
  is_archived boolean NOT NULL DEFAULT false,

  -- TIMESTAMPS
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_digital_twin_scenarios_user
  ON diocese.digital_twin_scenarios(created_by_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_digital_twin_scenarios_entity
  ON diocese.digital_twin_scenarios(institution_type, institution_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_digital_twin_scenarios_created
  ON diocese.digital_twin_scenarios(created_at DESC)
  WHERE deleted_at IS NULL;
