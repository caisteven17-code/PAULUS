-- Run this only if `parishes.parish_events` already exists without `event_level`.

ALTER TABLE parishes.parish_events
  ADD COLUMN IF NOT EXISTS event_level text;

UPDATE parishes.parish_events
SET event_level = 'Minor event'
WHERE event_level IS NULL;

ALTER TABLE parishes.parish_events
  ALTER COLUMN event_level SET NOT NULL;

ALTER TABLE parishes.parish_events
  DROP CONSTRAINT IF EXISTS parish_events_event_level_check;

ALTER TABLE parishes.parish_events
  ADD CONSTRAINT parish_events_event_level_check
  CHECK (event_level IN ('Major event', 'Minor event'));
