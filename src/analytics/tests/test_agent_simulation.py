import unittest

import numpy as np
import pandas as pd

from app.services.prescriptive import _agent_simulation as asim


def _make_series(rng, n_months, base, subsidized_from=None, start="2021-01-01"):
    dates = pd.date_range(start, periods=n_months, freq="MS")
    receipts = base + rng.normal(0, base * 0.05, n_months)
    expenses = receipts * 0.85
    subsidy = np.zeros(n_months)
    if subsidized_from is not None:
        subsidy[subsidized_from:] = base * 0.25
        receipts[subsidized_from:] += subsidy[subsidized_from:]
    return pd.DataFrame(
        {"date": dates, "total_receipts": receipts, "total_expenses": expenses, "subsidy_receipts": subsidy}
    )


class BuildParishAgentTests(unittest.TestCase):
    def test_subsidized_agent_flagged_correctly(self):
        rng = np.random.default_rng(1)
        df = _make_series(rng, 36, 100000, subsidized_from=24)
        agent = asim.build_parish_agent("p1", df)
        self.assertTrue(agent.is_subsidized)
        self.assertGreater(agent.avg_monthly_subsidy, 0)

    def test_non_subsidized_agent_flagged_correctly(self):
        rng = np.random.default_rng(1)
        df = _make_series(rng, 36, 100000)
        agent = asim.build_parish_agent("p2", df)
        self.assertFalse(agent.is_subsidized)
        self.assertEqual(agent.avg_monthly_subsidy, 0.0)

    def test_single_point_series_uses_default_volatility(self):
        df = pd.DataFrame({"total_receipts": [100000.0], "total_expenses": [90000.0]})
        agent = asim.build_parish_agent("p3", df)
        self.assertEqual(agent.volatility, asim._DEFAULT_VOLATILITY)


class SubsidyPoolTests(unittest.TestCase):
    def test_pool_only_sums_subsidized_agents(self):
        rng = np.random.default_rng(2)
        sub = asim.build_parish_agent("sub", _make_series(rng, 36, 100000, subsidized_from=24))
        nonsub = asim.build_parish_agent("nonsub", _make_series(rng, 36, 100000))
        pool = asim.diocese_subsidy_pool([sub, nonsub])
        self.assertAlmostEqual(pool, sub.avg_monthly_subsidy)

    def test_non_subsidized_agent_has_zero_pool_share(self):
        rng = np.random.default_rng(2)
        sub = asim.build_parish_agent("sub", _make_series(rng, 36, 100000, subsidized_from=24))
        nonsub = asim.build_parish_agent("nonsub", _make_series(rng, 36, 100000))
        pool = asim.diocese_subsidy_pool([sub, nonsub])
        self.assertEqual(asim.pool_share(nonsub, pool), 0.0)
        self.assertGreater(asim.pool_share(sub, pool), 0.0)


class MonteCarloTests(unittest.TestCase):
    def test_pool_shock_only_affects_subsidized_agents(self):
        rng = np.random.default_rng(3)
        sub = asim.build_parish_agent("sub", _make_series(rng, 36, 100000, subsidized_from=24))
        nonsub = asim.build_parish_agent("nonsub", _make_series(rng, 36, 100000))
        pool = asim.diocese_subsidy_pool([sub, nonsub])

        sub_share = asim.pool_share(sub, pool)
        nonsub_share = asim.pool_share(nonsub, pool)

        sub_shocked = asim.run_monte_carlo(sub, 6, 0.0, -50.0, sub_share, seed=42)
        sub_unshocked = asim.run_monte_carlo(sub, 6, 0.0, 0.0, sub_share, seed=42)
        self.assertFalse(np.allclose(sub_shocked, sub_unshocked))

        nonsub_shocked = asim.run_monte_carlo(nonsub, 6, 0.0, -50.0, nonsub_share, seed=42)
        nonsub_unshocked = asim.run_monte_carlo(nonsub, 6, 0.0, 0.0, nonsub_share, seed=42)
        np.testing.assert_allclose(nonsub_shocked, nonsub_unshocked)

    def test_summarized_paths_are_internally_ordered(self):
        rng = np.random.default_rng(4)
        agent = asim.build_parish_agent("p", _make_series(rng, 36, 100000))
        paths = asim.run_monte_carlo(agent, 12, 2.0, 0.0, 0.0, seed=7)
        summary = asim.summarize_paths(paths)
        self.assertEqual(len(summary), 12)
        for row in summary:
            self.assertLessEqual(row["worst_case"], row["most_likely"])
            self.assertLessEqual(row["most_likely"], row["best_case"])

    def test_performance_ratio_shifts_the_whole_range(self):
        rng = np.random.default_rng(5)
        agent = asim.build_parish_agent("p", _make_series(rng, 36, 100000))
        baseline_paths = asim.run_monte_carlo(agent, 6, 0.0, 0.0, 0.0, performance_ratio=1.0, seed=1)
        boosted_paths = asim.run_monte_carlo(agent, 6, 0.0, 0.0, 0.0, performance_ratio=1.3, seed=1)
        self.assertGreater(boosted_paths[:, 0].mean(), baseline_paths[:, 0].mean())


class PriestAgentTests(unittest.TestCase):
    def test_no_assignment_history_returns_none(self):
        from unittest import mock

        with mock.patch.object(asim, "_fetch_priest_assignment_history", return_value=[]):
            self.assertIsNone(asim.build_priest_agent("unknown_priest"))

    def test_ratio_reflects_relative_boost_during_tenure(self):
        from unittest import mock

        rng = np.random.default_rng(6)
        df = _make_series(rng, 36, 100000)
        mask = (df["date"] >= "2022-01-01") & (df["date"] <= "2022-12-01")
        df.loc[mask, "total_receipts"] *= 1.5

        assignments = [{"institution_id": "parish_x", "start_date": "2022-01-01", "end_date": "2022-12-01"}]
        with (
            mock.patch.object(asim, "_fetch_priest_assignment_history", return_value=assignments),
            mock.patch.object(asim._aws_financials, "parish_monthly_df", return_value=df),
        ):
            agent = asim.build_priest_agent("strong_priest")

        self.assertIsNotNone(agent)
        self.assertGreater(agent.performance_ratio, 1.0)
        self.assertEqual(agent.n_assignments_observed, 1)


if __name__ == "__main__":
    unittest.main()
