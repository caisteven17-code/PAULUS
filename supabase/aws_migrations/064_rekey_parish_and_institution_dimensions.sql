-- One-time analytical key compaction.
-- Aligns the 92 current parish and institution dimension rows to keys 1..92.
-- Operational Supabase UUIDs and official institution codes are unchanged.

BEGIN;

LOCK TABLE
  shared_analytics.dim_institutions,
  parish_analytics.dim_parishes,
  priest_assignment_analytics.dim_priests,
  priest_assignment_analytics.fact_priest_assignment_recommendations,
  priest_assignment_analytics.fact_priest_assignments,
  school_analytics.dim_schools,
  seminary_analytics.dim_seminaries,
  shared_analytics.fact_subsidy_allocations,
  parish_analytics.fact_parish_anomaly_alerts,
  parish_analytics.fact_parish_financial_breakdowns,
  parish_analytics.fact_parish_financial_forecasts,
  parish_analytics.fact_parish_health_snapshots,
  parish_analytics.fact_parish_monthly_financials
IN ACCESS EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS warehouse_control.analytics_key_rekey_history (
  batch_id uuid NOT NULL,
  key_domain text NOT NULL CHECK (key_domain IN ('parish_key', 'institution_key')),
  old_key integer NOT NULL,
  new_key integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, key_domain, old_key),
  UNIQUE (batch_id, key_domain, new_key)
);

CREATE TEMP TABLE _rekey_context ON COMMIT DROP AS
SELECT gen_random_uuid() AS batch_id;

CREATE TEMP TABLE _parish_key_map ON COMMIT DROP AS
SELECT
  parish_key AS old_key,
  row_number() OVER (ORDER BY parish_key)::integer AS new_key,
  institution_key AS old_institution_key
FROM parish_analytics.dim_parishes;

CREATE TEMP TABLE _institution_key_map ON COMMIT DROP AS
SELECT
  parish.old_institution_key AS old_key,
  parish.new_key
FROM _parish_key_map parish;

DO $$
DECLARE
  parish_rows integer;
  institution_rows integer;
  parish_mapping_rows integer;
  institution_mapping_rows integer;
BEGIN
  SELECT count(*) INTO parish_rows FROM parish_analytics.dim_parishes;
  SELECT count(*) INTO institution_rows FROM shared_analytics.dim_institutions;
  SELECT count(*) INTO parish_mapping_rows FROM _parish_key_map;
  SELECT count(*) INTO institution_mapping_rows FROM _institution_key_map;

  IF parish_rows <> 92 OR institution_rows <> 92 THEN
    RAISE EXCEPTION 'Expected 92 parish and 92 institution rows; found % and %',
      parish_rows, institution_rows;
  END IF;
  IF parish_mapping_rows <> parish_rows OR institution_mapping_rows <> institution_rows THEN
    RAISE EXCEPTION 'Incomplete key mapping';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shared_analytics.dim_institutions institution
    LEFT JOIN _institution_key_map mapping ON mapping.old_key = institution.institution_key
    WHERE mapping.old_key IS NULL
  ) THEN
    RAISE EXCEPTION 'An institution is not represented by the parish mapping';
  END IF;
  IF EXISTS (
    SELECT new_key FROM _parish_key_map GROUP BY new_key HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT new_key FROM _institution_key_map GROUP BY new_key HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'The new key mapping is not one-to-one';
  END IF;
END;
$$;

INSERT INTO warehouse_control.analytics_key_rekey_history (
  batch_id, key_domain, old_key, new_key
)
SELECT context.batch_id, 'parish_key', mapping.old_key, mapping.new_key
FROM _parish_key_map mapping
CROSS JOIN _rekey_context context
UNION ALL
SELECT context.batch_id, 'institution_key', mapping.old_key, mapping.new_key
FROM _institution_key_map mapping
CROSS JOIN _rekey_context context;

-- Temporarily remove all foreign keys that reference either changing key.
ALTER TABLE parish_analytics.dim_parishes
  DROP CONSTRAINT dim_parishes_institution_key_fkey;
ALTER TABLE priest_assignment_analytics.dim_priests
  DROP CONSTRAINT dim_priests_current_institution_key_fkey;
ALTER TABLE priest_assignment_analytics.fact_priest_assignment_recommendations
  DROP CONSTRAINT fact_priest_assignment_recommendations_institution_key_fkey;
ALTER TABLE priest_assignment_analytics.fact_priest_assignments
  DROP CONSTRAINT fact_priest_assignments_institution_key_fkey;
ALTER TABLE school_analytics.dim_schools
  DROP CONSTRAINT dim_schools_institution_key_fkey;
ALTER TABLE seminary_analytics.dim_seminaries
  DROP CONSTRAINT dim_seminaries_institution_key_fkey;
ALTER TABLE shared_analytics.fact_subsidy_allocations
  DROP CONSTRAINT fact_subsidy_allocations_institution_key_fkey;

ALTER TABLE parish_analytics.fact_parish_anomaly_alerts
  DROP CONSTRAINT fact_parish_anomaly_alerts_parish_key_fkey;
ALTER TABLE parish_analytics.fact_parish_financial_breakdowns
  DROP CONSTRAINT fact_parish_financial_breakdowns_parish_key_fkey;
ALTER TABLE parish_analytics.fact_parish_financial_forecasts
  DROP CONSTRAINT fact_parish_financial_forecasts_parish_key_fkey;
ALTER TABLE parish_analytics.fact_parish_health_snapshots
  DROP CONSTRAINT fact_parish_health_snapshots_parish_key_fkey;
ALTER TABLE parish_analytics.fact_parish_monthly_financials
  DROP CONSTRAINT fact_parish_monthly_financials_parish_key_fkey;

-- Rekey parish references through negative temporary values so existing
-- positive keys cannot collide during the in-place update.
UPDATE parish_analytics.fact_parish_anomaly_alerts child
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE child.parish_key = mapping.old_key;

UPDATE parish_analytics.fact_parish_financial_breakdowns child
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE child.parish_key = mapping.old_key;

UPDATE parish_analytics.fact_parish_financial_forecasts child
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE child.parish_key = mapping.old_key;

UPDATE parish_analytics.fact_parish_health_snapshots child
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE child.parish_key = mapping.old_key;

UPDATE parish_analytics.fact_parish_monthly_financials child
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE child.parish_key = mapping.old_key;

UPDATE parish_analytics.dim_parishes parent
SET parish_key = -mapping.new_key
FROM _parish_key_map mapping
WHERE parent.parish_key = mapping.old_key;

UPDATE parish_analytics.dim_parishes SET parish_key = -parish_key WHERE parish_key < 0;
UPDATE parish_analytics.fact_parish_anomaly_alerts SET parish_key = -parish_key WHERE parish_key < 0;
UPDATE parish_analytics.fact_parish_financial_breakdowns SET parish_key = -parish_key WHERE parish_key < 0;
UPDATE parish_analytics.fact_parish_financial_forecasts SET parish_key = -parish_key WHERE parish_key < 0;
UPDATE parish_analytics.fact_parish_health_snapshots SET parish_key = -parish_key WHERE parish_key < 0;
UPDATE parish_analytics.fact_parish_monthly_financials SET parish_key = -parish_key WHERE parish_key < 0;

-- Rekey all institution references using the corresponding aligned parish key.
UPDATE parish_analytics.dim_parishes child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE priest_assignment_analytics.dim_priests child
SET current_institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.current_institution_key = mapping.old_key;

UPDATE priest_assignment_analytics.fact_priest_assignment_recommendations child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE priest_assignment_analytics.fact_priest_assignments child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE school_analytics.dim_schools child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE seminary_analytics.dim_seminaries child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE shared_analytics.fact_subsidy_allocations child
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE child.institution_key = mapping.old_key;

UPDATE shared_analytics.dim_institutions parent
SET institution_key = -mapping.new_key
FROM _institution_key_map mapping
WHERE parent.institution_key = mapping.old_key;

UPDATE shared_analytics.dim_institutions SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE parish_analytics.dim_parishes SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE priest_assignment_analytics.dim_priests
  SET current_institution_key = -current_institution_key WHERE current_institution_key < 0;
UPDATE priest_assignment_analytics.fact_priest_assignment_recommendations
  SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE priest_assignment_analytics.fact_priest_assignments
  SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE school_analytics.dim_schools SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE seminary_analytics.dim_seminaries SET institution_key = -institution_key WHERE institution_key < 0;
UPDATE shared_analytics.fact_subsidy_allocations
  SET institution_key = -institution_key WHERE institution_key < 0;

-- Restore and immediately validate every relationship.
ALTER TABLE parish_analytics.dim_parishes
  ADD CONSTRAINT dim_parishes_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE priest_assignment_analytics.dim_priests
  ADD CONSTRAINT dim_priests_current_institution_key_fkey
  FOREIGN KEY (current_institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE priest_assignment_analytics.fact_priest_assignment_recommendations
  ADD CONSTRAINT fact_priest_assignment_recommendations_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE priest_assignment_analytics.fact_priest_assignments
  ADD CONSTRAINT fact_priest_assignments_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE school_analytics.dim_schools
  ADD CONSTRAINT dim_schools_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE seminary_analytics.dim_seminaries
  ADD CONSTRAINT dim_seminaries_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);
ALTER TABLE shared_analytics.fact_subsidy_allocations
  ADD CONSTRAINT fact_subsidy_allocations_institution_key_fkey
  FOREIGN KEY (institution_key) REFERENCES shared_analytics.dim_institutions(institution_key);

ALTER TABLE parish_analytics.fact_parish_anomaly_alerts
  ADD CONSTRAINT fact_parish_anomaly_alerts_parish_key_fkey
  FOREIGN KEY (parish_key) REFERENCES parish_analytics.dim_parishes(parish_key);
ALTER TABLE parish_analytics.fact_parish_financial_breakdowns
  ADD CONSTRAINT fact_parish_financial_breakdowns_parish_key_fkey
  FOREIGN KEY (parish_key) REFERENCES parish_analytics.dim_parishes(parish_key);
ALTER TABLE parish_analytics.fact_parish_financial_forecasts
  ADD CONSTRAINT fact_parish_financial_forecasts_parish_key_fkey
  FOREIGN KEY (parish_key) REFERENCES parish_analytics.dim_parishes(parish_key);
ALTER TABLE parish_analytics.fact_parish_health_snapshots
  ADD CONSTRAINT fact_parish_health_snapshots_parish_key_fkey
  FOREIGN KEY (parish_key) REFERENCES parish_analytics.dim_parishes(parish_key);
ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD CONSTRAINT fact_parish_monthly_financials_parish_key_fkey
  FOREIGN KEY (parish_key) REFERENCES parish_analytics.dim_parishes(parish_key);

SELECT setval(
  pg_get_serial_sequence('parish_analytics.dim_parishes', 'parish_key'),
  (SELECT max(parish_key) FROM parish_analytics.dim_parishes),
  true
);
SELECT setval(
  pg_get_serial_sequence('shared_analytics.dim_institutions', 'institution_key'),
  (SELECT max(institution_key) FROM shared_analytics.dim_institutions),
  true
);

DO $$
DECLARE
  parish_count integer;
  institution_count integer;
BEGIN
  SELECT count(*) INTO parish_count FROM parish_analytics.dim_parishes;
  SELECT count(*) INTO institution_count FROM shared_analytics.dim_institutions;

  IF parish_count <> 92
    OR (SELECT min(parish_key) FROM parish_analytics.dim_parishes) <> 1
    OR (SELECT max(parish_key) FROM parish_analytics.dim_parishes) <> 92
    OR (SELECT count(DISTINCT parish_key) FROM parish_analytics.dim_parishes) <> 92 THEN
    RAISE EXCEPTION 'Parish keys are not exactly contiguous 1..92';
  END IF;

  IF institution_count <> 92
    OR (SELECT min(institution_key) FROM shared_analytics.dim_institutions) <> 1
    OR (SELECT max(institution_key) FROM shared_analytics.dim_institutions) <> 92
    OR (SELECT count(DISTINCT institution_key) FROM shared_analytics.dim_institutions) <> 92 THEN
    RAISE EXCEPTION 'Institution keys are not exactly contiguous 1..92';
  END IF;

  IF EXISTS (
    SELECT 1 FROM parish_analytics.dim_parishes
    WHERE parish_key <> institution_key
  ) THEN
    RAISE EXCEPTION 'Parish and institution keys are not aligned';
  END IF;
END;
$$;

INSERT INTO warehouse_control.etl_runs (
  pipeline_name, run_mode, source_system, scope, status,
  extracted_count, loaded_count, table_counts, finished_at
)
SELECT
  'analytics_dimension_rekey',
  'manual',
  'aws',
  jsonb_build_object('batch_id', context.batch_id, 'range', '1-92', 'aligned', true),
  'succeeded',
  184,
  184,
  jsonb_build_object('parish_keys', 92, 'institution_keys', 92),
  now()
FROM _rekey_context context;

COMMIT;
