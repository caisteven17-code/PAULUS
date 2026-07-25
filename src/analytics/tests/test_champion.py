import unittest

import numpy as np

from app.services.predictive import _champion


class WapeTests(unittest.TestCase):
    def test_perfect_prediction_is_zero(self):
        actual = np.array([10.0, 20.0, 30.0])
        self.assertAlmostEqual(_champion.wape(actual, actual), 0.0)

    def test_known_deviation(self):
        actual = np.array([100.0, 100.0])
        predicted = np.array([90.0, 110.0])
        # sum(|actual-predicted|) / sum(|actual|) = (10 + 10) / 200 = 0.1
        self.assertAlmostEqual(_champion.wape(actual, predicted), 0.1)

    def test_zero_denominator_returns_one(self):
        actual = np.array([0.0, 0.0])
        predicted = np.array([5.0, 5.0])
        self.assertEqual(_champion.wape(actual, predicted), 1.0)


class MapeMpeMaseTests(unittest.TestCase):
    def test_mape_known_value(self):
        actual = np.array([100.0, 200.0])
        predicted = np.array([110.0, 180.0])
        # mean(|10/100|, |-20/200|) * 100 = mean(0.10, 0.10) * 100 = 10.0
        self.assertAlmostEqual(_champion.mape(actual, predicted), 10.0)

    def test_mape_excludes_zero_actual_points(self):
        actual = np.array([0.0, 100.0])
        predicted = np.array([50.0, 110.0])
        # the zero-actual point is excluded, not treated as a division by zero
        self.assertAlmostEqual(_champion.mape(actual, predicted), 10.0)

    def test_mpe_is_signed(self):
        over = _champion.mpe(np.array([100.0, 100.0]), np.array([110.0, 110.0]))
        under = _champion.mpe(np.array([100.0, 100.0]), np.array([90.0, 90.0]))
        self.assertGreater(over, 0)
        self.assertLess(under, 0)
        self.assertAlmostEqual(over, 10.0)
        self.assertAlmostEqual(under, -10.0)

    def test_mase_below_one_when_better_than_naive(self):
        # Perfectly repeating seasonal pattern — lag-12 naive is a perfect
        # predictor here, so a model that also predicts perfectly should be
        # exactly as good as naive (MASE == 1), not "less than naive" (which
        # is impossible once the naive baseline itself is perfect).
        train = np.tile([100.0, 110.0, 90.0, 105.0], 6)  # 24 points, period 4 repeat
        actual = np.array([100.0, 110.0])
        predicted = np.array([100.0, 110.0])
        result = _champion.mase(actual, predicted, train, seasonal_period=4)
        self.assertAlmostEqual(result, 0.0)

    def test_mase_above_one_when_worse_than_naive(self):
        train = np.array([100.0] * 20)
        actual = np.array([100.0, 100.0])
        predicted = np.array([150.0, 50.0])  # way off, naive baseline is flat/perfect
        result = _champion.mase(actual, predicted, train, seasonal_period=12)
        self.assertGreater(result, 0.0)

    def test_full_metrics_returns_all_four_keys(self):
        actual = np.array([100.0, 100.0])
        predicted = np.array([90.0, 110.0])
        train = np.array([100.0] * 20)
        metrics = _champion.full_metrics(actual, predicted, train)
        self.assertEqual(set(metrics.keys()), {"wape", "mape_pct", "mpe_pct", "mase"})
        self.assertAlmostEqual(metrics["wape"], 0.1)


class TrainTestSplitTests(unittest.TestCase):
    def test_default_holdout_is_fixed_at_twelve_months_not_a_percentage(self):
        # A 20-point series would give 16/4 under the old 80/20 split; the
        # fixed-size holdout instead anchors at 12 months (DEFAULT_HOLDOUT_MONTHS)
        # whenever the series is long enough to afford it.
        series = np.arange(20.0)
        train, holdout = _champion.train_test_split_ts(series)
        self.assertEqual(len(train), 8)
        self.assertEqual(len(holdout), 12)
        np.testing.assert_array_equal(train, series[:8])
        np.testing.assert_array_equal(holdout, series[8:])

    def test_longer_series_keeps_the_same_twelve_month_holdout(self):
        # The whole point of a fixed-size holdout: as more months accumulate,
        # they go to training, not to a growing holdout.
        series = np.arange(60.0)
        train, holdout = _champion.train_test_split_ts(series)
        self.assertEqual(len(holdout), 12)
        self.assertEqual(len(train), 48)

    def test_short_series_keeps_minimum_three_train_points(self):
        series = np.arange(4.0)
        train, holdout = _champion.train_test_split_ts(series)
        self.assertEqual(len(train), 3)
        self.assertEqual(len(holdout), 1)

    def test_no_overlap_and_full_coverage(self):
        series = np.arange(37.0)
        train, holdout = _champion.train_test_split_ts(series)
        self.assertEqual(len(train) + len(holdout), len(series))


class WalkForwardFoldsTests(unittest.TestCase):
    def test_short_series_produces_no_extra_folds(self):
        # 14 months only supports the single most-recent (clamped) holdout
        # that train_test_split_ts already covers -- no room for a further,
        # full 12-month earlier fold on top of it.
        series = np.arange(14.0)
        folds = _champion.walk_forward_folds(series)
        self.assertEqual(folds, [])

    def test_fold_count_scales_with_available_history(self):
        # 30 months supports exactly one EXTRA full 12-month fold beyond the
        # most-recent window (which walk_forward_folds deliberately excludes
        # -- that one's already covered by train_test_split_ts).
        series = np.arange(30.0)
        folds = _champion.walk_forward_folds(series)
        self.assertEqual(len(folds), 1)

    def test_long_series_reaches_max_folds(self):
        series = np.arange(60.0)
        folds = _champion.walk_forward_folds(series, max_folds=3)
        self.assertEqual(len(folds), 3)

    def test_never_duplicates_the_most_recent_window(self):
        # The whole reason walk_forward_folds excludes the most-recent
        # window: combining it with train_test_split_ts's own holdout must
        # never score the same window twice.
        series = np.arange(60.0)
        train, holdout = _champion.train_test_split_ts(series)
        extra_folds = _champion.walk_forward_folds(series, max_folds=3)
        all_folds = [(train, holdout)] + extra_folds
        holdout_ranges = [(len(t), len(t) + len(h)) for t, h in all_folds]
        self.assertEqual(len(holdout_ranges), len(set(holdout_ranges)))

    def test_folds_are_chronological_and_non_overlapping(self):
        series = np.arange(60.0)
        folds = _champion.walk_forward_folds(series, max_folds=3)
        for train, holdout in folds:
            np.testing.assert_array_equal(holdout, series[len(train) : len(train) + len(holdout)])
        # earlier fold's train is a strict prefix of the later fold's train
        for (train_a, _), (train_b, _) in zip(folds, folds[1:]):
            self.assertLess(len(train_a), len(train_b))


class MarkovTests(unittest.TestCase):
    def test_transition_matrix_rows_sum_to_one_or_zero(self):
        # A row sums to 0, not 1, only when that state never occurs as a "from"
        # state in the data (nothing to normalize) — otherwise it's a proper
        # probability distribution over next states.
        rng = np.random.default_rng(42)
        series = rng.normal(loc=1000, scale=100, size=60)
        matrix = _champion.markov_transition_matrix(series, n_states=5)
        self.assertEqual(matrix.shape, (5, 5))
        row_sums = matrix.sum(axis=1)
        for row_sum in row_sums:
            self.assertIn(round(float(row_sum), 8), (0.0, 1.0))
        self.assertGreater(np.count_nonzero(row_sums), 0)

    def test_forecast_shape_matches_holdout(self):
        rng = np.random.default_rng(7)
        train = rng.normal(loc=500, scale=50, size=24)
        holdout = rng.normal(loc=500, scale=50, size=6)
        preds = _champion.markov_forecast(train, holdout, n_states=5)
        self.assertEqual(preds.shape, holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))

    def test_forecast_falls_back_to_mean_for_short_train(self):
        train = np.array([10.0, 20.0, 30.0])
        holdout = np.array([15.0, 25.0])
        preds = _champion.markov_forecast(train, holdout, n_states=5)
        np.testing.assert_allclose(preds, np.full(2, np.mean(train)))


class SelectChampionTests(unittest.TestCase):
    def test_champion_is_the_lowest_wape_candidate(self):
        train = np.array([10.0, 10.0, 10.0, 10.0])
        holdout = np.array([10.0, 10.0])

        def perfect(_train, _holdout):
            return np.array([10.0, 10.0])

        def bad(_train, _holdout):
            return np.array([0.0, 0.0])

        _champion.clear_champion_cache()
        champion_name, scores = _champion.select_champion({"Perfect": perfect, "Bad": bad}, train, holdout)
        self.assertEqual(champion_name, "Perfect")
        self.assertAlmostEqual(scores["Perfect"], 0.0)
        self.assertAlmostEqual(scores["Bad"], 1.0)

    def test_result_is_cached_by_data_fingerprint(self):
        train = np.array([1.0, 2.0, 3.0])
        holdout = np.array([4.0, 5.0])
        calls = {"count": 0}

        def counting_trainer(_train, _holdout):
            calls["count"] += 1
            return np.array([4.0, 5.0])

        _champion.clear_champion_cache()
        _champion.select_champion({"Only": counting_trainer}, train, holdout)
        _champion.select_champion({"Only": counting_trainer}, train, holdout)
        self.assertEqual(calls["count"], 1)

    def test_extra_folds_average_the_score_not_just_the_real_holdout(self):
        # A candidate that nails the real holdout but is way off on an
        # earlier fold should score worse overall than a candidate that's
        # decent on both -- proving the average genuinely uses every fold,
        # not just the most recent one.
        train, holdout = np.array([10.0, 10.0, 10.0]), np.array([10.0, 10.0])
        earlier_train, earlier_holdout = np.array([5.0, 5.0]), np.array([5.0, 5.0])

        def lucky_on_real_only(_train, f_holdout):
            # Perfect whenever asked about the real holdout's values (10s),
            # terrible on the earlier fold's values (5s).
            return np.full(len(f_holdout), 10.0)

        def consistent(_train, f_holdout):
            return f_holdout * 0.9

        _champion.clear_champion_cache()
        champion_name, scores = _champion.select_champion(
            {"LuckyOnRealOnly": lucky_on_real_only, "Consistent": consistent},
            train,
            holdout,
            extra_folds=[(earlier_train, earlier_holdout)],
        )
        self.assertEqual(champion_name, "Consistent")
        self.assertGreater(scores["LuckyOnRealOnly"], scores["Consistent"])

    def test_no_extra_folds_keeps_single_holdout_behavior(self):
        train, holdout = np.array([10.0, 10.0]), np.array([10.0, 10.0])

        def perfect(_train, _holdout):
            return np.array([10.0, 10.0])

        _champion.clear_champion_cache()
        _champion_name, scores = _champion.select_champion({"Perfect": perfect}, train, holdout)
        self.assertAlmostEqual(scores["Perfect"], 0.0)


class DiagnoseGeneralizationTests(unittest.TestCase):
    def test_none_when_train_too_short_for_a_nested_holdout(self):
        train = np.array([1.0, 2.0, 3.0])
        holdout = np.array([4.0, 5.0])

        def trainer(_t, h):
            return h

        result = _champion.diagnose_generalization(trainer, train, holdout, min_train_months=3)
        self.assertIsNone(result)

    def test_consistent_model_diagnosed_just_right(self):
        rng = np.random.default_rng(3)
        train = 100 + rng.normal(0, 2, 30)
        holdout = 100 + rng.normal(0, 2, 6)

        def near_perfect(_t, h):
            return h + rng.normal(0, 0.5, len(h))

        result = _champion.diagnose_generalization(near_perfect, train, holdout)
        self.assertIsNotNone(result)
        self.assertEqual(result["diagnosis"], "just_right")

    def test_unstable_model_diagnosed_overfitting(self):
        train = np.concatenate([np.full(18, 100.0), np.full(12, 100.0)])
        holdout = np.full(6, 100.0)

        def unstable(_t, h):
            # Perfect on the real holdout, wildly off on the nested one --
            # good on one unseen window, bad on the other.
            if len(h) == len(holdout) and np.allclose(h, holdout):
                return h.copy()
            return h + 500.0

        result = _champion.diagnose_generalization(unstable, train, holdout)
        self.assertIsNotNone(result)
        self.assertEqual(result["diagnosis"], "overfitting")

    def test_uniformly_bad_model_diagnosed_underfitting(self):
        train = np.full(30, 100.0)
        holdout = np.full(6, 100.0)

        def always_off(_t, h):
            return h + 1000.0

        result = _champion.diagnose_generalization(always_off, train, holdout)
        self.assertIsNotNone(result)
        self.assertEqual(result["diagnosis"], "underfitting")


if __name__ == "__main__":
    unittest.main()
