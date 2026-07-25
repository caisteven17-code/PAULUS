import unittest
from unittest import mock

import numpy as np

from app.services.prescriptive import parish_upgrade as pu


class DeaEfficiencyScoringTests(unittest.TestCase):
    def test_same_output_different_cost_is_correctly_distinguished(self):
        """The old fake DEA (`output_i / max(output)`) couldn't tell two
        parishes with identical collections apart, even if one spent far more
        to get there. The real input-oriented DEA must."""
        parishes = [
            {"avg_collection": 5000.0, "avg_expenses": 500.0},  # efficient
            {"avg_collection": 5000.0, "avg_expenses": 4000.0},  # same output, wasteful
        ]
        inputs = np.array([[p["avg_expenses"]] for p in parishes])
        outputs = np.array([p["avg_collection"] for p in parishes])

        scores = []
        for i in range(len(parishes)):
            result = pu._dea_target_floor(i, inputs, outputs)
            scores.append(result[0] if result is not None else 0.5)

        self.assertAlmostEqual(scores[0], 1.0, places=2)
        self.assertLess(scores[1], scores[0])


def _make_parish_series(rng, n_months, base):
    import pandas as pd

    dates = pd.date_range("2022-01-01", periods=n_months, freq="MS")
    receipts = base + rng.normal(0, base * 0.05, n_months)
    expenses = receipts * 0.85
    return pd.DataFrame({"date": dates, "total_receipts": receipts, "total_expenses": expenses})


class ActionabilityRateThresholdTests(unittest.TestCase):
    def test_pass_flag_is_native_bool_and_reflects_threshold(self):
        rng = np.random.default_rng(1)
        # Deliberately many parishes needing upgrades against a budget only
        # large enough to fund a small fraction of them -> low actionability.
        series = [(f"p{i}", _make_parish_series(rng, 24, 50000 + i * 100)) for i in range(10)]

        with mock.patch.object(pu._aws_financials, "all_parish_monthly_dfs", return_value=series):
            result = pu._fetch_and_process(budget=50000.0, upgrade_cost=50000.0)

        self.assertIn("actionability_rate_pass", result)
        self.assertIs(type(result["actionability_rate_pass"]), bool)
        expected = result["actionability_rate"] >= pu.KPI_PARISH_UPGRADE_ACTIONABILITY_RATE_MIN
        self.assertEqual(result["actionability_rate_pass"], expected)

    def test_insufficient_data_branch_reports_failing_pass_flag(self):
        with mock.patch.object(pu._aws_financials, "all_parish_monthly_dfs", return_value=None):
            with mock.patch.object(pu, "get_table") as mock_get_table:
                mock_get_table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
                result = pu._fetch_and_process()

        self.assertFalse(result["data_sufficient"])
        self.assertFalse(result["actionability_rate_pass"])


if __name__ == "__main__":
    unittest.main()
