-- Private, audience-aware announcement posts with ordered attachments.
ALTER TABLE diocese.announcements
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'general'
    CHECK (audience_type IN ('general', 'specific'));

-- Some PAULUS deployments use UUID announcement IDs while older deployments
-- use formatted text IDs (ANC-001). Match the installed announcements.id type.
DO $$
DECLARE
  announcement_id_type text;
  profile_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO announcement_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'diocese' AND c.relname = 'announcements'
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF announcement_id_type IS NULL THEN
    RAISE EXCEPTION 'diocese.announcements.id was not found';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO profile_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'diocese' AND c.relname = 'profiles'
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF profile_id_type IS NULL THEN
    RAISE EXCEPTION 'diocese.profiles.id was not found';
  END IF;

  IF to_regclass('diocese.announcement_recipients') IS NULL THEN
    EXECUTE format($sql$
      CREATE TABLE diocese.announcement_recipients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        announcement_id %s NOT NULL REFERENCES diocese.announcements(id) ON DELETE CASCADE,
        profile_id %s NOT NULL REFERENCES diocese.profiles(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (announcement_id, profile_id)
      )
    $sql$, announcement_id_type, profile_id_type);
  END IF;

  IF to_regclass('diocese.announcement_attachments') IS NULL THEN
    EXECUTE format($sql$
      CREATE TABLE diocese.announcement_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        announcement_id %s NOT NULL REFERENCES diocese.announcements(id) ON DELETE CASCADE,
        storage_path text NOT NULL UNIQUE,
        original_name text NOT NULL,
        mime_type text NOT NULL,
        file_size bigint NOT NULL CHECK (file_size > 0),
        attachment_kind text NOT NULL CHECK (attachment_kind IN ('image', 'document')),
        display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
        alt_text text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    $sql$, announcement_id_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcement_recipients_profile
  ON diocese.announcement_recipients (profile_id, announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_announcement
  ON diocese.announcement_recipients (announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement
  ON diocese.announcement_attachments (announcement_id, display_order);
CREATE INDEX IF NOT EXISTS idx_announcements_audience_active
  ON diocese.announcements (audience_type, status, start_date)
  WHERE deleted_at IS NULL;

-- Files remain private. The service-role backend authorizes each preview/download
-- and returns a short-lived signed URL; clients never receive storage credentials.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-attachments',
  'announcement-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE diocese.announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE diocese.announcement_attachments ENABLE ROW LEVEL SECURITY;

-- Tables created after the core schema's blanket grants do not inherit them.
-- The announcement service uses the server-only service role for authorized
-- recipient and attachment operations, so grant it explicit access here.
GRANT USAGE ON SCHEMA diocese TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE diocese.announcement_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE diocese.announcement_attachments TO service_role;
