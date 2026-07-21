import unittest
from unittest.mock import patch

from app.services import silver_etl


class InstitutionKeyResolutionTests(unittest.TestCase):
    @patch.object(silver_etl.analytics_db, "fetch_query")
    def test_resolves_supabase_uuid_to_local_aws_key(self, fetch_query):
        fetch_query.return_value = [
            {
                "institution_id": "00000000-0000-0000-0000-000000000001",
                "institution_key": 25,
            }
        ]

        result = silver_etl._resolve_institution_keys(
            ["00000000-0000-0000-0000-000000000001"]
        )

        self.assertEqual(result, {"00000000-0000-0000-0000-000000000001": 25})

    @patch.object(silver_etl.analytics_db, "fetch_query")
    def test_missing_dimension_mapping_fails_before_silver_write(self, fetch_query):
        fetch_query.return_value = []

        with self.assertRaisesRegex(
            silver_etl.InstitutionDimensionMissingError,
            "run the institution synchronizer and retry",
        ):
            silver_etl._resolve_institution_keys(
                ["00000000-0000-0000-0000-000000000002"]
            )

    @patch.object(silver_etl.analytics_db, "fetch_query")
    def test_duplicate_source_ids_are_resolved_once(self, fetch_query):
        source_id = "00000000-0000-0000-0000-000000000003"
        fetch_query.return_value = [{"institution_id": source_id, "institution_key": 9}]

        result = silver_etl._resolve_institution_keys([source_id, source_id])

        self.assertEqual(result, {source_id: 9})
        sent_ids = fetch_query.call_args.args[1][0]
        self.assertEqual(sent_ids, [source_id])


class SilverProjectionTests(unittest.TestCase):
    def test_record_projection_keeps_source_uuid_and_aws_key(self):
        record = {
            "id": "10000000-0000-0000-0000-000000000001",
            "institution_id": "00000000-0000-0000-0000-000000000001",
            "month": "Jul",
            "year": 2026,
            "status": "approved",
            "version_no": 1,
            "created_at": "2026-07-01T00:00:00+00:00",
            "updated_at": "2026-07-21T00:00:00+00:00",
        }

        result = silver_etl._build_record_row(record, [], "run-id", 25)

        self.assertEqual(result["institution_id"], record["institution_id"])
        self.assertEqual(result["institution_key"], 25)


if __name__ == "__main__":
    unittest.main()

