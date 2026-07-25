-- Automatically invalidate only the AWS parish-finance snapshots affected by
-- an IAFR account-catalog change. This covers code/name/classification swaps
-- without requiring a full Silver/Gold rebuild.

CREATE OR REPLACE FUNCTION operations.enqueue_iafr_account_dependents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, operations
AS $$
DECLARE
  v_account_id uuid;
  v_event_version timestamptz := clock_timestamp();
BEGIN
  v_account_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  INSERT INTO operations.analytics_sync_outbox (
    source_schema,
    source_table,
    source_record_id,
    source_updated_at
  )
  SELECT DISTINCT
    'parishes',
    'financial_records',
    record.id,
    v_event_version
  FROM parishes.iafr_line_items line
  JOIN parishes.financial_records record
    ON record.id = line.financial_record_id
  WHERE line.account_title_id = v_account_id
    AND line.deleted_at IS NULL
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

DROP TRIGGER IF EXISTS enqueue_account_dependents_analytics_sync
  ON parishes.iafr_account_titles;
CREATE TRIGGER enqueue_account_dependents_analytics_sync
  AFTER UPDATE OR DELETE ON parishes.iafr_account_titles
  FOR EACH ROW
  EXECUTE FUNCTION operations.enqueue_iafr_account_dependents();

REVOKE ALL ON FUNCTION operations.enqueue_iafr_account_dependents() FROM PUBLIC;

COMMENT ON FUNCTION operations.enqueue_iafr_account_dependents() IS
  'Queues affected parish financial snapshots after an IAFR account catalog change.';

COMMENT ON TRIGGER enqueue_account_dependents_analytics_sync
  ON parishes.iafr_account_titles IS
  'Targeted dependency propagation from account catalog changes to AWS Silver/Gold.';
