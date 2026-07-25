import unittest
from unittest import mock

import numpy as np
import pandas as pd

from app.services.descriptive import financial_trend as ft
from app.services.descriptive import parish_cluster as pc
from app.services.diagnostic import project_risk as pr
from app.services.prescriptive import project_portfolio as pp


class FinancialTrendKpiThresholdTests(unittest.TestCase):
    def test_pass_flags_are_native_bool_for_jsonable_encoder(self):
        df = pd.DataFrame({"total_receipts": [100000.0] * 30, "total_expenses": [80000.0] * 30})
        kpis = ft._compute_kpis(df)
        for key in (
            "annual_collection_growth_rate_pass",
            "disbursement_to_collection_ratio_pass",
            "mom_collection_change_pass",
            "net_receipt_deficit_rate_pass",
        ):
            self.assertIs(type(kpis[key]), bool)

    def test_disbursement_ratio_fails_when_over_threshold(self):
        # expenses == receipts -> ratio 1.0, well above the 93.47% cap
        df = pd.DataFrame({"total_receipts": [100000.0] * 6, "total_expenses": [100000.0] * 6})
        kpis = ft._compute_kpis(df)
        self.assertFalse(kpis["disbursement_to_collection_ratio_pass"])

    def test_disbursement_ratio_passes_when_under_threshold(self):
        df = pd.DataFrame({"total_receipts": [100000.0] * 6, "total_expenses": [50000.0] * 6})
        kpis = ft._compute_kpis(df)
        self.assertTrue(kpis["disbursement_to_collection_ratio_pass"])


class ClusterPurityTests(unittest.TestCase):
    def test_perfectly_separated_terciles_score_near_one(self):
        parishes = (
            [{"cluster_label": "A", "volatility_index": 0.01} for _ in range(5)]
            + [{"cluster_label": "B", "volatility_index": 0.05} for _ in range(5)]
            + [{"cluster_label": "C", "volatility_index": 0.09} for _ in range(5)]
        )
        self.assertAlmostEqual(pc._cluster_purity(parishes), 1.0, places=2)

    def test_identical_volatility_does_not_crash_on_float_noise(self):
        parishes = [{"cluster_label": "A", "volatility_index": 0.05} for _ in range(15)]
        self.assertAlmostEqual(pc._cluster_purity(parishes), 1.0, places=6)

    def test_all_subsidized_is_perfectly_pure(self):
        parishes = [{"cluster_label": "D", "volatility_index": 0.0} for _ in range(10)]
        self.assertEqual(pc._cluster_purity(parishes), 1.0)

    def test_overlapping_clusters_score_low(self):
        rng = np.random.default_rng(1)
        noisy = [{"cluster_label": lbl, "volatility_index": float(rng.uniform(0, 1))} for lbl in ["A", "B", "C"] * 10]
        self.assertLess(pc._cluster_purity(noisy), 0.3)

    def test_empty_returns_zero(self):
        self.assertEqual(pc._cluster_purity([]), 0.0)


def _fake_project_query(rows):
    class FakeQuery:
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
            r.data = rows
            return r

    return FakeQuery()


class ProjectRiskKpiTests(unittest.TestCase):
    def _run(self, projects, donations=None):
        donations = donations or []

        def fake_get_table(_schema, table):
            if table == "projects":
                return _fake_project_query(projects)
            if table == "donations":
                return _fake_project_query(donations)
            return _fake_project_query([])

        with mock.patch.object(pr, "get_table", side_effect=fake_get_table):
            return pr._fetch_and_process("inst1")

    def test_project_with_no_target_or_dates_excluded_from_diagnostic_coverage(self):
        projects = [
            {
                "id": "p1",
                "name": "A",
                "target_amount": 0,
                "current_amount": 0,
                "status": "active",
                "start_date": None,
                "end_date": None,
                "institution_id": "inst1",
            },
            {
                "id": "p2",
                "name": "B",
                "target_amount": 50000,
                "current_amount": 20000,
                "status": "active",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "institution_id": "inst1",
            },
        ]
        result = self._run(projects)
        self.assertEqual(result["kpis"]["diagnostic_coverage_rate"], 0.5)

    def test_long_finished_underfunded_project_is_flagged_delayed(self):
        # Started and ended well in the past with little progress made --
        # a real elapsed-time-vs-progress gap, which requires the
        # today/start tz-naive comparison to actually work (previously
        # silently raised and defaulted elapsed_days to 0, masking this).
        projects = [
            {
                "id": "p1",
                "name": "Stalled",
                "target_amount": 80000,
                "current_amount": 10000,
                "status": "active",
                "start_date": "2023-01-01",
                "end_date": "2023-06-01",
                "institution_id": "inst1",
            },
            {
                "id": "p2",
                "name": "OnTrack",
                "target_amount": 50000,
                "current_amount": 45000,
                "status": "active",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "institution_id": "inst1",
            },
            {
                "id": "p3",
                "name": "AlsoOnTrack",
                "target_amount": 40000,
                "current_amount": 35000,
                "status": "active",
                "start_date": "2025-02-01",
                "end_date": "2025-11-30",
                "institution_id": "inst1",
            },
            {
                "id": "p4",
                "name": "AlsoOnTrack2",
                "target_amount": 30000,
                "current_amount": 25000,
                "status": "active",
                "start_date": "2025-03-01",
                "end_date": "2025-10-31",
                "institution_id": "inst1",
            },
        ]
        result = self._run(projects)
        stalled = next(p for p in result["at_risk_projects"] if p["project_id"] == "p1")
        self.assertTrue(stalled["is_delayed"])
        self.assertLess(stalled["schedule_variance_days"], 0)
        self.assertGreater(result["kpis"]["delayed_count"], 0)
        self.assertGreater(result["kpis"]["delayed_rate"], 0)

    def test_rate_kpis_are_fractions_not_raw_counts(self):
        projects = [
            {
                "id": f"p{i}",
                "name": f"proj{i}",
                "target_amount": 50000,
                "current_amount": 45000,
                "status": "active",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "institution_id": "inst1",
            }
            for i in range(4)
        ]
        result = self._run(projects)
        self.assertLessEqual(result["kpis"]["at_risk_rate"], 1.0)
        self.assertLessEqual(result["kpis"]["delayed_rate"], 1.0)
        self.assertLessEqual(result["kpis"]["diagnostic_coverage_rate"], 1.0)


def _fake_portfolio_query(rows):
    class FakeQuery:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            class R:
                pass

            r = R()
            r.data = rows
            return r

    return FakeQuery()


class ProjectPortfolioKpiTests(unittest.TestCase):
    def _run(self, projects, donations=None):
        donations = donations or []

        def fake_get_table(_schema, table):
            if table == "projects":
                return _fake_portfolio_query(projects)
            if table == "donations":
                return _fake_portfolio_query(donations)
            return _fake_portfolio_query([])

        with mock.patch.object(pp, "get_table", side_effect=fake_get_table):
            return pp._fetch_and_process("inst1", 500000.0)

    def test_completed_project_counts_toward_success_not_delay(self):
        today = pd.Timestamp.now()
        completed = {
            "id": "p1",
            "name": "Done",
            "target_amount": 100000,
            "current_amount": 100000,
            "status": "completed",
            "start_date": (today - pd.DateOffset(years=3)).strftime("%Y-%m-%d"),
            "end_date": (today - pd.DateOffset(years=2)).strftime("%Y-%m-%d"),
            "institution_id": "inst1",
        }
        on_track = {
            "id": "p2",
            "name": "OnTrack",
            "target_amount": 100000,
            "current_amount": 40000,
            "status": "active",
            "start_date": (today - pd.DateOffset(months=3)).strftime("%Y-%m-%d"),
            "end_date": (today + pd.DateOffset(months=9)).strftime("%Y-%m-%d"),
            "institution_id": "inst1",
        }
        result = self._run([completed, on_track])
        kpis = result["kpis"]
        self.assertEqual(kpis["project_success_rate"], 0.5)
        # Only "on_track" is in-progress; it was just started with target
        # far ahead of the small elapsed fraction, so shouldn't be delayed --
        # and the completed project's long-past end date must not corrupt
        # this rate despite it having no bearing on "in progress" status.
        self.assertEqual(kpis["delayed_project_rate"], 0.0)

    def test_resource_utilization_rate_reflects_real_totals(self):
        projects = [
            {
                "id": "p1",
                "name": "A",
                "target_amount": 100000,
                "current_amount": 50000,
                "status": "active",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "institution_id": "inst1",
            },
            {
                "id": "p2",
                "name": "B",
                "target_amount": 100000,
                "current_amount": 100000,
                "status": "completed",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "institution_id": "inst1",
            },
        ]
        result = self._run(projects)
        self.assertAlmostEqual(result["kpis"]["resource_utilization_rate"], 0.75, places=4)

    def test_all_kpis_present_and_bounded(self):
        projects = [
            {
                "id": f"p{i}",
                "name": f"proj{i}",
                "target_amount": 50000,
                "current_amount": 25000,
                "status": "active",
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "institution_id": "inst1",
            }
            for i in range(4)
        ]
        result = self._run(projects)
        for key in ("completion_rate", "delayed_project_rate", "resource_utilization_rate", "project_success_rate"):
            self.assertIn(key, result["kpis"])
            self.assertGreaterEqual(result["kpis"][key], 0.0)
            self.assertLessEqual(result["kpis"][key], 1.0)


if __name__ == "__main__":
    unittest.main()
