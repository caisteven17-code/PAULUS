-- Announcement overhaul: adds status lifecycle, start/end date visibility window,
-- published_at (grace-period clock), and archive tracking.
-- Existing rows are migrated to status='active' with sensible defaults.

ALTER TABLE diocese.announcements
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'past', 'archived')),
  ADD COLUMN IF NOT EXISTS start_date   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS end_date     timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by  text;

-- Backfill existing rows: treat them as already-published active announcements.
UPDATE diocese.announcements
SET
  status       = 'active',
  start_date   = created_at,
  published_at = created_at
WHERE status = 'active' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_status
  ON diocese.announcements (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_end_date
  ON diocese.announcements (end_date)
  WHERE end_date IS NOT NULL AND deleted_at IS NULL;
