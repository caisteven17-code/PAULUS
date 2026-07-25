-- Supabase-owned collection/review workflow for the canonical liturgical
-- calendar. This is workflow staging only; approved master records remain in
-- reference.liturgical_calendar.

CREATE TABLE IF NOT EXISTS operations.liturgical_calendar_ingestion_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  years smallint[] NOT NULL,
  run_mode text NOT NULL DEFAULT 'scheduled'
    CHECK (run_mode IN ('scheduled', 'manual', 'backfill')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collecting', 'awaiting_review', 'completed', 'partial', 'failed')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  approved_count integer NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations.liturgical_calendar_ingestion_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES operations.liturgical_calendar_ingestion_runs(run_id) ON DELETE CASCADE,
  calendar_date date NOT NULL,
  source_name text NOT NULL,
  source_reference text,
  candidate_record_id uuid REFERENCES reference.liturgical_calendar(id) ON DELETE SET NULL,
  validation_status text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'approved_with_revisions', 'rejected')),
  processing_status text NOT NULL DEFAULT 'staged'
    CHECK (processing_status IN ('staged', 'published', 'approved', 'rejected', 'failed')),
  validation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, calendar_date, source_name)
);

CREATE INDEX IF NOT EXISTS idx_liturgical_ingestion_runs_status
  ON operations.liturgical_calendar_ingestion_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_liturgical_ingestion_items_review
  ON operations.liturgical_calendar_ingestion_items (review_status, calendar_date);

ALTER TABLE operations.liturgical_calendar_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations.liturgical_calendar_ingestion_items ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA operations TO service_role;
GRANT ALL ON TABLE operations.liturgical_calendar_ingestion_runs TO service_role;
GRANT ALL ON TABLE operations.liturgical_calendar_ingestion_items TO service_role;

DROP POLICY IF EXISTS liturgical_ingestion_runs_service_role
  ON operations.liturgical_calendar_ingestion_runs;
CREATE POLICY liturgical_ingestion_runs_service_role
  ON operations.liturgical_calendar_ingestion_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS liturgical_ingestion_items_service_role
  ON operations.liturgical_calendar_ingestion_items;
CREATE POLICY liturgical_ingestion_items_service_role
  ON operations.liturgical_calendar_ingestion_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE operations.liturgical_calendar_ingestion_runs IS
  'Supabase-owned collection and human-review workflow state.';
COMMENT ON TABLE operations.liturgical_calendar_ingestion_items IS
  'Calendar candidates and validation state; canonical approved rows remain in reference.liturgical_calendar.';
