-- Durable Supabase -> AWS delivery queue for parish financial analytics.
--
-- The queue lives beside the operational transaction, so an AWS outage cannot
-- lose the fact that a record still needs to reach Silver and Gold. Workers
-- lease events; an abandoned lease automatically becomes claimable again.

CREATE TABLE IF NOT EXISTS operations.analytics_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_schema text NOT NULL DEFAULT 'parishes',
  source_table text NOT NULL DEFAULT 'financial_records',
  source_record_id uuid NOT NULL,
  source_updated_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_by text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT uq_analytics_sync_outbox_source
    UNIQUE (source_schema, source_table, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_sync_outbox_due
  ON operations.analytics_sync_outbox (next_attempt_at, updated_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_analytics_sync_outbox_expired_lease
  ON operations.analytics_sync_outbox (lease_until)
  WHERE status = 'processing';

ALTER TABLE operations.analytics_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operations.analytics_sync_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON operations.analytics_sync_outbox FROM service_role;

CREATE OR REPLACE FUNCTION operations.enqueue_parish_financial_analytics_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, operations
AS $$
DECLARE
  v_record_id uuid;
  v_source_updated_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_source_updated_at := GREATEST(COALESCE(OLD.updated_at, now()), now());
  ELSE
    v_record_id := NEW.id;
    v_source_updated_at := NEW.updated_at;
  END IF;

  INSERT INTO operations.analytics_sync_outbox (
    source_schema,
    source_table,
    source_record_id,
    source_updated_at
  )
  VALUES ('parishes', 'financial_records', v_record_id, v_source_updated_at)
  ON CONFLICT (source_schema, source_table, source_record_id) DO UPDATE
  SET source_updated_at = EXCLUDED.source_updated_at,
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      leased_by = NULL,
      lease_until = NULL,
      last_error = NULL,
      completed_at = NULL,
      updated_at = now();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_analytics_sync ON parishes.financial_records;
CREATE TRIGGER enqueue_analytics_sync
  AFTER INSERT OR UPDATE OR DELETE ON parishes.financial_records
  FOR EACH ROW EXECUTE FUNCTION operations.enqueue_parish_financial_analytics_sync();

COMMENT ON TRIGGER enqueue_analytics_sync ON parishes.financial_records IS
  'Durably queues every parish financial snapshot change for automatic AWS Silver/Gold delivery.';

CREATE OR REPLACE FUNCTION operations.claim_analytics_sync_events(
  p_worker_id text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  event_id uuid,
  source_record_id uuid,
  source_updated_at timestamptz,
  attempt_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, operations
AS $$
  WITH due AS (
    SELECT queue.id
    FROM operations.analytics_sync_outbox queue
    WHERE (
        queue.status = 'pending'
        AND queue.next_attempt_at <= now()
      ) OR (
        queue.status = 'processing'
        AND queue.lease_until <= now()
      )
    ORDER BY queue.next_attempt_at, queue.updated_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ), claimed AS (
    UPDATE operations.analytics_sync_outbox queue
    SET status = 'processing',
        leased_by = LEFT(COALESCE(NULLIF(p_worker_id, ''), 'anonymous-worker'), 200),
        lease_until = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 3600)),
        updated_at = now()
    FROM due
    WHERE queue.id = due.id
    RETURNING queue.id, queue.source_record_id, queue.source_updated_at, queue.attempt_count
  )
  SELECT claimed.id, claimed.source_record_id, claimed.source_updated_at, claimed.attempt_count
  FROM claimed;
$$;

CREATE OR REPLACE FUNCTION operations.complete_analytics_sync_event(
  p_event_id uuid,
  p_source_updated_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, operations
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE operations.analytics_sync_outbox
  SET status = 'succeeded',
      leased_by = NULL,
      lease_until = NULL,
      last_error = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_event_id
    AND status = 'processing'
    AND source_updated_at = p_source_updated_at;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION operations.fail_analytics_sync_event(
  p_event_id uuid,
  p_source_updated_at timestamptz,
  p_error text,
  p_retry_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, operations
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE operations.analytics_sync_outbox
  SET status = 'pending',
      attempt_count = attempt_count + 1,
      next_attempt_at = now() + make_interval(
        secs => LEAST(GREATEST(p_retry_seconds, 10), 3600)
      ),
      leased_by = NULL,
      lease_until = NULL,
      last_error = LEFT(COALESCE(p_error, 'Unknown synchronization error'), 2000),
      updated_at = now()
  WHERE id = p_event_id
    AND status = 'processing'
    AND source_updated_at = p_source_updated_at;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION operations.enqueue_parish_financial_analytics_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.claim_analytics_sync_events(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.complete_analytics_sync_event(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.fail_analytics_sync_event(uuid, timestamptz, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION operations.claim_analytics_sync_events(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION operations.complete_analytics_sync_event(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION operations.fail_analytics_sync_event(uuid, timestamptz, text, integer) TO service_role;

COMMENT ON TABLE operations.analytics_sync_outbox IS
  'Durable, retry-until-success delivery state for Supabase parish finance changes bound for AWS analytics.';
