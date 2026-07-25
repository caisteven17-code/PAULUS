import unittest
from unittest.mock import patch

from app.services import submission_dimension_sync as sync
from app.services.submission_dimension_sync import _dimension_row


class SubmissionDimensionProjectionTests(unittest.TestCase):
    def test_status_comes_from_batch_not_record(self):
        batch = {
            "id": "batch-1",
            "institution_type": "parish",
            "source_file_name": "iafr.xlsx",
            "submitted_by": "user-1",
            "submitted_at": "2026-01-01T00:00:00+00:00",
            "verified_by": "user-2",
            "verified_at": "2026-01-02T00:00:00+00:00",
            "validation_status": "passed",
            "updated_at": "2026-01-02T00:00:00+00:00",
        }
        record = {
            "id": "record-1",
            "version_no": 3,
            "is_current_version": True,
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        result = _dimension_row(batch, record)

        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["submission_batch_id"], "batch-1")
        self.assertEqual(result["financial_record_id"], "record-1")

    def test_version_and_current_flag_come_from_record_not_batch(self):
        batch = {"id": "batch-2", "validation_status": "pending"}
        record = {"id": "record-2", "version_no": 5, "is_current_version": False}

        result = _dimension_row(batch, record)

        self.assertEqual(result["version_no"], 5)
        self.assertFalse(result["is_current_version"])


class SubmissionDimensionRunTests(unittest.TestCase):
    def setUp(self):
        self.batch = {
            "id": "batch-1",
            "institution_type": "parish",
            "validation_status": "passed",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        self.record = {
            "id": "record-1",
            "version_no": 1,
            "is_current_version": True,
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        self.empty_skipped = {"no_linked_record": 0, "unlinked_draft_record": 0, "soft_deleted_record": 0}

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_current_record_for_batch")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_success_upserts_batch_with_linked_record(
        self, start_run, watermark, fetch_changes, current_record, upsert, set_watermark, reconcile, finish
    ):
        start_run.return_value = "run-1"
        watermark.return_value = {}
        # Call order in run_once(): batch table, then parish/school/seminary entity tables.
        fetch_changes.side_effect = [[self.batch], [], [], []]
        current_record.return_value = self.record

        result = sync.run_once()

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["extracted"], 1)
        self.assertEqual(result["loaded"], 1)
        upsert.assert_called_once()
        set_watermark.assert_called_once_with(
            sync.BATCH_SCHEMA, sync.BATCH_TABLE, self.batch["updated_at"], self.batch["id"]
        )
        reconcile.assert_called_once_with("run-1", passed=True, details=self.empty_skipped)
        finish.assert_called_once_with("run-1", "succeeded", 1, 1)

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_current_record_for_batch")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_batch_with_no_linked_record_is_skipped_not_failed(
        self, start_run, watermark, fetch_changes, current_record, upsert, set_watermark, reconcile, finish
    ):
        start_run.return_value = "run-2"
        watermark.return_value = {}
        fetch_changes.side_effect = [[self.batch], [], [], []]
        current_record.return_value = None  # no linked, non-deleted financial record

        result = sync.run_once()

        self.assertEqual(result["loaded"], 0)
        self.assertEqual(result["skipped"]["no_linked_record"], 1)
        upsert.assert_not_called()
        # Watermark still advances even though nothing was upserted for this batch.
        set_watermark.assert_called_once_with(
            sync.BATCH_SCHEMA, sync.BATCH_TABLE, self.batch["updated_at"], self.batch["id"]
        )
        finish.assert_called_once_with("run-2", "succeeded", 1, 0)

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_fetch_batch")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_draft_record_with_no_batch_link_is_skipped(
        self, start_run, watermark, fetch_changes, fetch_batch, upsert, set_watermark, reconcile, finish
    ):
        start_run.return_value = "run-3"
        watermark.return_value = {}
        draft_record = {
            "id": "record-draft",
            "submission_batch_id": None,
            "version_no": 1,
            "is_current_version": True,
            "updated_at": "2026-01-01T00:00:00+00:00",
            "deleted_at": None,
        }
        # batch table: no changes; parish entity: one draft record; school/seminary: none.
        fetch_changes.side_effect = [[], [draft_record], [], []]

        result = sync.run_once()

        self.assertEqual(result["loaded"], 0)
        self.assertEqual(result["skipped"]["unlinked_draft_record"], 1)
        upsert.assert_not_called()
        fetch_batch.assert_not_called()
        finish.assert_called_once_with("run-3", "succeeded", 1, 0)

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_fetch_batch")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_soft_deleted_record_is_skipped(
        self, start_run, watermark, fetch_changes, fetch_batch, upsert, set_watermark, reconcile, finish
    ):
        start_run.return_value = "run-4"
        watermark.return_value = {}
        deleted_record = {
            "id": "record-deleted",
            "submission_batch_id": "batch-1",
            "version_no": 1,
            "is_current_version": True,
            "updated_at": "2026-01-01T00:00:00+00:00",
            "deleted_at": "2026-01-02T00:00:00+00:00",
        }
        fetch_changes.side_effect = [[], [deleted_record], [], []]

        result = sync.run_once()

        self.assertEqual(result["loaded"], 0)
        self.assertEqual(result["skipped"]["soft_deleted_record"], 1)
        upsert.assert_not_called()
        fetch_batch.assert_not_called()

    @patch.object(sync, "_finish_run")
    @patch.object(sync, "_record_reconciliation")
    @patch.object(sync, "_record_failure")
    @patch.object(sync, "_set_watermark")
    @patch.object(sync.analytics_db, "upsert_row")
    @patch.object(sync, "_current_record_for_batch")
    @patch.object(sync, "_fetch_changes")
    @patch.object(sync, "_watermark")
    @patch.object(sync, "_start_run")
    def test_failure_does_not_advance_watermark_past_failed_row(
        self, start_run, watermark, fetch_changes, current_record, upsert, set_watermark,
        record_failure, reconcile, finish
    ):
        start_run.return_value = "run-5"
        watermark.return_value = {}
        fetch_changes.side_effect = [[self.batch], [], [], []]
        current_record.return_value = self.record
        upsert.side_effect = RuntimeError("target unavailable")

        with self.assertRaisesRegex(RuntimeError, "target unavailable"):
            sync.run_once()

        set_watermark.assert_not_called()
        record_failure.assert_called_once()
        self.assertEqual(
            record_failure.call_args.args,
            ("run-5", sync.BATCH_SCHEMA, sync.BATCH_TABLE, self.batch["id"], upsert.side_effect),
        )
        reconcile.assert_called_once_with("run-5", passed=False, details=self.empty_skipped)
        finish.assert_called_once_with("run-5", "failed", 1, 0, "target unavailable")


if __name__ == "__main__":
    unittest.main()
