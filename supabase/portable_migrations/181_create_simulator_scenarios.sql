-- Migration 181: Create simulator scenarios tables
-- Stores saved what-if scenarios for institution financial simulations and priest reassignments
-- Results are static snapshots from when the scenario was saved (audit trail)

-- Table 1: Institution Financial Simulator Scenarios (parishes, seminaries, schools)
CREATE TABLE IF NOT EXISTS diocese.institution_simulator_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OWNERSHIP
  created_by_id uuid NOT NULL REFERENCES diocese.profiles(id) ON DELETE CASCADE,

  -- INSTITUTION CLASSIFICATION
  institution_type text NOT NULL CHECK (institution_type IN ('parish', 'seminary', 'school')),
  institution_id uuid NOT NULL,  -- soft reference (can be deleted, scenario preserved)
  institution_name text,  -- cached for UI display

  -- SCENARIO METADATA
  name text NOT NULL,
  description text,

  -- INPUT PARAMETERS (saved so user can apply them again)
  income_change numeric(5, 2) NOT NULL DEFAULT 0,        -- % change to collections/tuition/formation income
  expenses_change numeric(5, 2) NOT NULL DEFAULT 0,      -- % change to operating expenses
  one_time_income numeric(14, 2) NOT NULL DEFAULT 0,     -- PHP
  one_time_expense numeric(14, 2) NOT NULL DEFAULT 0,    -- PHP
  external_support numeric(14, 2) NOT NULL DEFAULT 0,    -- diocesan subsidy / mission support / external support (PHP)
  timeline_months smallint NOT NULL DEFAULT 12,          -- 3, 6, 12, or 24

  -- CALCULATED RESULTS (static snapshot at time of save)
  monthly_net numeric(14, 2),                            -- calculated monthly cash flow
  runway_months integer,                                 -- months until cash depleted (-1 if positive cash flow)
  risk_level text CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),  -- risk assessment
  final_balance numeric(14, 2),                          -- projected balance at end of timeline
  projected_data jsonb,                                  -- array of {month, baseline, simulated} for chart
  recommendation text,                                   -- analytics-based recommendation text
  calculated_at timestamptz,                             -- when results were calculated

  -- STATE
  is_archived boolean NOT NULL DEFAULT false,

  -- TIMESTAMPS
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_institution_scenarios_user
  ON diocese.institution_simulator_scenarios(created_by_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_institution_scenarios_entity
  ON diocese.institution_simulator_scenarios(institution_type, institution_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_institution_scenarios_created
  ON diocese.institution_simulator_scenarios(created_at DESC)
  WHERE deleted_at IS NULL;

---

-- Table 2: Priest Reassignment Simulator Scenarios
CREATE TABLE IF NOT EXISTS diocese.priest_reassignment_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OWNERSHIP
  created_by_id uuid NOT NULL REFERENCES diocese.profiles(id) ON DELETE CASCADE,

  -- PRIEST & TARGET PARISH
  priest_id uuid NOT NULL,  -- soft reference (can be deleted, scenario preserved)
  priest_name text,  -- cached for UI display
  target_parish_id uuid NOT NULL,  -- soft reference (can be deleted, scenario preserved)
  target_parish_name text,  -- cached for UI display

  -- SCENARIO METADATA
  name text NOT NULL,
  description text,

  -- INPUT PARAMETERS (saved so user can apply them again)
  transition_support text NOT NULL DEFAULT 'assisted'
    CHECK (transition_support IN ('standard', 'assisted', 'intensive')),
  handoff_weeks smallint NOT NULL DEFAULT 6,
  timeline_months smallint NOT NULL DEFAULT 12,

  -- CALCULATED RESULTS (static snapshot at time of save)
  fit_score integer,                                     -- priest-parish match score (0-100)
  target_lift integer,                                   -- expected gain for new parish
  vacated_parish_dip integer,                            -- expected loss for old parish
  diocese_lift integer,                                  -- net diocesan impact
  transition_risk integer,                               -- transition risk score (0-100)
  risk_band text CHECK (risk_band IN ('Low', 'Medium', 'High')),  -- risk level
  confidence integer,                                    -- confidence % (0-100)
  projected_data jsonb,                                  -- array of {month, stayCase, sourceParish, targetParish} for chart
  recommendation text,                                   -- analytics-based recommendation text
  calculated_at timestamptz,                             -- when results were calculated

  -- STATE
  is_archived boolean NOT NULL DEFAULT false,

  -- TIMESTAMPS
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_priest_scenarios_user
  ON diocese.priest_reassignment_scenarios(created_by_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_priest_scenarios_priest
  ON diocese.priest_reassignment_scenarios(priest_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_priest_scenarios_target_parish
  ON diocese.priest_reassignment_scenarios(target_parish_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_priest_scenarios_created
  ON diocese.priest_reassignment_scenarios(created_at DESC)
  WHERE deleted_at IS NULL;
