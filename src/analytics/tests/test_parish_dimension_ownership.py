import unittest
from unittest.mock import patch

from app.services import parish_gold_candidates as candidates


class ParishDimensionOwnershipTests(unittest.TestCase):
    @patch.object(candidates, "_upsert_in_chunks")
    @patch.object(candidates, "_fetch_all")
    @patch.object(candidates.analytics_db, "fetch_query")
    def test_refresh_uses_aws_institution_dimension_without_profiles(
        self, fetch_query, fetch_all, upsert
    ):
        fetch_query.return_value = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "institution_key": 25,
                "institution_code": "P-0001",
                "name": "Example Parish",
                "institution_type": "parish",
                "vicariate": "Example Vicariate",
                "district": "District I",
                "cluster": "1",
                "class": "A",
                "latitude": 14.0,
                "longitude": 121.0,
            }
        ]
        fetch_all.side_effect = [
            [
                {
                    "institution_id": "00000000-0000-0000-0000-000000000001",
                    "assigned_priest_id": "20000000-0000-0000-0000-000000000001",
                }
            ],
            [],
        ]

        result = candidates.sync_parish_dimensions()

        requested_schemas = [call.args[0] for call in fetch_all.call_args_list]
        self.assertEqual(requested_schemas, ["parishes", "parishes"])
        parish_rows = upsert.call_args_list[0].args[2]
        self.assertEqual(parish_rows[0]["institution_key"], 25)
        self.assertEqual(
            parish_rows[0]["assigned_priest_source_id"],
            "20000000-0000-0000-0000-000000000001",
        )
        self.assertNotIn("assigned_priest", parish_rows[0])
        self.assertNotIn("address", parish_rows[0])
        self.assertEqual(result["parish_dimensions"], 1)


if __name__ == "__main__":
    unittest.main()

