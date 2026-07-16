from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import financial_pusher

router = APIRouter(prefix="/pusher", tags=["pusher"])


class PusherFile(BaseModel):
    name: str
    contentBase64: str


class ValidateRequest(BaseModel):
    files: list[PusherFile]
    uploadedBy: str | None = None


class MappingReview(BaseModel):
    key: str
    action: str = Field(pattern="^(map|ignore|memo|not_in_template)$")
    canonicalAccountCode: str | None = None
    canonicalField: str | None = None
    aggregationRule: str | None = None
    sourceHeader: str | None = None
    sourceSection: str | None = None


class ParishMappingReview(BaseModel):
    sourceCode: str | None = None
    sourceName: str
    institutionId: str


class CommitRequest(BaseModel):
    batchId: str
    mappings: list[MappingReview]
    parishMappings: list[ParishMappingReview] = Field(default_factory=list)
    importMode: str = Field(default="skip_existing", pattern="^(skip_existing|replace_existing|version_existing)$")
    committedBy: str | None = None


class CreateCanonicalAccountRequest(BaseModel):
    id: str | None = None
    accountCode: str
    accountName: str
    sectionCode: str
    subsectionCode: str | None = None
    accountType: str
    classification: str | None = None
    sourceHeader: str | None = None
    sourceSection: str | None = None
    effectiveYear: int | None = None
    reason: str | None = None
    requestedBy: str | None = None


@router.get("/accounts")
async def accounts():
    try:
        return {"accounts": financial_pusher.list_accounts()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/institutions")
async def institutions():
    try:
        return {"institutions": financial_pusher.list_parish_institutions()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/validate")
async def validate(body: ValidateRequest):
    try:
        return financial_pusher.validate_files([file.model_dump() for file in body.files], body.uploadedBy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _run_commit_job(body: CommitRequest):
    try:
        financial_pusher.commit_batch(
            batch_id=body.batchId,
            mappings=[mapping.model_dump() for mapping in body.mappings],
            parish_mappings=[mapping.model_dump() for mapping in body.parishMappings],
            import_mode=body.importMode,
            committed_by=body.committedBy,
        )
    except Exception as exc:
        financial_pusher.mark_commit_failed(body.batchId, str(exc))


@router.post("/commit")
async def commit(body: CommitRequest, background_tasks: BackgroundTasks):
    try:
        started = financial_pusher.start_commit_batch(body.batchId, body.importMode, body.committedBy)
        if started["status"] == "committing":
            background_tasks.add_task(_run_commit_job, body)
        return started
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/commit-progress/{batch_id}")
async def commit_progress(batch_id: str):
    try:
        return financial_pusher.get_commit_progress(batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/batch-rows/{batch_id}")
async def batch_rows(batch_id: str, status: str | None = None, limit: int = Query(default=500, ge=1, le=2000)):
    try:
        return financial_pusher.list_batch_rows(batch_id, status, limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/canonical-account")
async def canonical_account(body: CreateCanonicalAccountRequest):
    try:
        return financial_pusher.create_canonical_account(body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/canonical-account")
async def update_canonical_account(body: CreateCanonicalAccountRequest):
    try:
        return financial_pusher.update_canonical_account(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/canonical-account/{account_id}")
async def delete_canonical_account(account_id: str):
    try:
        return financial_pusher.deactivate_canonical_account(account_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
