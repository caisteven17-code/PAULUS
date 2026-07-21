import unittest

from app.services.liturgical_calendar_loader import _db_payload


class LiturgicalCalendarOwnershipTests(unittest.TestCase):
    def test_canonical_source_timestamp_is_preserved(self):
        row = {
            "date": "2026-12-25",
            "year": 2026,
            "month": 12,
            "day": 25,
            "weekday": "Friday",
            "celebration_name": "Christmas",
            "source_name": "canonical",
            "source_url": "https://example.test",
            "raw_payload": {},
            "review_status": "approved_with_revisions",
            "updated_at": "2026-07-21T00:00:00+00:00",
        }

        payload = _db_payload(row)

        self.assertEqual(payload["celebration_name"], "Christmas")
        self.assertEqual(payload["review_status"], "approved_with_revisions")
        self.assertEqual(payload["updated_at"], row["updated_at"])
        self.assertNotIn("reviewer_email", payload)


if __name__ == "__main__":
    unittest.main()

