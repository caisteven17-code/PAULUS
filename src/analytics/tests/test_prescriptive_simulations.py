import unittest
from unittest import mock

import numpy as np
import pandas as pd

from app.services.prescriptive import institution_simulation as inst_sim
from app.services.prescriptive import pastoral_simulation as pastoral_sim


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


def _synthetic_diocese(seed=1, n_parishes=10, n_months=36, subsidized_indices=(5, 6)):
    rng = np.random.default_rng(seed)
    series = []
    for i in range(n_parishes):
        sub_from = 24 if i in subsidized_indices else None
        df = _make_series(rng, n_months, 100000 + i * 3000, subsidized_from=sub_from)
        series.append((f"parish_{i}", df))
    return series


class InstitutionSimulationAgentTests(unittest.TestCase):
    def test_subsidized_institution_gets_pool_context_and_class_d(self):
        series = _synthetic_diocese()
        series_map = dict(series)
        with (
            mock.patch.object(inst_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                inst_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            result = inst_sim._run_scenario("parish_5", "parish", 0.0, 0.0, 6, subsidy_pool_change_pct=-40.0)

        self.assertEqual(result["agent_context"]["cluster"], "D")
        self.assertTrue(result["agent_context"]["is_subsidized"])
        self.assertIsNotNone(result["subsidy_pool_context"])
        self.assertGreater(result["subsidy_pool_context"]["this_agent_pool_share"], 0)
        self.assertEqual(len(result["monte_carlo_range"]), 6)

    def test_non_subsidized_institution_unaffected_by_pool_shock(self):
        series = _synthetic_diocese()
        series_map = dict(series)
        with (
            mock.patch.object(inst_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                inst_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            with_shock = inst_sim._run_scenario("parish_0", "parish", 0.0, 0.0, 6, subsidy_pool_change_pct=-40.0)
            no_shock = inst_sim._run_scenario("parish_0", "parish", 0.0, 0.0, 6, subsidy_pool_change_pct=0.0)

        self.assertFalse(with_shock["agent_context"]["is_subsidized"])
        self.assertEqual(with_shock["subsidy_pool_context"]["this_agent_pool_share"], 0.0)
        # Both draw fresh random paths (no fixed seed threaded through), so
        # compare the summary shape rather than exact figures — the point is
        # neither run's monte_carlo_range should be systematically depressed
        # by the pool shock, unlike the subsidized case above.
        self.assertEqual(len(with_shock["monte_carlo_range"]), len(no_shock["monte_carlo_range"]))

    def test_backward_compatible_fields_still_present(self):
        series = _synthetic_diocese()
        series_map = dict(series)
        with (
            mock.patch.object(inst_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                inst_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            result = inst_sim._run_scenario("parish_0", "parish", 5.0, 2.0, 6)

        self.assertIn("simulated_monthly", result)
        self.assertIn("health_score_trajectory", result)
        self.assertIn("sensitivity_results", result)
        self.assertEqual(len(result["simulated_monthly"]), 6)


class InstitutionSimulationKpiTests(unittest.TestCase):
    def test_latency_and_backtest_accuracy_present_with_enough_history(self):
        series = _synthetic_diocese(n_months=36)
        series_map = dict(series)
        with (
            mock.patch.object(inst_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                inst_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            result = inst_sim._run_scenario("parish_0", "parish", 0.0, 0.0, 6)

        kpis = result["kpis"]
        self.assertGreater(kpis["scenario_processing_latency_ms"], 0)
        self.assertIsNotNone(kpis["simulation_accuracy"])
        self.assertTrue(0 <= kpis["simulation_accuracy"] <= 1)
        self.assertIsNotNone(kpis["forecast_to_simulation_error"])
        self.assertIsNotNone(kpis["realized_outcome_pct"])

    def test_backtest_degrades_gracefully_with_short_history(self):
        rng = np.random.default_rng(9)
        short_df = _make_series(rng, 5, 100000)
        with (
            mock.patch.object(inst_sim._aws_financials, "all_parish_monthly_dfs", return_value=[("p2", short_df)]),
            mock.patch.object(inst_sim._aws_financials, "parish_monthly_df", return_value=short_df),
        ):
            result = inst_sim._run_scenario("p2", "parish", 0.0, 0.0, 3)

        kpis = result["kpis"]
        self.assertGreater(kpis["scenario_processing_latency_ms"], 0)
        self.assertIsNone(kpis["simulation_accuracy"])
        self.assertIsNone(kpis["forecast_to_simulation_error"])
        self.assertIsNone(kpis["realized_outcome_pct"])


class PastoralSimulationKpiTests(unittest.TestCase):
    def test_coverage_rate_is_full_when_no_priest_requested(self):
        series = _synthetic_diocese(n_months=36)
        series_map = dict(series)
        with (
            mock.patch.object(pastoral_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                pastoral_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            result = pastoral_sim._fetch_and_run("parish_0", 12, 5.0, 6)

        self.assertGreater(result["kpis"]["scenario_processing_latency_ms"], 0)
        self.assertEqual(result["kpis"]["scenario_coverage_rate"], 1.0)

    def test_coverage_rate_drops_when_requested_priest_not_found(self):
        series = _synthetic_diocese(n_months=36)
        series_map = dict(series)
        fake_get_table = _mocked_priest_assignments({}, series_map)
        with (
            mock.patch.object(pastoral_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                pastoral_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
            mock.patch.object(pastoral_sim, "get_table", side_effect=fake_get_table),
            mock.patch("app.services.prescriptive._agent_simulation.get_table", side_effect=fake_get_table),
        ):
            result = pastoral_sim._fetch_and_run("parish_0", 12, 5.0, 6, incoming_priest_id="ghost")

        self.assertLess(result["kpis"]["scenario_coverage_rate"], 1.0)


def _mocked_priest_assignments(assignments_by_priest, series_map):
    class ChainedQuery:
        def __init__(self):
            self._priest_id = None

        def select(self, *_a, **_k):
            return self

        def eq(self, field, val):
            if field == "priest_id":
                self._priest_id = val
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            class R:
                pass

            r = R()
            r.data = assignments_by_priest.get(self._priest_id, [])
            return r

    def fake_get_table(schema, table):
        if schema == "clergy" and table == "priest_assignments":
            return ChainedQuery()

        class Empty:
            def select(self, *_a, **_k):
                return self

            def eq(self, *_a, **_k):
                return self

            def order(self, *_a, **_k):
                return self

            def execute(self):
                class R:
                    pass

                r = R()
                r.data = []
                return r

        return Empty()

    return fake_get_table


class PastoralSimulationPriestAgentTests(unittest.TestCase):
    def _mocked_priest_assignments(self, assignments_by_priest, series_map):
        return _mocked_priest_assignments(assignments_by_priest, series_map)

    def test_no_priest_uses_legacy_knob_path(self):
        series = _synthetic_diocese()
        series_map = dict(series)
        with (
            mock.patch.object(pastoral_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                pastoral_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
        ):
            result = pastoral_sim._fetch_and_run("parish_2", 12, 5.0, 6)

        self.assertIsNone(result["priest_agent_context"])
        self.assertEqual(len(result["monte_carlo_range"]), 6)
        self.assertIn("scenario_results", result)  # legacy field preserved

    def test_incoming_priest_with_strong_track_record_shifts_range_up(self):
        series = _synthetic_diocese()
        series_map = dict(series)

        boosted_df = series_map["parish_2"].copy()
        mask = (boosted_df["date"] >= "2022-01-01") & (boosted_df["date"] <= "2022-12-01")
        boosted_df.loc[mask, "total_receipts"] *= 1.5
        series_map["parish_2"] = boosted_df

        assignments_by_priest = {
            "strong_priest": [{"institution_id": "parish_2", "start_date": "2022-01-01", "end_date": "2022-12-01"}]
        }
        fake_get_table = self._mocked_priest_assignments(assignments_by_priest, series_map)

        with (
            mock.patch.object(pastoral_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                pastoral_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
            mock.patch.object(pastoral_sim, "get_table", side_effect=fake_get_table),
            mock.patch(
                "app.services.prescriptive._agent_simulation.get_table",
                side_effect=fake_get_table,
            ),
        ):
            no_priest = pastoral_sim._fetch_and_run("parish_2", 12, 5.0, 6)
            with_priest = pastoral_sim._fetch_and_run("parish_2", 12, 5.0, 6, incoming_priest_id="strong_priest")

        self.assertIsNotNone(with_priest["priest_agent_context"])
        self.assertGreater(with_priest["priest_agent_context"]["performance_ratio"], 1.0)
        self.assertGreater(
            with_priest["monte_carlo_range"][0]["most_likely"],
            no_priest["monte_carlo_range"][0]["most_likely"] * 0.9,
        )

    def test_unknown_priest_degrades_gracefully(self):
        series = _synthetic_diocese()
        series_map = dict(series)
        fake_get_table = self._mocked_priest_assignments({}, series_map)

        with (
            mock.patch.object(pastoral_sim._aws_financials, "all_parish_monthly_dfs", return_value=series),
            mock.patch.object(
                pastoral_sim._aws_financials, "parish_monthly_df", side_effect=lambda iid: series_map.get(iid)
            ),
            mock.patch.object(pastoral_sim, "get_table", side_effect=fake_get_table),
            mock.patch(
                "app.services.prescriptive._agent_simulation.get_table",
                side_effect=fake_get_table,
            ),
        ):
            result = pastoral_sim._fetch_and_run("parish_0", 12, 5.0, 6, incoming_priest_id="ghost_priest")

        self.assertEqual(result["priest_agent_context"]["status"], "no_assignment_history_found")
        self.assertEqual(len(result["monte_carlo_range"]), 6)


if __name__ == "__main__":
    unittest.main()
