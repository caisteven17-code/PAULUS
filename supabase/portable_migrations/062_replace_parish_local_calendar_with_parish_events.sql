-- Run this only if the old parish event tables already exist.
-- This keeps only one simple event table for parish-entered events.

CREATE TABLE IF NOT EXISTS parishes.parish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  event_name text NOT NULL,
  event_level text NOT NULL DEFAULT 'Minor event' CHECK (event_level IN ('Major event', 'Minor event')),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

INSERT INTO parishes.parish_events (
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
  title,
  'Minor event',
  event_date,
  end_date,
  created_at,
  updated_at,
  deleted_at
FROM parishes.local_calendar
WHERE NOT EXISTS (
  SELECT 1
  FROM parishes.parish_events pe
  WHERE pe.institution_id = parishes.local_calendar.institution_id
    AND pe.event_name = parishes.local_calendar.title
    AND pe.start_date = parishes.local_calendar.event_date
);

DROP TRIGGER IF EXISTS set_updated_at_local_calendar ON parishes.local_calendar;
DROP TRIGGER IF EXISTS set_updated_at_fiesta_events ON parishes.fiesta_events;

DROP TABLE IF EXISTS parishes.local_calendar;
DROP TABLE IF EXISTS parishes.fiesta_events;
