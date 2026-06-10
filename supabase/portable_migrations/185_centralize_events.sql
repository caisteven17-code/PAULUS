-- Migration 185: Centralize institution events into diocese.events.

CREATE TABLE IF NOT EXISTS diocese.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  event_name text NOT NULL,
  event_level text NOT NULL DEFAULT 'Minor event' CHECK (event_level IN ('Major event', 'Minor event')),
  event_type text,
  expected_financial_impact text CHECK (
    expected_financial_impact IN ('inflow', 'outflow', 'both', 'none') OR expected_financial_impact IS NULL
  ),
  estimated_amount numeric(14, 2),
  linked_project_id uuid REFERENCES diocese.projects(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_events_institution_start_date
  ON diocese.events (institution_id, start_date)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_events ON diocese.events;
CREATE TRIGGER set_updated_at_events
BEFORE UPDATE ON diocese.events
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DO $$
BEGIN
  IF to_regclass('parishes.parish_events') IS NOT NULL THEN
    INSERT INTO diocese.events (
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    )
    SELECT
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    FROM parishes.parish_events pe
    WHERE NOT EXISTS (
      SELECT 1
      FROM diocese.events e
      WHERE e.institution_id = pe.institution_id
        AND e.event_name = pe.event_name
        AND e.start_date = pe.start_date
    );
  END IF;

  IF to_regclass('schools.school_events') IS NOT NULL THEN
    INSERT INTO diocese.events (
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    )
    SELECT
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    FROM schools.school_events se
    WHERE NOT EXISTS (
      SELECT 1
      FROM diocese.events e
      WHERE e.institution_id = se.institution_id
        AND e.event_name = se.event_name
        AND e.start_date = se.start_date
    );
  END IF;

  IF to_regclass('seminaries.seminary_events') IS NOT NULL THEN
    INSERT INTO diocese.events (
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    )
    SELECT
      institution_id,
      event_name,
      event_level,
      start_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    FROM seminaries.seminary_events se
    WHERE NOT EXISTS (
      SELECT 1
      FROM diocese.events e
      WHERE e.institution_id = se.institution_id
        AND e.event_name = se.event_name
        AND e.start_date = se.start_date
    );
  END IF;
END $$;

DROP TABLE IF EXISTS parishes.parish_events;
DROP TABLE IF EXISTS schools.school_events;
DROP TABLE IF EXISTS seminaries.seminary_events;

GRANT ALL PRIVILEGES ON diocese.events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON diocese.events TO authenticated;
GRANT SELECT ON diocese.events TO anon;
