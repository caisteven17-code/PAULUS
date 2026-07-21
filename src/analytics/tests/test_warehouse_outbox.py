import unittest
from unittest.mock import call, patch

from app.services import warehouse_worker


class WarehouseOutboxTests(unittest.TestCase):
    def setUp(self):
        self.events = [
            {
                "event_id": "00000000-0000-0000-0000-000000000001",
                "source_record_id": "10000000-0000-0000-0000-000000000001",
                "source_updated_at": "2026-07-22T00:00:00+00:00",
                "attempt_count": 0,
            },
            {
                "event_id": "00000000-0000-0000-0000-000000000002",
                "source_record_id": "10000000-0000-0000-0000-000000000002",
                "source_updated_at": "2026-07-22T00:00:01+00:00",
                "attempt_count": 1,
            },
        ]

    @patch.object(warehouse_worker, "_complete_outbox_event", return_value=True)
    @patch.object(warehouse_worker, "_sync_change")
    @patch.object(warehouse_worker, "_claim_outbox_events")
    def test_successful_events_are_completed(self, claim, sync, complete):
        claim.return_value = self.events

        result = warehouse_worker._run_outbox_once()

        self.assertEqual(result, {"claimed": 2, "succeeded": 2, "rescheduled": 0, "superseded": 0})
        self.assertEqual(
            sync.call_args_list,
            [
                call({"id": self.events[0]["source_record_id"]}),
                call({"id": self.events[1]["source_record_id"]}),
            ],
        )
        self.assertEqual(complete.call_count, 2)

    @patch.object(warehouse_worker.analytics_db, "discard_pool")
    @patch.object(warehouse_worker, "_fail_outbox_event", return_value=True)
    @patch.object(warehouse_worker, "_sync_change", side_effect=ConnectionError("AWS unavailable"))
    @patch.object(warehouse_worker, "_claim_outbox_events")
    def test_aws_failure_releases_entire_claimed_batch(self, claim, sync, fail, discard):
        claim.return_value = self.events

        result = warehouse_worker._run_outbox_once()

        self.assertEqual(result, {"claimed": 2, "succeeded": 0, "rescheduled": 2, "superseded": 0})
        sync.assert_called_once()
        self.assertEqual(fail.call_count, 2)
        discard.assert_called_once()

    def test_retry_delay_is_exponential_and_capped(self):
        with patch.object(warehouse_worker, "WAREHOUSE_OUTBOX_RETRY_MAX_SECONDS", 900):
            self.assertEqual(warehouse_worker._retry_delay(0), 30)
            self.assertEqual(warehouse_worker._retry_delay(3), 240)
            self.assertEqual(warehouse_worker._retry_delay(20), 900)


if __name__ == "__main__":
    unittest.main()
