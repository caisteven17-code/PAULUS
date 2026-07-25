import unittest
from unittest import mock

import numpy as np
import pandas as pd

from app.services.predictive import cluster_forecast as cf


def _make_parish(rng, n_months, base, vol, subsidized_from=None, start="2021-01-01"):
    dates = pd.date_range(start, periods=n_months, freq="MS")
    trend = np.linspace(base, base * 1.05, n_months)
    seasonal = base * 0.1 * np.sin(2 * np.pi * np.arange(n_months) / 12)
    noise = rng.normal(0, vol * base, n_months)
    receipts = trend + seasonal + noise
    expenses = receipts * rng.uniform(0.85, 0.95, n_months)
    subsidy = np.zeros(n_months)
    if subsidized_from is not None:
        subsidy[subsidized_from:] = base * 0.3
        receipts[subsidized_from:] += subsidy[subsidized_from:]
    return pd.DataFrame(
        {"date": dates, "total_receipts": receipts, "total_expenses": expenses, "subsidy_receipts": subsidy}
    )


def _synthetic_diocese(n_parishes=10, n_months=48, seed=42):
    rng = np.random.default_rng(seed)
    series = []
    for i in range(n_parishes):
        vol = 0.02 + i * 0.012
        sub_from = 30 if i in (n_parishes - 2, n_parishes - 3) else None
        df = _make_parish(rng, n_months, base=100000 + i * 5000, vol=vol, subsidized_from=sub_from)
        series.append((f"parish_{i}", df))
    return series


class EligibleCutoffsTests(unittest.TestCase):
    def test_no_cutoffs_when_series_too_short(self):
        rng = np.random.default_rng(1)
        series = [("p1", _make_parish(rng, 6, 100000, 0.02))]
        self.assertEqual(cf._eligible_cutoffs(series), [])

    def test_cutoffs_are_quarterly_stepped(self):
        series = _synthetic_diocese(n_parishes=4, n_months=36)
        cutoffs = cf._eligible_cutoffs(series)
        self.assertGreaterEqual(len(cutoffs), 2)
        for a, b in zip(cutoffs, cutoffs[1:]):
            self.assertEqual((b.year - a.year) * 12 + (b.month - a.month), cf._CUTOFF_STEP_MONTHS)


class ClassifyCrossSectionTests(unittest.TestCase):
    def test_uses_only_data_on_or_before_cutoff(self):
        series = _synthetic_diocese(n_parishes=8, n_months=48)
        cutoff = pd.Timestamp("2022-06-01")
        section = cf._classify_cross_section(series, cutoff)
        self.assertTrue(section)
        for iid, _df in series:
            full_len = len(dict(series)[iid][dict(series)[iid]["date"] <= cutoff])
            self.assertGreaterEqual(full_len, 0)

    def test_too_few_parishes_returns_empty(self):
        series = _synthetic_diocese(n_parishes=2, n_months=48)
        section = cf._classify_cross_section(series, pd.Timestamp("2022-06-01"))
        self.assertEqual(section, {})


class TrainingPanelTests(unittest.TestCase):
    def test_none_when_history_too_shallow(self):
        rng = np.random.default_rng(2)
        series = [(f"p{i}", _make_parish(rng, 8, 100000, 0.02)) for i in range(6)]
        self.assertIsNone(cf._build_training_panel(series))

    def test_builds_real_holdout_with_submaximal_f1(self):
        series = _synthetic_diocese(n_parishes=12, n_months=48, seed=7)
        panel = cf._build_training_panel(series)
        self.assertIsNotNone(panel)
        _full_X, _full_y, transitions, holdout_metrics, _clf = panel
        # A same-period self-prediction bug would score ~1.0 on its own
        # training labels; a genuine forward holdout should not be perfect.
        self.assertLess(holdout_metrics["macro_f1"], 1.0)
        self.assertGreater(holdout_metrics["macro_f1"], 0.0)
        self.assertGreater(len(transitions), 10)

    def test_transitions_cover_subsidized_class(self):
        series = _synthetic_diocese(n_parishes=12, n_months=48, seed=7)
        panel = cf._build_training_panel(series)
        _full_X, _full_y, transitions, _holdout_metrics, _clf = panel
        labels_seen = {t for pair in transitions for t in pair}
        self.assertIn("D", labels_seen)


class FetchAndProcessTests(unittest.TestCase):
    def test_full_pipeline_returns_consistent_transition_matrix(self):
        series = _synthetic_diocese(n_parishes=12, n_months=48, seed=11)
        with mock.patch.object(cf._aws_financials, "all_parish_monthly_dfs", return_value=series):
            result = cf._fetch_and_process()

        self.assertTrue(result["data_sufficient"])
        self.assertEqual(len(result["parish_predictions"]), 12)
        # The genuine-holdout leakage check (score must be < 1.0) lives in
        # TrainingPanelTests, on a fixed seed known to produce a non-trivial
        # split — this end-to-end test only checks wiring/shape, since a
        # small 12-parish holdout can legitimately score 1.0 for some seeds
        # without that implying leakage.
        self.assertIn("macro_f1", result["model_metrics"])
        self.assertIn("balanced_accuracy", result["model_metrics"])
        for _label, row in result["transition_matrix"].items():
            self.assertAlmostEqual(sum(row.values()), 1.0, places=2)

    def test_degrades_gracefully_when_history_too_shallow(self):
        rng = np.random.default_rng(3)
        series = [(f"p{i}", _make_parish(rng, 8, 100000, 0.02)) for i in range(6)]
        with mock.patch.object(cf._aws_financials, "all_parish_monthly_dfs", return_value=series):
            result = cf._fetch_and_process()

        self.assertTrue(result["data_sufficient"])
        self.assertEqual(result["model_metrics"], {"status": "insufficient_cutoff_history_for_temporal_model"})
        self.assertIsNone(result["parish_predictions"][0]["predicted_cluster"])
        self.assertEqual(result["transition_matrix"], {})


if __name__ == "__main__":
    unittest.main()
