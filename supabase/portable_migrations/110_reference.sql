CREATE TABLE IF NOT EXISTS reference.liturgical_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  year smallint NOT NULL,
  liturgical_season text NOT NULL CHECK (liturgical_season IN ('Advent', 'Christmas', 'Lent', 'Easter', 'Ordinary Time')),
  feast_name text,
  rank text CHECK (rank IN ('Solemnity', 'Feast', 'Memorial', 'Optional') OR rank IS NULL),
  liturgical_color text,
  is_holy_day_of_obligation boolean NOT NULL DEFAULT false,
  has_special_collection boolean NOT NULL DEFAULT false,
  special_collection_name text,
  expected_collection_impact text CHECK (expected_collection_impact IN ('low', 'medium', 'high') OR expected_collection_impact IS NULL),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference.weather_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  institution_id uuid REFERENCES diocese.institutions(id),
  location text,
  condition text CHECK (condition IN ('sunny', 'rainy', 'stormy', 'cloudy') OR condition IS NULL),
  temp_avg_c numeric(6, 2),
  rainfall_mm numeric(14, 2) NOT NULL DEFAULT 0,
  typhoon_signal smallint CHECK (typhoon_signal BETWEEN 0 AND 5 OR typhoon_signal IS NULL),
  is_extreme_event boolean NOT NULL DEFAULT false,
  source text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_liturgical_calendar ON reference.liturgical_calendar;
CREATE TRIGGER set_updated_at_liturgical_calendar
BEFORE UPDATE ON reference.liturgical_calendar
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_weather_observations ON reference.weather_observations;
CREATE TRIGGER set_updated_at_weather_observations
BEFORE UPDATE ON reference.weather_observations
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

