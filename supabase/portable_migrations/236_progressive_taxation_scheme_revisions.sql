-- Allow published taxation schemes to be revised for the same effective period.

BEGIN;

ALTER TABLE diocese.progressive_tax_schemes
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid
    REFERENCES diocese.progressive_tax_schemes(id) ON DELETE SET NULL;

ALTER TABLE diocese.progressive_tax_schemes
  DROP CONSTRAINT IF EXISTS progressive_tax_schemes_effective_month_key;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'diocese.progressive_tax_schemes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE diocese.progressive_tax_schemes DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE diocese.progressive_tax_schemes
  ADD CONSTRAINT progressive_tax_schemes_status_check
    CHECK (status IN ('draft', 'published', 'superseded')),
  ADD CONSTRAINT progressive_tax_schemes_publication_check
    CHECK (
      (status = 'draft' AND published_at IS NULL AND superseded_at IS NULL)
      OR (status = 'published' AND published_at IS NOT NULL AND superseded_at IS NULL)
      OR (status = 'superseded' AND published_at IS NOT NULL AND superseded_at IS NOT NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_progressive_tax_schemes_published_period
  ON diocese.progressive_tax_schemes (effective_month)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS uq_progressive_tax_schemes_draft_period
  ON diocese.progressive_tax_schemes (effective_month)
  WHERE status = 'draft';

CREATE OR REPLACE FUNCTION diocese.guard_published_progressive_tax_scheme()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF TG_OP = 'UPDATE'
       AND NEW.status = 'superseded'
       AND NEW.id = OLD.id
       AND NEW.version = OLD.version
       AND NEW.name = OLD.name
       AND NEW.effective_month = OLD.effective_month
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by
       AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
       AND NEW.created_at = OLD.created_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Published progressive taxation schemes are immutable';
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'Superseded progressive taxation schemes are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION diocese.guard_published_progressive_tax_bracket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_scheme_id uuid;
  v_status text;
BEGIN
  v_scheme_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.scheme_id ELSE NEW.scheme_id END;
  SELECT status INTO v_status
  FROM diocese.progressive_tax_schemes
  WHERE id = v_scheme_id;

  IF v_status IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'Brackets belonging to a published taxation scheme are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION diocese.publish_progressive_tax_scheme(
  p_scheme_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = diocese, public
AS $$
DECLARE
  v_count integer;
  v_invalid integer;
  v_effective_month date;
BEGIN
  SELECT effective_month INTO v_effective_month
  FROM diocese.progressive_tax_schemes
  WHERE id = p_scheme_id AND status = 'draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft taxation scheme % was not found', p_scheme_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM diocese.progressive_tax_brackets
  WHERE scheme_id = p_scheme_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'A taxation scheme cannot be published without brackets';
  END IF;

  SELECT count(*) INTO v_invalid
  FROM (
    SELECT
      position,
      minimum_amount,
      maximum_amount,
      lag(maximum_amount) OVER (ORDER BY position) AS previous_maximum,
      row_number() OVER (ORDER BY position) AS row_number
    FROM diocese.progressive_tax_brackets
    WHERE scheme_id = p_scheme_id
  ) brackets
  WHERE position <> row_number
     OR maximum_amount < minimum_amount
     OR (row_number = 1 AND minimum_amount <> 1.00)
     OR (row_number > 1 AND minimum_amount <> previous_maximum + 0.01);

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'Taxation brackets must be ordered, gap-free, and non-overlapping';
  END IF;

  UPDATE diocese.progressive_tax_schemes
  SET
    status = 'superseded',
    superseded_at = now(),
    superseded_by = p_scheme_id,
    updated_at = now()
  WHERE effective_month = v_effective_month
    AND status = 'published'
    AND id <> p_scheme_id;

  UPDATE diocese.progressive_tax_schemes
  SET
    status = 'published',
    published_by = p_actor_id,
    published_at = now(),
    superseded_at = NULL,
    superseded_by = NULL,
    updated_at = now()
  WHERE id = p_scheme_id;

  RETURN p_scheme_id;
END;
$$;

COMMIT;
