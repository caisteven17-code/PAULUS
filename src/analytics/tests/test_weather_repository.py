import unittest
from unittest.mock import patch

from app.services import weather_repository


class WeatherRepositoryTests(unittest.TestCase):
    @patch.object(weather_repository.analytics_db, "fetch_query")
    def test_query_is_routed_to_configured_aws_silver(self, fetch_query):
        fetch_query.return_value = [{"municipality": "Example"}]

        response = (
            weather_repository.get_table("reference", "weather_monthly_summary")
            .select("municipality,year_month")
            .eq("municipality", "Example")
            .gte("year_month", "2026-01-01")
            .order("year_month")
            .range(0, 99)
            .execute()
        )

        self.assertEqual(response.data, [{"municipality": "Example"}])
        statement, params = fetch_query.call_args.args
        self.assertIn(
            f'FROM "{weather_repository._WEATHER_SILVER_SCHEMA}".'
            f'"{weather_repository._TABLE_ALIASES["weather_monthly_summary"]}"',
            statement,
        )
        self.assertEqual(params, ["Example", "2026-01-01", 100, 0])

    def test_non_weather_table_is_rejected(self):
        with self.assertRaises(ValueError):
            weather_repository.get_table("reference", "liturgical_calendar")


if __name__ == "__main__":
    unittest.main()

