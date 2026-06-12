-- Announcement pinning: lets managers keep important posts at the top of the
-- Active Board. Pinned posts are ordered first by the announcement service.

ALTER TABLE diocese.announcements
  ADD COLUMN IF NOT EXISTS pinned    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_announcements_pinned
  ON diocese.announcements (pinned)
  WHERE pinned = true AND deleted_at IS NULL;
