import unittest

import numpy as np

from app.services.predictive import financial_forecast
from scripts import evaluate_financial_models as eval_models


def _synthetic_series(n_months: int = 36, seed: int = 42) -> np.ndarray:
    """Linear trend + yearly seasonality + noise, fixed seed for reproducible tests."""
    rng = np.random.default_rng(seed)
    months = np.arange(n_months)
    trend = 1000.0 + 15.0 * months
    seasonality = 150.0 * np.sin(2 * np.pi * months / 12)
    noise = rng.normal(0, 30, size=n_months)
    return np.maximum(trend + seasonality + noise, 0.0)


class BaseTrainerTests(unittest.TestCase):
    """Each trainer should return one prediction per holdout point and never NaN/inf,
    regardless of which statistical library backs it."""

    def setUp(self):
        series = _synthetic_series()
        self.train, self.holdout = series[:28], series[28:]

    def _assert_well_formed(self, preds: np.ndarray):
        self.assertEqual(preds.shape, self.holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))

    def test_holtwinters_trainer(self):
        preds = financial_forecast._holtwinters_trainer(self.train, self.holdout)
        self._assert_well_formed(np.asarray(preds))

    def test_sarima_trainer(self):
        preds = financial_forecast._sarima_trainer(self.train, self.holdout)
        self._assert_well_formed(np.asarray(preds))

    def test_xgboost_trainer(self):
        preds = financial_forecast._xgboost_trainer(self.train, self.holdout)
        self._assert_well_formed(np.asarray(preds))

    def test_prophet_trainer(self):
        preds = financial_forecast._prophet_trainer(self.train, self.holdout)
        self._assert_well_formed(np.asarray(preds))

    def test_champion_selection_picks_a_finite_wape(self):
        from app.services.predictive._champion import clear_champion_cache, select_champion

        clear_champion_cache()
        champion_name, scores = select_champion(financial_forecast._CANDIDATES, self.train, self.holdout)
        self.assertIn(champion_name, financial_forecast._CANDIDATES)
        self.assertTrue(np.isfinite(scores[champion_name]))
        self.assertLess(scores[champion_name], 1.0)  # sanity bound: better than "predict zero"


class MetricFunctionTests(unittest.TestCase):
    def test_wape_pct_known_value(self):
        actual = np.array([100.0, 100.0])
        predicted = np.array([90.0, 110.0])
        self.assertAlmostEqual(eval_models._wape_pct(actual, predicted), 10.0)

    def test_wape_pct_zero_actual_zero_predicted_is_zero(self):
        actual = np.array([0.0, 0.0])
        predicted = np.array([0.0, 0.0])
        self.assertEqual(eval_models._wape_pct(actual, predicted), 0.0)

    def test_metrics_bundle_matches_hand_calculation(self):
        actual = np.array([100.0, 200.0])
        predicted = np.array([110.0, 180.0])
        metrics = eval_models._metrics(actual, predicted)
        # residual = predicted - actual = [10, -20]
        self.assertAlmostEqual(metrics["mae"], 15.0)
        self.assertAlmostEqual(metrics["rmse"], float(np.sqrt(np.mean([100.0, 400.0]))))
        self.assertAlmostEqual(metrics["mpe_pct"], (10.0 - 20.0) / 300.0 * 100)
        self.assertAlmostEqual(metrics["actual_total"], 300.0)
        self.assertAlmostEqual(metrics["predicted_total"], 290.0)


class ExogenousTrainerTests(unittest.TestCase):
    """Exogenous-feature trainers must degrade gracefully to their non-exogenous
    counterpart when no usable exogenous data is supplied, and produce well-formed
    output when it is."""

    def setUp(self):
        series = _synthetic_series()
        self.train, self.holdout = series[:28], series[28:]
        rng = np.random.default_rng(1)
        months = np.arange(len(series))
        self.exog = np.column_stack([np.sin(2 * np.pi * months / 12), rng.normal(0, 1, size=len(series))])
        self.train_exog, self.holdout_exog = self.exog[:28], self.exog[28:]

    def test_linear_exog_trainer_with_features(self):
        preds = eval_models._linear_exog_trainer(self.train, self.holdout, self.train_exog, self.holdout_exog)
        self.assertEqual(preds.shape, self.holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))

    def test_linear_exog_trainer_falls_back_without_exog(self):
        preds = eval_models._linear_exog_trainer(self.train, self.holdout, None, None)
        self.assertEqual(preds.shape, self.holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))

    def test_sarimax_exog_trainer_with_features(self):
        preds = eval_models._sarimax_exog_trainer(self.train, self.holdout, self.train_exog, self.holdout_exog)
        self.assertEqual(preds.shape, self.holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))

    def test_xgboost_exog_trainer_with_features(self):
        preds = eval_models._xgboost_exog_trainer(self.train, self.holdout, self.train_exog, self.holdout_exog)
        self.assertEqual(preds.shape, self.holdout.shape)
        self.assertTrue(np.all(np.isfinite(preds)))


if __name__ == "__main__":
    unittest.main()
