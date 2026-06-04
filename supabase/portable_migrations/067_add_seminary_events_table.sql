-- Run this only if `seminaries.seminary_events` does not exist yet.

CREATE TABLE IF NOT EXISTS seminaries.seminary_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  event_name text NOT NULL,
  event_level text NOT NULL CHECK (event_level IN ('Major event', 'Minor event')),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

DROP TRIGGER IF EXISTS set_updated_at_seminary_events ON seminaries.seminary_events;
CREATE TRIGGER set_updated_at_seminary_events
BEFORE UPDATE ON seminaries.seminary_events
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
