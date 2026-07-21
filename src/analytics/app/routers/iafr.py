"""IAFR parish submission cleaning endpoint.

Mounted at the app root (not under /analytics) so the NestJS gateway can
proxy it 1:1 — see analytics-gateway.controller.ts's `cleanIafrSubmission`.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import iafr_cleaner, iafr_sandbox
from app.services.supabase_client import get_table, get_supabase

router = APIRouter(tags=["iafr"])

STORAGE_BUCKET = "financial-submissions"


class CleanSubmissionRequest(BaseModel):
    submissionBatchId: str
    storagePath: str


class TestCleanSubmissionRequest(BaseModel):
    runId: str
    storagePath: str


def _validation_issue_preview(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "fieldName": issue.get("field_name") or "Submission",
            "severity": issue.get("severity", "warning"),
            "message": issue.get("error_message", "The field needs review."),
            "sourceRow": issue.get("source_row_number"),
            "errorType": issue.get("error_type"),
        }
        for issue in result.get("validation_errors", [])
    ]


def _set_test_stage(
    run_id: str,
    stage_code: str,
    sequence_no: int,
    status: str,
    message: str,
    progress_percent: int,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    finished_at = now if status in {"completed", "warning", "failed"} else None
    get_table("operations", "parish_submission_test_stage_events").upsert(
        {
            "run_id": run_id,
            "stage_code": stage_code,
            "sequence_no": sequence_no,
            "status": status,
            "message": message,
            "started_at": None if status == "pending" else now,
            "finished_at": finished_at,
        },
        on_conflict="run_id,stage_code",
    ).execute()
    run_update: dict[str, Any] = {
        "current_stage": stage_code,
        "progress_percent": progress_percent,
        "status": "failed" if status == "failed" else "running",
    }
    if status == "failed":
        run_update["error_summary"] = message
    get_table("operations", "parish_submission_test_runs").update(run_update).eq("id", run_id).execute()


@router.post("/iafr/clean-submission-test")
async def clean_submission_test(body: TestCleanSubmissionRequest):
    """Parse and commit one uploaded IAFR file into the isolated test schema."""
    run_response = (
        get_table("operations", "parish_submission_test_runs")
        .select("id,institution_id,reporting_month,reporting_year,input_method,status")
        .eq("id", body.runId)
        .single()
        .execute()
    )
    if not run_response.data:
        raise HTTPException(status_code=404, detail=f"Test submission run {body.runId} not found.")

    run = run_response.data
    if run["input_method"] != "file":
        raise HTTPException(status_code=400, detail="The sandbox cleaner only processes file test runs.")

    institution = (
        get_table("diocese", "institutions")
        .select("id,name")
        .eq("id", run["institution_id"])
        .single()
        .execute()
    )
    institution_name = institution.data["name"] if institution.data else None

    _set_test_stage(body.runId, "reading", 2, "running", "Reading the uploaded IAFR workbook.", 25)
    try:
        file_bytes = get_supabase().storage.from_(STORAGE_BUCKET).download(body.storagePath)
        result = iafr_cleaner.clean_submission(
            file_bytes=file_bytes,
            filename=body.storagePath,
            target_month=run["reporting_month"],
            target_year=run["reporting_year"],
            expected_parish_name=institution_name,
        )
    except Exception as exc:
        _set_test_stage(body.runId, "reading", 2, "failed", f"Could not read the test file: {exc}", 25)
        raise HTTPException(status_code=422, detail=f"Could not read the test file: {exc}") from exc

    _set_test_stage(body.runId, "reading", 2, "completed", "IAFR workbook structure was read successfully.", 30)
    if result["validation_status"] == "failed" and not result["line_items"]:
        message = f"File validation failed with {len(result['validation_errors'])} issue(s)."
        _set_test_stage(body.runId, "validation", 3, "failed", message, 35)
        return {
            "runId": body.runId,
            "status": "failed",
            "validationStatus": result["validation_status"],
            "issues": _validation_issue_preview(result),
            "summary": {"errorCount": len(result["validation_errors"]), "canonicalEntryCount": 0},
        }

    _set_test_stage(body.runId, "validation", 3, "completed", "Required workbook fields passed validation.", 40)
    _set_test_stage(body.runId, "cleaning", 4, "completed", "Financial values were standardized.", 50)
    _set_test_stage(body.runId, "calculation", 5, "completed", "IAFR calculated fields were extracted.", 60)

    entries = iafr_sandbox.canonical_entries(result)
    if not entries:
        _set_test_stage(body.runId, "mapping", 6, "failed", "No canonical financial entries were produced.", 65)
        return {
            "runId": body.runId,
            "status": "failed",
            "validationStatus": result["validation_status"],
            "issues": _validation_issue_preview(result),
            "summary": {"errorCount": len(result["validation_errors"]), "canonicalEntryCount": 0},
        }

    _set_test_stage(body.runId, "mapping", 6, "running", "Matching extracted values to canonical accounts.", 70)
    get_table("operations", "parish_submission_test_entries").delete().eq("run_id", body.runId).execute()
    entry_payload = [{"run_id": body.runId, **entry} for entry in entries]
    get_table("operations", "parish_submission_test_entries").insert(entry_payload).execute()
    _set_test_stage(body.runId, "mapping", 6, "completed", f"Mapped {len(entries)} canonical entries.", 75)

    _set_test_stage(body.runId, "loading", 7, "running", "Writing to parishes_submission_test.", 80)
    commit_response = get_supabase().schema("operations").rpc(
        "commit_parish_submission_test_run", {"p_run_id": body.runId}
    ).execute()
    if not commit_response.data:
        _set_test_stage(body.runId, "loading", 7, "failed", "The production-shaped test insert failed.", 80)
        return {
            "runId": body.runId,
            "status": "failed",
            "validationStatus": result["validation_status"],
            "issues": _validation_issue_preview(result),
            "summary": {"errorCount": len(result["validation_errors"]), "canonicalEntryCount": len(entries)},
        }

    _set_test_stage(body.runId, "loading", 7, "completed", "Production-shaped test records were saved.", 85)
    failed_checks = [check for check in result["reconciliation_checks"] if check["status"] == "failed"]
    reconciliation_status = "failed" if failed_checks else "completed"
    reconciliation_message = (
        f"{len(failed_checks)} reconciliation check(s) failed."
        if failed_checks
        else f"{len(result['reconciliation_checks'])} reconciliation check(s) completed."
    )
    _set_test_stage(body.runId, "reconciliation", 8, reconciliation_status, reconciliation_message, 95)
    if failed_checks:
        return {
            "runId": body.runId,
            "status": "failed",
            "validationStatus": result["validation_status"],
            "issues": _validation_issue_preview(result)
            + [
                {
                    "fieldName": check["check_name"],
                    "severity": "error",
                    "message": "The calculated workbook total does not match the extracted component total.",
                    "sourceRow": None,
                    "errorType": "reconciliation_mismatch",
                }
                for check in failed_checks
            ],
            "summary": {
                "errorCount": len(result["validation_errors"]),
                "canonicalEntryCount": len(entries),
                "reconciliationCheckCount": len(result["reconciliation_checks"]),
            },
        }

    _set_test_stage(body.runId, "completed", 9, "completed", "Sandbox file submission completed.", 100)
    get_table("operations", "parish_submission_test_runs").update(
        {"status": "completed", "current_stage": "completed", "progress_percent": 100, "completed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", body.runId).execute()
    return {
        "runId": body.runId,
        "financialRecordId": commit_response.data,
        "status": "completed",
        "validationStatus": result["validation_status"],
        "issues": _validation_issue_preview(result),
        "summary": {
            "errorCount": len(result["validation_errors"]),
            "canonicalEntryCount": len(entries),
            "reconciliationCheckCount": len(result["reconciliation_checks"]),
        },
    }


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
