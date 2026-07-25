import unittest

import numpy as np

from app.services.prescriptive import financial_recommendation as fr


class DeaTargetFloorTests(unittest.TestCase):
    def setUp(self):
        # 5 peers, 2 expense categories. Peers 0/1 sit on the efficient
        # frontier (spend scales linearly with receipts); peers 2/3/4 spend
        # more than the frontier for the same receipts level.
        self.outputs = np.array([1000.0, 5000.0, 1000.0, 5000.0, 3000.0])
        self.inputs = np.array(
            [
                [100.0, 50.0],  # peer0: efficient, small
                [500.0, 250.0],  # peer1: efficient, large (defines the frontier)
                [200.0, 100.0],  # peer2: inefficient, small
                [900.0, 450.0],  # peer3: inefficient, large
                [400.0, 200.0],  # peer4: mid
            ]
        )

    def test_inefficient_peer_gets_the_frontiers_floor_not_its_own_spend(self):
        result = fr._dea_target_floor(3, self.inputs, self.outputs)
        self.assertIsNotNone(result)
        theta, target = result
        # Should match peer1's efficient levels, not peer3's own (900, 450)
        np.testing.assert_allclose(target, [500.0, 250.0], atol=1.0)
        self.assertLess(theta, 1.0)  # genuinely inefficient — theta < 1

    def test_already_efficient_peer_gets_its_own_spend_back(self):
        result = fr._dea_target_floor(1, self.inputs, self.outputs)
        self.assertIsNotNone(result)
        theta, target = result
        np.testing.assert_allclose(target, [500.0, 250.0], atol=1.0)
        self.assertAlmostEqual(theta, 1.0, places=2)  # on the frontier — theta == 1


class SolveLpTests(unittest.TestCase):
    def test_overspender_shows_real_savings(self):
        result = fr._solve_lp(5000.0, {"cat_a": 900.0, "cat_b": 450.0}, {"cat_a": 500.0, "cat_b": 250.0})
        self.assertTrue(result["optimal"])
        self.assertGreaterEqual(result["allocation"]["cat_a"], 500.0 - 0.01)
        self.assertGreater(result["disbursement_saved_pct"], 0)

    def test_floor_above_historical_ceiling_is_not_silently_suppressed(self):
        # Historical spend is tiny (100/50) but the floor (500/250) legitimately
        # exceeds the old `avg_exp * 1.1` ceiling — the floor must still win.
        result = fr._solve_lp(5000.0, {"cat_a": 100.0, "cat_b": 50.0}, {"cat_a": 500.0, "cat_b": 250.0})
        self.assertTrue(result["optimal"])
        self.assertGreaterEqual(result["allocation"]["cat_a"], 500.0 - 0.01)

    def test_spending_increase_is_reported_honestly_not_clamped_to_zero(self):
        result = fr._solve_lp(5000.0, {"cat_a": 100.0, "cat_b": 50.0}, {"cat_a": 500.0, "cat_b": 250.0})
        self.assertLess(result["disbursement_saved_pct"], 0)

    def test_no_floor_falls_back_to_zero_lower_bound(self):
        result = fr._solve_lp(5000.0, {"cat_a": 900.0, "cat_b": 450.0}, None)
        self.assertTrue(result["optimal"])
        self.assertEqual(result["allocation"]["cat_a"], 0.0)


class ComputeFloorFallbackTests(unittest.TestCase):
    def test_too_few_peers_falls_back_to_self_referential_floor(self):
        # No real peer pool available (simulated by monkeypatching) — must not
        # collapse to "recommend spending zero everywhere" (the seminary case:
        # only 2 seminaries diocese-wide can never clear _MIN_PEERS_FOR_DEA).
        original = fr._fetch_peer_pool
        fr._fetch_peer_pool = lambda entity_type: []
        try:
            category_avgs = {"cat_a": 200.0, "cat_b": 100.0}
            floor = fr._compute_floor("seminary-1", "seminary", 3000.0, category_avgs)
            self.assertAlmostEqual(floor["cat_a"], 100.0)
            self.assertAlmostEqual(floor["cat_b"], 50.0)
        finally:
            fr._fetch_peer_pool = original


if __name__ == "__main__":
    unittest.main()
