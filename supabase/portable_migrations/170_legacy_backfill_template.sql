-- Template only.
-- Use this file as the starting point when moving data from your current monolithic tables.
-- Review every column before running in a real environment.

-- Example approach:
-- 1. Insert distinct institutions from legacy sources into diocese.institutions.
-- 2. Insert users into diocese.profiles.
-- 3. Split old public.financial_records into parishes.financial_records, schools.financial_records, and seminaries.financial_records.
-- 4. Run 130_sync_analytics_dimensions.sql and the 140/150/160 refresh scripts.

-- Example placeholder:
--
-- INSERT INTO diocese.institutions (name, entity_type, class, is_active)
-- SELECT DISTINCT
--   legacy.entity_name,
--   legacy.entity_type,
--   REPLACE(legacy.entity_class, 'Class ', ''),
--   true
-- FROM public.financial_records_legacy AS legacy;
--
-- INSERT INTO parishes.financial_records (...)
-- SELECT ...
-- FROM public.financial_records_legacy
-- WHERE entity_type = 'parish';

