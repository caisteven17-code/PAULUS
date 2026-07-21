import unittest
from unittest.mock import patch

from app.services import weather_loader


class WeatherAwsOwnershipTests(unittest.TestCase):
    @patch.object(weather_loader.analytics_db, "fetch_query")
    @patch.object(weather_loader.analytics_db, "upsert_rows")
    def test_daily_weather_upserts_to_aws_reference_schema(self, upsert_rows, fetch_query):
        fetch_query.return_value = [
            {"column_name": column}
            for column in (
                "date",
                "municipality",
                "nasa_power_rainfall_mm",
                "validators_agreed",
                "wmo_quality_flag",
            )
        ]
        rows = [{
            "date": "2026-07-01",
            "municipality": "Example",
            "nasa_power_rainfall_mm": 1,
            "validators_agreed": 0,
        }]

        loaded = weather_loader._upsert_daily_table("weather_rainfall_daily", rows)

        self.assertEqual(loaded, 1)
        upsert_rows.assert_called_once_with(
            "reference",
            "weather_rainfall_daily",
            rows,
            "date,municipality",
        )

    @patch.object(weather_loader.analytics_db, "call_function")
    def test_monthly_rebuild_runs_inside_aws(self, call_function):
        call_function.return_value = 12

        rebuilt = weather_loader.rebuild_monthly_summary("2026-01-01", "2026-12-31")

        self.assertEqual(rebuilt, 12)
        call_function.assert_called_once_with(
            "reference",
            "rebuild_weather_monthly_summary",
            p_period_start="2026-01-01",
            p_period_end="2026-12-31",
        )


if __name__ == "__main__":
    unittest.main()
