import unittest
from unittest.mock import patch

from app.services import education_financial_sync as sync


class EducationFinancialSyncTests(unittest.TestCase):
    @patch.object(sync, "_submission_key", return_value=7)
    def test_school_gold_totals_are_derived_from_source_fields(self, _submission_key):
        source = {
            "submission_batch_id": "batch",
            "tuition_revenues": 100,
            "miscellaneous_fees": 20,
            "other_income": 5,
            "subsidy_inflow": 10,
            "faculty_payroll": 50,
            "admin_staff_payroll": 15,
            "utilities": 5,
            "facilities_maintenance": 4,
            "supplies": 3,
            "other_expenses": 2,
            "net_receipts": 56,
        }

        payload = sync._gold_payload(sync.CONFIGS["school"], source, 11, 202601)

        self.assertEqual(payload["school_key"], 11)
        self.assertEqual(payload["submission_key"], 7)
        self.assertEqual(payload["total_inflow"], 135)
        self.assertEqual(payload["total_outflow"], 79)

    def test_month_mapping_is_stable(self):
        self.assertEqual(sync.MONTHS["Jan"], 1)
        self.assertEqual(sync.MONTHS["Dec"], 12)

    @patch.object(sync.analytics_db, "upsert_rows")
    @patch.object(sync, "_fetch_all")
    @patch.object(sync.analytics_db, "fetch_query")
    def test_dimension_sync_copies_institution_address(self, fetch_query, fetch_all, upsert_rows):
        fetch_query.return_value = [
            {
                "institution_key": 11,
                "institution_id": "00000000-0000-0000-0000-000000000011",
                "address": "Example School Address",
                "municipality": "Example Municipality",
            }
        ]
        fetch_all.side_effect = [
            [
                {
                    "institution_id": "00000000-0000-0000-0000-000000000011",
                    "principal_id": None,
                    "deleted_at": None,
                }
            ],
            [],
        ]

        result = sync.sync_dimensions(sync.CONFIGS["school"])

        self.assertEqual(result, {"dimensions": 1, "accounts": 0})
        dimension_rows = upsert_rows.call_args.args[2]
        self.assertEqual(dimension_rows[0]["address"], "Example School Address")
        self.assertEqual(dimension_rows[0]["municipality"], "Example Municipality")


if __name__ == "__main__":
    unittest.main()

