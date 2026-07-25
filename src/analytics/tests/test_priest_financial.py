import unittest

import numpy as np
import pandas as pd

from app.services.diagnostic import priest_financial as pf


class AssignmentFeatureTests(unittest.TestCase):
    def test_tenure_resets_at_each_assignment_start(self):
        dates = pd.date_range("2022-01-01", periods=24, freq="MS").tolist()
        assignments = [
            {"priest_id": "p1", "start_date": "2022-01-01", "end_date": "2022-12-31"},
            {"priest_id": "p2", "start_date": "2023-01-01", "end_date": None},
        ]
        tenure, transition = pf._assignment_features(dates, assignments)
        self.assertEqual(tenure[0], 0)
        self.assertEqual(tenure[11], 11)
        self.assertEqual(tenure[12], 0)  # resets at the second assignment's start

    def test_transition_flag_only_near_a_real_start(self):
        dates = pd.date_range("2022-01-01", periods=24, freq="MS").tolist()
        assignments = [{"priest_id": "p1", "start_date": "2023-01-01", "end_date": None}]
        _tenure, transition = pf._assignment_features(dates, assignments)
        self.assertEqual(transition[6], 0)  # far from the only transition
        self.assertEqual(transition[12], 1)  # the transition month itself

    def test_no_assignments_returns_all_zeros(self):
        dates = pd.date_range("2022-01-01", periods=12, freq="MS").tolist()
        tenure, transition = pf._assignment_features(dates, [])
        np.testing.assert_array_equal(tenure, np.zeros(12))
        np.testing.assert_array_equal(transition, np.zeros(12))


class PrePostTransitionEffectTests(unittest.TestCase):
    def test_detects_a_real_jump_around_a_transition(self):
        dates = pd.date_range("2022-01-01", periods=24, freq="MS").tolist()
        y = np.array([100.0] * 12 + [200.0] * 12)
        effect = pf._pre_post_transition_effect(dates, y, [pd.Timestamp("2023-01-01")], window=2)
        self.assertGreater(effect, 50)

    def test_no_transitions_returns_zero(self):
        dates = pd.date_range("2022-01-01", periods=12, freq="MS").tolist()
        y = np.arange(12, dtype=float)
        self.assertEqual(pf._pre_post_transition_effect(dates, y, [], window=2), 0.0)


class PartialCorrelationTests(unittest.TestCase):
    def test_isolates_target_association_after_controlling_for_others(self):
        rng = np.random.default_rng(1)
        n = 60
        other = rng.normal(0, 1, size=(n, 2))
        target = rng.normal(0, 1, size=n)
        y = 2 * target + other[:, 0] + rng.normal(0, 0.05, n)
        corr = pf._partial_correlation(y, target, other)
        self.assertGreater(corr, 0.8)

    def test_constant_target_does_not_crash(self):
        y = np.arange(10, dtype=float)
        target = np.zeros(10)
        other = np.zeros((10, 0))
        self.assertEqual(pf._partial_correlation(y, target, other), 0.0)


if __name__ == "__main__":
    unittest.main()
