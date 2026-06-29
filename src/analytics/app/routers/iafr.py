"""IAFR parish submission cleaning endpoint.

Mounted at the app root (not under /analytics) so the NestJS gateway can
proxy it 1:1 — see analytics-gateway.controller.ts's `cleanIafrSubmission`.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import iafr_cleaner
from app.services.supabase_client import get_table, get_supabase

router = APIRouter(tags=["iafr"])

STORAGE_BUCKET = "financial-submissions"


class CleanSubmissionRequest(BaseModel):
    submissionBatchId: str
    storagePath: str


@router.post("/iafr/clean-submission")
async def clean_submission(body: CleanSubmissionRequest):
    batch = (
        get_table("operations", "submission_batches")
        .select("id, institution_id, institution_type, reporting_month, reporting_year")
        .eq("id", body.submissionBatchId)
        .single()
        .execute()
    )
    if not batch.data:
        raise HTTPException(status_code=404, detail=f"Submission batch {body.submissionBatchId} not found.")

    row = batch.data
    if row["institution_type"] != "parish":
        raise HTTPException(
            status_code=400,
            detail=f"IAFR cleaning only applies to parish submissions, got '{row['institution_type']}'.",
        )

    institution = (
        get_table("diocese", "institutions").select("id, name").eq("id", row["institution_id"]).single().execute()
    )
    institution_name = institution.data["name"] if institution.data else None

    try:
        file_bytes = get_supabase().storage.from_(STORAGE_BUCKET).download(body.storagePath)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not download '{body.storagePath}' from storage: {exc}")

    result = iafr_cleaner.clean_submission(
        file_bytes=file_bytes,
        filename=body.storagePath,
        target_month=row["reporting_month"],
        target_year=row["reporting_year"],
        expected_parish_name=institution_name,
    )

    if result["validation_status"] == "failed" and not result["line_items"]:
        _write_validation_results(body.submissionBatchId, row["institution_id"], None, result)
        return {
            "submissionBatchId": body.submissionBatchId,
            "validationStatus": result["validation_status"],
            "monthsProcessed": 0,
            "rows": [],
            "summary": {"errorCount": len(result["validation_errors"]), "lineItemCount": 0},
        }

    financial_record_id = _upsert_financial_record(
        institution_id=row["institution_id"],
        submission_batch_id=body.submissionBatchId,
        month=result["month"],
        year=result["year"],
        beginning_balance=result["beginning_balance"],
    )

    _replace_line_items(financial_record_id, result["line_items"])
    _write_validation_results(body.submissionBatchId, row["institution_id"], financial_record_id, result)

    return {
        "submissionBatchId": body.submissionBatchId,
        "validationStatus": result["validation_status"],
        "monthsProcessed": 1,
        "rows": [{"month": result["month"], "year": result["year"], "financialRecordId": financial_record_id}],
        "summary": {
            "errorCount": len(result["validation_errors"]),
            "lineItemCount": len(result["line_items"]),
            "reconciliationCheckCount": len(result["reconciliation_checks"]),
        },
    }


_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _prior_ending_balance(institution_id: str, month: str, year: int) -> float | None:
    """Return the previous month's ending_balance_after_remit, or None if no prior record exists."""
    idx = _MONTH_NAMES.index(month)
    prior_month = _MONTH_NAMES[idx - 1] if idx > 0 else "Dec"
    prior_year = year if idx > 0 else year - 1

    result = (
        get_table("parishes", "financial_records")
        .select("ending_balance_after_remit")
        .eq("institution_id", institution_id)
        .eq("year", prior_year)
        .eq("month", prior_month)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )
    if result.data:
        return float(result.data["ending_balance_after_remit"] or 0)
    return None


def _upsert_financial_record(institution_id: str, submission_batch_id: str, month: str, year: int, beginning_balance: float) -> str:
    existing = (
        get_table("parishes", "financial_records")
        .select("id")
        .eq("institution_id", institution_id)
        .eq("year", year)
        .eq("month", month)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .maybe_single()
        .execute()
    )

    if existing.data:
        record_id = existing.data["id"]
        get_table("parishes", "financial_records").update(
            {
                "submission_batch_id": submission_batch_id,
                "beginning_balance": beginning_balance,
                "status": "submitted",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "record_timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", record_id).execute()
        return record_id

    # Auto-fill beginning_balance from prior month when priest left it as 0
    resolved_balance = beginning_balance
    if beginning_balance == 0:
        prior = _prior_ending_balance(institution_id, month, year)
        if prior is not None:
            resolved_balance = prior

    inserted = (
        get_table("parishes", "financial_records")
        .insert(
            {
                "institution_id": institution_id,
                "submission_batch_id": submission_batch_id,
                "month": month,
                "year": year,
                "status": "submitted",
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "record_timestamp": datetime.now(timezone.utc).isoformat(),
                "beginning_balance": resolved_balance,
            }
        )
        .execute()
    )
    return inserted.data[0]["id"]


def _replace_line_items(financial_record_id: str, line_items: list[dict[str, Any]]) -> None:
    account_titles = get_table("parishes", "iafr_account_titles").select("id, account_code").eq("is_active", True).execute()
    code_to_id = {row["account_code"]: row["id"] for row in (account_titles.data or [])}

    get_table("parishes", "iafr_line_items").delete().eq("financial_record_id", financial_record_id).execute()

    if not line_items:
        return

    payload = [
        {
            "financial_record_id": financial_record_id,
            "account_title_id": code_to_id.get(item["account_code"]) if item["account_code"] else None,
            "section_code": item["section_code"],
            "subsection_code": item["subsection_code"] or None,
            "item_label": item["item_label"],
            "item_type": item["item_type"],
            "amount": item["amount"],
            "source_row_number": item.get("source_row_number"),
            "source_label": item.get("source_label"),
        }
        for item in line_items
        if item["section_code"] != "A"  # Section A (granular arancel breakdowns) are memo-only, not stored as line items
    ]
    get_table("parishes", "iafr_line_items").insert(payload).execute()


def _write_validation_results(
    submission_batch_id: str, institution_id: str, financial_record_id: str | None, result: dict[str, Any]
) -> None:
    if result["validation_errors"]:
        payload = [
            {
                "submission_batch_id": submission_batch_id,
                "institution_id": institution_id,
                "source_row_number": e.get("source_row_number"),
                "field_name": e.get("field_name"),
                "error_type": e["error_type"],
                "severity": e["severity"],
                "error_message": e["error_message"],
            }
            for e in result["validation_errors"]
        ]
        get_table("operations", "validation_errors").insert(payload).execute()

    if result["reconciliation_checks"]:
        payload = [
            {
                "submission_batch_id": submission_batch_id,
                "institution_id": institution_id,
                "financial_record_id": financial_record_id,
                "check_name": c["check_name"],
                "check_scope": c["check_scope"],
                "expected_amount": c["expected_amount"],
                "actual_amount": c["actual_amount"],
                "difference_amount": c["difference_amount"],
                "status": c["status"],
            }
            for c in result["reconciliation_checks"]
        ]
        get_table("operations", "reconciliation_checks").insert(payload).execute()

    get_table("operations", "submission_batches").update({"validation_status": result["validation_status"]}).eq(
        "id", submission_batch_id
    ).execute()
