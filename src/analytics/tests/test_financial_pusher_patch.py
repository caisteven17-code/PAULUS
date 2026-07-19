from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from app.services import financial_pusher


class FakeQuery:
    def __init__(self, table: str, calls: list[dict]):
        self.table = table
        self.calls = calls
        self.operation = ""
        self.payload = None
        self.filters = []

    def select(self, columns):
        self.operation = "select"
        self.payload = columns
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def is_(self, column, value):
        self.filters.append(("is", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, values))
        return self

    def execute(self):
        call = {
            "table": self.table,
            "operation": self.operation,
            "payload": self.payload,
            "filters": self.filters,
        }
        self.calls.append(call)
        data = [{"id": "existing-b306-line"}] if self.table == "iafr_line_items" and self.operation == "select" else [{}]
        return SimpleNamespace(data=data)


class FinancialPusherPatchTest(TestCase):
    def test_patch_updates_only_selected_account(self):
        calls = []
        accounts = [
            {
                "id": "b306-account",
                "account_code": "B.3.06",
                "account_name": "Charge Over / Above",
                "section_code": "B",
                "subsection_code": "other_receipts",
                "account_type": "receipt",
            }
        ]
        rows = [
            {
                "id": "push-row",
                "institution_id": "parish-id",
                "parish_code": "P-1",
                "parish_name": "Test Parish",
                "reporting_year": 2025,
                "reporting_month": 1,
                "validation_status": "ready",
                "source_row_number": 7,
                "raw_values": {"charge-key": 123.45},
                "cleaned_values": {"charge-key": 123.45},
                "issues": [],
            }
        ]
        mappings = [
            {
                "key": "charge-key",
                "action": "map",
                "canonicalAccountCode": "B.3.06",
                "sourceHeader": "Charge Over/Above",
            }
        ]

        def fake_table(_schema, table):
            return FakeQuery(table, calls)

        with (
            patch.object(financial_pusher, "list_accounts", return_value=accounts),
            patch.object(financial_pusher, "_load_push_rows_for_commit", return_value=rows),
            patch.object(financial_pusher, "_get_existing_record", return_value="financial-record"),
            patch.object(financial_pusher, "get_table", side_effect=fake_table),
        ):
            result = financial_pusher.commit_batch("batch", mappings, import_mode="patch_selected")

        line_calls = [call for call in calls if call["table"] == "iafr_line_items"]
        self.assertFalse(any(call["operation"] == "delete" for call in line_calls))
        updates = [call for call in line_calls if call["operation"] == "update"]
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["payload"]["amount"], 123.45)
        self.assertIn(("eq", "id", "existing-b306-line"), updates[0]["filters"])
        self.assertEqual(result["committedRows"], 1)
        self.assertEqual(result["lineItemsCreated"], 1)
