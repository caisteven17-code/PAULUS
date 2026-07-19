-- Parish analytics calendar dimension and month-level features.
-- Only human-approved source-of-truth records are eligible for analytics.

CREATE TABLE IF NOT EXISTS parish_analytics.dim_liturgical_day (
  liturgical_date_key integer PRIMARY KEY,
  calendar_record_id uuid NOT NULL UNIQUE
    REFERENCES reference.liturgical_calendar(id) ON DELETE CASCADE,
  calendar_date date NOT NULL UNIQUE,
  date_key integer NOT NULL REFERENCES shared_analytics.dim_date(date_key),
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  weekday text NOT NULL,
  celebration_name text NOT NULL,
  rank text,
  rank_group text NOT NULL
    CHECK (rank_group IN ('solemnity', 'feast', 'memorial', 'sunday', 'weekday', 'other')),
  liturgical_season text,
  source_name text NOT NULL,
  validation_status text NOT NULL,
  review_status text NOT NULL
    CHECK (review_status IN ('approved', 'approved_with_revisions')),
  is_sunday boolean NOT NULL DEFAULT false,
  is_solemnity boolean NOT NULL DEFAULT false,
  is_feast boolean NOT NULL DEFAULT false,
  is_memorial boolean NOT NULL DEFAULT false,
  is_major_celebration boolean NOT NULL DEFAULT false,
  is_holy_week boolean NOT NULL DEFAULT false,
  is_easter_sunday boolean NOT NULL DEFAULT false,
  is_christmas_day boolean NOT NULL DEFAULT false,
  is_ash_wednesday boolean NOT NULL DEFAULT false,
  is_palm_sunday boolean NOT NULL DEFAULT false,
  is_simbang_gabi boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_liturgical_day_month
  ON parish_analytics.dim_liturgical_day (date_key);

CREATE INDEX IF NOT EXISTS idx_dim_liturgical_day_season
  ON parish_analytics.dim_liturgical_day (liturgical_season, calendar_date);

CREATE TABLE IF NOT EXISTS parish_analytics.agg_liturgical_month (
  date_key integer PRIMARY KEY REFERENCES shared_analytics.dim_date(date_key),
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  calendar_days_count smallint NOT NULL,
  expected_days_count smallint NOT NULL,
  coverage_status text NOT NULL CHECK (coverage_status IN ('complete', 'partial')),
  sundays_count smallint NOT NULL DEFAULT 0,
  weekdays_count smallint NOT NULL DEFAULT 0,
  solemnities_count smallint NOT NULL DEFAULT 0,
  feasts_count smallint NOT NULL DEFAULT 0,
  memorials_count smallint NOT NULL DEFAULT 0,
  major_celebration_days_count smallint NOT NULL DEFAULT 0,
  ordinary_time_days_count smallint NOT NULL DEFAULT 0,
  advent_days_count smallint NOT NULL DEFAULT 0,
  christmas_days_count smallint NOT NULL DEFAULT 0,
  lent_days_count smallint NOT NULL DEFAULT 0,
  triduum_days_count smallint NOT NULL DEFAULT 0,
  easter_days_count smallint NOT NULL DEFAULT 0,
  holy_week_days_count smallint NOT NULL DEFAULT 0,
  simbang_gabi_days_count smallint NOT NULL DEFAULT 0,
  has_easter_sunday boolean NOT NULL DEFAULT false,
  has_christmas_day boolean NOT NULL DEFAULT false,
  has_ash_wednesday boolean NOT NULL DEFAULT false,
  has_palm_sunday boolean NOT NULL DEFAULT false,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION parish_analytics.refresh_liturgical_calendar_analytics()
RETURNS TABLE (daily_rows integer, monthly_rows integer)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM parish_analytics.dim_liturgical_day target
  WHERE NOT EXISTS (
    SELECT 1
    FROM reference.liturgical_calendar source
    WHERE source.id = target.calendar_record_id
      AND source.review_status IN ('approved', 'approved_with_revisions')
  );

  INSERT INTO parish_analytics.dim_liturgical_day (
    liturgical_date_key, calendar_record_id, calendar_date, date_key,
    year, month, day, weekday, celebration_name, rank, rank_group,
    liturgical_season, source_name, validation_status, review_status,
    is_sunday, is_solemnity, is_feast, is_memorial,
    is_major_celebration, is_holy_week, is_easter_sunday,
    is_christmas_day, is_ash_wednesday, is_palm_sunday,
    is_simbang_gabi, source_updated_at, refreshed_at
  )
  SELECT
    (source.year::integer * 10000 + source.month::integer * 100 + source.day::integer),
    source.id,
    source.date,
    (source.year::integer * 100 + source.month::integer),
    source.year,
    source.month,
    source.day,
    source.weekday,
    source.celebration_name,
    source.rank,
    CASE
      WHEN lower(coalesce(source.rank, '')) LIKE '%solemnity%' THEN 'solemnity'
      WHEN lower(coalesce(source.rank, '')) LIKE '%feast%' THEN 'feast'
      WHEN lower(coalesce(source.rank, '')) LIKE '%memorial%'
        OR lower(coalesce(source.rank, '')) LIKE '%commemoration%' THEN 'memorial'
      WHEN source.weekday = 'Sunday' OR lower(coalesce(source.rank, '')) LIKE '%sunday%' THEN 'sunday'
      WHEN lower(coalesce(source.rank, '')) LIKE '%weekday%'
        OR lower(coalesce(source.rank, '')) LIKE '%feria%' THEN 'weekday'
      ELSE 'other'
    END,
    source.liturgical_season,
    source.source_name,
    source.validation_status,
    source.review_status,
    source.weekday = 'Sunday',
    lower(coalesce(source.rank, '')) LIKE '%solemnity%',
    lower(coalesce(source.rank, '')) LIKE '%feast%',
    lower(coalesce(source.rank, '')) LIKE '%memorial%'
      OR lower(coalesce(source.rank, '')) LIKE '%commemoration%',
    lower(coalesce(source.rank, '')) LIKE '%solemnity%'
      OR lower(coalesce(source.rank, '')) LIKE '%feast of the lord%'
      OR source.liturgical_season = 'Paschal Triduum'
      OR lower(source.celebration_name) LIKE '%easter sunday%'
      OR (source.month = 12 AND source.day = 25),
    source.liturgical_season = 'Paschal Triduum'
      OR lower(coalesce(source.rank, '')) LIKE '%holy week%'
      OR lower(source.celebration_name) LIKE ANY (
        ARRAY['%palm sunday%', '%holy thursday%', '%good friday%', '%holy saturday%']
      ),
    lower(source.celebration_name) LIKE '%easter sunday%',
    source.month = 12 AND source.day = 25,
    lower(source.celebration_name) LIKE '%ash wednesday%',
    lower(source.celebration_name) LIKE '%palm sunday%'
      OR lower(coalesce(source.rank, '')) LIKE '%palm sunday%',
    lower(source.celebration_name) LIKE '%simbang gabi%'
      OR lower(source.celebration_name) LIKE '%misa de aguinaldo%',
    source.updated_at,
    now()
  FROM reference.liturgical_calendar source
  JOIN shared_analytics.dim_date month_dim
    ON month_dim.date_key = source.year::integer * 100 + source.month::integer
  WHERE source.review_status IN ('approved', 'approved_with_revisions')
  ON CONFLICT (liturgical_date_key) DO UPDATE SET
    calendar_record_id = EXCLUDED.calendar_record_id,
    calendar_date = EXCLUDED.calendar_date,
    date_key = EXCLUDED.date_key,
    year = EXCLUDED.year,
    month = EXCLUDED.month,
    day = EXCLUDED.day,
    weekday = EXCLUDED.weekday,
    celebration_name = EXCLUDED.celebration_name,
    rank = EXCLUDED.rank,
    rank_group = EXCLUDED.rank_group,
    liturgical_season = EXCLUDED.liturgical_season,
    source_name = EXCLUDED.source_name,
    validation_status = EXCLUDED.validation_status,
    review_status = EXCLUDED.review_status,
    is_sunday = EXCLUDED.is_sunday,
    is_solemnity = EXCLUDED.is_solemnity,
    is_feast = EXCLUDED.is_feast,
    is_memorial = EXCLUDED.is_memorial,
    is_major_celebration = EXCLUDED.is_major_celebration,
    is_holy_week = EXCLUDED.is_holy_week,
    is_easter_sunday = EXCLUDED.is_easter_sunday,
    is_christmas_day = EXCLUDED.is_christmas_day,
    is_ash_wednesday = EXCLUDED.is_ash_wednesday,
    is_palm_sunday = EXCLUDED.is_palm_sunday,
    is_simbang_gabi = EXCLUDED.is_simbang_gabi,
    source_updated_at = EXCLUDED.source_updated_at,
    refreshed_at = now();

  DELETE FROM parish_analytics.agg_liturgical_month;

  INSERT INTO parish_analytics.agg_liturgical_month (
    date_key, year, month, calendar_days_count, expected_days_count,
    coverage_status, sundays_count, weekdays_count, solemnities_count,
    feasts_count, memorials_count, major_celebration_days_count,
    ordinary_time_days_count, advent_days_count, christmas_days_count,
    lent_days_count, triduum_days_count, easter_days_count,
    holy_week_days_count, simbang_gabi_days_count,
    has_easter_sunday, has_christmas_day, has_ash_wednesday,
    has_palm_sunday, refreshed_at
  )
  SELECT
    day.date_key,
    day.year,
    day.month,
    count(*)::smallint,
    extract(day FROM (date_trunc('month', min(day.calendar_date))
      + interval '1 month - 1 day'))::smallint,
    CASE
      WHEN count(*) = extract(day FROM (date_trunc('month', min(day.calendar_date))
        + interval '1 month - 1 day')) THEN 'complete'
      ELSE 'partial'
    END,
    count(*) FILTER (WHERE day.is_sunday)::smallint,
    count(*) FILTER (WHERE NOT day.is_sunday)::smallint,
    count(*) FILTER (WHERE day.is_solemnity)::smallint,
    count(*) FILTER (WHERE day.is_feast)::smallint,
    count(*) FILTER (WHERE day.is_memorial)::smallint,
    count(*) FILTER (WHERE day.is_major_celebration)::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Ordinary Time')::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Advent')::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Christmas')::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Lent')::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Paschal Triduum')::smallint,
    count(*) FILTER (WHERE day.liturgical_season = 'Easter')::smallint,
    count(*) FILTER (WHERE day.is_holy_week)::smallint,
    count(*) FILTER (WHERE day.is_simbang_gabi)::smallint,
    bool_or(day.is_easter_sunday),
    bool_or(day.is_christmas_day),
    bool_or(day.is_ash_wednesday),
    bool_or(day.is_palm_sunday),
    now()
  FROM parish_analytics.dim_liturgical_day day
  GROUP BY day.date_key, day.year, day.month;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer FROM parish_analytics.dim_liturgical_day),
    (SELECT count(*)::integer FROM parish_analytics.agg_liturgical_month);
END;
$$;

CREATE OR REPLACE VIEW parish_analytics.vw_parish_monthly_financials_liturgical AS
SELECT
  financials.*,
  calendar.calendar_days_count AS liturgical_calendar_days_count,
  calendar.coverage_status AS liturgical_calendar_coverage_status,
  calendar.sundays_count AS liturgical_sundays_count,
  calendar.solemnities_count AS liturgical_solemnities_count,
  calendar.feasts_count AS liturgical_feasts_count,
  calendar.memorials_count AS liturgical_memorials_count,
  calendar.major_celebration_days_count AS liturgical_major_celebration_days_count,
  calendar.advent_days_count AS liturgical_advent_days_count,
  calendar.christmas_days_count AS liturgical_christmas_days_count,
  calendar.lent_days_count AS liturgical_lent_days_count,
  calendar.triduum_days_count AS liturgical_triduum_days_count,
  calendar.easter_days_count AS liturgical_easter_days_count,
  calendar.holy_week_days_count AS liturgical_holy_week_days_count,
  calendar.simbang_gabi_days_count AS liturgical_simbang_gabi_days_count,
  calendar.has_easter_sunday,
  calendar.has_christmas_day,
  calendar.has_ash_wednesday,
  calendar.has_palm_sunday,
  calendar.weekdays_count AS liturgical_weekdays_count,
  calendar.ordinary_time_days_count AS liturgical_ordinary_time_days_count
FROM parish_analytics.fact_parish_monthly_financials financials
LEFT JOIN parish_analytics.agg_liturgical_month calendar
  ON calendar.date_key = financials.date_key;

SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics();
