import unittest
from unittest.mock import call, patch

from app.services import institution_dimension_sync as sync
from app.services.institution_dimension_sync import _dimension_row, _municipality


class InstitutionDimensionProjectionTests(unittest.TestCase):
    def test_location_fields_are_requested_from_the_authoritative_source(self):
        self.assertIn("address", sync.SOURCE_COLUMNS.split(","))
        self.assertIn("municipality", sync.SOURCE_COLUMNS.split(","))
        self.assertEqual(sync.PIPELINE_NAME, "institution_dimension_incremental_v3")

    def test_projection_allows_only_analytics_fields(self):
        source = {
            "id": "00000000-0000-0000-0000-000000000001",
            "name": "Example Parish",
            "institution_code": "P-0001",
            "institution_type": "parish",
            "vicariate": "Example Vicariate",
            "district": "District I",
            "cluster": "1",
            "class": "A",
            "subsidy_type": "independent",
            "latitude": 14.0,
            "longitude": 121.0,
            "address": "Example Street, Example City",
            "municipality": "Example City",
            "is_active": True,
            "updated_at": "2026-07-21T00:00:00+00:00",
            "deleted_at": None,
            "email": "must-not-be-copied@example.test",
            "contact_number": "must-not-be-copied",
        }

        with patch("app.services.institution_dimension_sync.datetime") as clock:
            clock.now.return_value = "warehouse-time"
            result = _dimension_row(source)

        self.assertEqual(result["institution_id"], source["id"])
        self.assertEqual(result["district"], "District I")
        self.assertEqual(result["address"], source["address"])
        self.assertEqual(result["municipality"], source["municipality"])
        self.assertEqual(result["warehouse_updated_at"], "warehouse-time")
        self.assertNotIn("email", result)
        self.assertNotIn("contact_number", result)

    def test_soft_deleted_source_is_inactive(self):
        source = {
            "id": "00000000-0000-0000-0000-000000000002",
            "name": "Archived Parish",
            "institution_type": "parish",
            "is_active": True,
            "updated_at": "2026-07-21T00:00:00+00:00",
            "deleted_at": "2026-07-21T01:00:00+00:00",
        }

        result = _dimension_row(source)

        self.assertFalse(result["is_active"])
        self.assertEqual(result["source_deleted_at"], source["deleted_at"])

    def test_legacy_address_derives_canonical_municipality(self):
        self.assertEqual(
            _municipality({"address": "Gulod, Cabuyao, Laguna"}),
            "Cabuyao City",
        )

    def test_explicit_municipality_wins_over_address(self):
        self.assertEqual(
            _municipality({"municipality": "Calamba", "address": "Other Place, Laguna"}),
            "Calamba City",
        )


class InstitutionDimensionRunTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "name": "First Parish",
                "institution_type": "parish",
                "updated_at": "2026-07-21T00:00:00+00:00",
                "deleted_at": None,
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "name": "Second Parish",
                "institution_type": "parish",
                "updated_at": "2026-07-21T00:01:00+00:00",
                "deleted_at": None,
            },
        ]

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_success_advances_watermark_in_source_order(
        self, start_run, watermark, fetch_changes, upsert, set_watermark, reconcile, finish
    ):
        start_run.return_value = "run-1"
        watermark.return_value = {}
        fetch_changes.return_value = self.rows

        result = sync.run_once()

        self.assertEqual(result, {"run_id": "run-1", "extracted": 2, "loaded": 2})
        self.assertEqual(upsert.call_count, 2)
        set_watermark.assert_has_calls([
            call(self.rows[0]["updated_at"], self.rows[0]["id"]),
            call(self.rows[1]["updated_at"], self.rows[1]["id"]),
        ])
        reconcile.assert_called_once_with("run-1", passed=True)
        finish.assert_called_once_with("run-1", "succeeded", 2, 2)

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_record_failure")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_failure_does_not_advance_watermark_past_failed_row(
        self, start_run, watermark, fetch_changes, upsert, set_watermark,
        record_failure, reconcile, finish
    ):
        start_run.return_value = "run-2"
        watermark.return_value = {}
        fetch_changes.return_value = self.rows
        upsert.side_effect = [None, RuntimeError("target unavailable")]

        with self.assertRaisesRegex(RuntimeError, "target unavailable"):
            sync.run_once()

        set_watermark.assert_called_once_with(self.rows[0]["updated_at"], self.rows[0]["id"])
        record_failure.assert_called_once()
        self.assertEqual(record_failure.call_args.args[:2], ("run-2", self.rows[1]["id"]))
        reconcile.assert_called_once_with("run-2", passed=False)
        finish.assert_called_once_with("run-2", "failed", 2, 1, "target unavailable")


if __name__ == "__main__":
    unittest.main()
