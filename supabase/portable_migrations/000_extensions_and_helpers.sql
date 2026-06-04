-- Portable PostgreSQL base helpers for Supabase and AWS RDS.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.month_short_to_int(month_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(trim(month_text))
    WHEN 'JAN' THEN 1
    WHEN 'FEB' THEN 2
    WHEN 'MAR' THEN 3
    WHEN 'APR' THEN 4
    WHEN 'MAY' THEN 5
    WHEN 'JUN' THEN 6
    WHEN 'JUL' THEN 7
    WHEN 'AUG' THEN 8
    WHEN 'SEP' THEN 9
    WHEN 'OCT' THEN 10
    WHEN 'NOV' THEN 11
    WHEN 'DEC' THEN 12
    ELSE NULL
  END;
$$;
