-- Backfill old parish local calendar rows into the shared event table.

DO $$
BEGIN
  IF to_regclass('parishes.local_calendar') IS NOT NULL THEN
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
      title,
      'Minor event',
      event_date,
      end_date,
      created_at,
      updated_at,
      deleted_at
    FROM parishes.local_calendar lc
    WHERE NOT EXISTS (
      SELECT 1
      FROM diocese.events e
      WHERE e.institution_id = lc.institution_id
        AND e.event_name = lc.title
        AND e.start_date = lc.event_date
    );
  END IF;
END $$;

DROP TABLE IF EXISTS parishes.local_calendar;
DROP TABLE IF EXISTS parishes.fiesta_events;
