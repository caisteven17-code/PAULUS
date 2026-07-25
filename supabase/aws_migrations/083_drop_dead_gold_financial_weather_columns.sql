-- fact_parish_monthly_financials (and the school/seminary equivalents) have 5
-- columns (typhoon_days_count, major_events_count, minor_events_count,
-- has_event, total_rainfall_mm) that the Gold loaders never write — confirmed
-- 100% zero/false across every existing row, an abandoned earlier attempt to
-- bake weather signals directly into the financial fact table. Real weather
-- data lives entirely separately in reference.weather_monthly_summary; wiring
-- it into parish analytics belongs in its own municipality-keyed bridge
-- (migration 078+), not as columns on this fact table.
--
-- vw_parish_monthly_financials_liturgical re-selects these 5 dead columns
-- from fact_parish_monthly_financials, so it must be recreated without them
-- before the columns can be dropped (Postgres refuses DROP COLUMN while a
-- view depends on it).

-- CREATE OR REPLACE VIEW cannot remove output columns (only append at the
-- end), so the view must be dropped and recreated to lose the 5 dead ones.
DROP VIEW IF EXISTS parish_analytics.vw_parish_monthly_financials_liturgical;

CREATE VIEW parish_analytics.vw_parish_monthly_financials_liturgical AS
SELECT
    financials.parish_key,
    financials.date_key,
    financials.submission_key,
    financials.sacraments_arancel_confirmation_incl,
    financials.sacraments_parish_share,
    financials.sacraments_over_above_confirmation_incl,
    financials.collections_mass,
    financials.collections_other_receipts,
    financials.total_collections,
    financials.expenses_pastoral_mass_stipend,
    financials.expenses_parish,
    financials.total_expenses,
    financials.net_receipts_deficit,
    financials.mass_intentions_not_claimed_by_parish_priest,
    financials.mass_intentions_claimed_by_parish_priest,
    financials.special_collections,
    financials.pastoral_parish_fund_total_net_receipts_deficit,
    financials.total_remittance,
    financials.expenses_parish_salaries_wages_benefits,
    financials.expenses_parish_government_contributions,
    financials.expenses_parish_utilities,
    financials.expenses_parish_communications,
    financials.expenses_parish_other_rectory,
    financials.collection_other,
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
LEFT JOIN parish_analytics.agg_liturgical_month calendar ON calendar.date_key = financials.date_key;

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  DROP COLUMN IF EXISTS typhoon_days_count,
  DROP COLUMN IF EXISTS major_events_count,
  DROP COLUMN IF EXISTS minor_events_count,
  DROP COLUMN IF EXISTS has_event,
  DROP COLUMN IF EXISTS total_rainfall_mm;

ALTER TABLE school_analytics.fact_school_monthly_financials
  DROP COLUMN IF EXISTS typhoon_days_count,
  DROP COLUMN IF EXISTS major_events_count,
  DROP COLUMN IF EXISTS minor_events_count,
  DROP COLUMN IF EXISTS has_event,
  DROP COLUMN IF EXISTS total_rainfall_mm;

ALTER TABLE seminary_analytics.fact_seminary_monthly_financials
  DROP COLUMN IF EXISTS typhoon_days_count,
  DROP COLUMN IF EXISTS major_events_count,
  DROP COLUMN IF EXISTS minor_events_count,
  DROP COLUMN IF EXISTS has_event,
  DROP COLUMN IF EXISTS total_rainfall_mm;
