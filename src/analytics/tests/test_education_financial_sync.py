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


if __name__ == "__main__":
    unittest.main()

