import unittest
from unittest import mock

import numpy as np
import pandas as pd

from app.services.descriptive import pastoral_assignment as pa


def _mock_no_assignments_get_table():
    mock_table = mock.MagicMock()
    mock_table.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []
    mock_table.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"institution_id": "p1"}
    ]
    return mock_table


class PastoralAssignmentStlTrendTests(unittest.TestCase):
    def test_trend_direction_reads_deseasonalized_trend_not_raw_endpoints(self):
        # Genuinely declining underlying trend, with a December seasonal
        # spike that could flip a naive first-vs-last comparison to "up" if
        # the spike happens to land near a period boundary.
        rng = np.random.default_rng(1)
        n = 30
        dates = pd.date_range("2022-01-01", periods=n, freq="MS")
        trend = np.linspace(150000, 90000, n)
        seasonal = np.where(dates.month == 12, 40000, 0)
        receipts = trend + seasonal + rng.normal(0, 2000, n)
        expenses = receipts * 0.8
        df = pd.DataFrame({"date": dates, "year": dates.year, "total_receipts": receipts, "total_expenses": expenses})

        with (
            mock.patch.object(pa._aws_financials, "parish_monthly_df", return_value=df),
            mock.patch.object(pa, "get_table", return_value=_mock_no_assignments_get_table()),
        ):
            result = pa._fetch_and_process("p1")

        self.assertEqual(result["performance_analysis"]["trend_direction"], "down")

    def test_collection_variance_pct_is_a_genuine_percentage(self):
        rng = np.random.default_rng(2)
        n = 24
        dates = pd.date_range("2022-01-01", periods=n, freq="MS")
        receipts = 100000 + rng.normal(0, 10000, n)
        expenses = receipts * 0.8
        df = pd.DataFrame({"date": dates, "year": dates.year, "total_receipts": receipts, "total_expenses": expenses})

        with (
            mock.patch.object(pa._aws_financials, "parish_monthly_df", return_value=df),
            mock.patch.object(pa, "get_table", return_value=_mock_no_assignments_get_table()),
        ):
            result = pa._fetch_and_process("p1")

        pa_result = result["performance_analysis"]
        self.assertIn("collection_variance_pct", pa_result)
        # A genuine percentage, unlike the co-existing raw
        # collection_variance_across_periods (squared-peso units, can run
        # into the hundreds of millions).
        self.assertLess(pa_result["collection_variance_pct"], 100)
        self.assertGreaterEqual(pa_result["collection_variance_pct"], 0)


if __name__ == "__main__":
    unittest.main()
