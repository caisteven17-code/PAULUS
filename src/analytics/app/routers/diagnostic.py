"""
Diagnostic analytics router — Why did it happen?
Prefix: /analytics/diagnostic
"""

from typing import Literal

from fastapi import APIRouter, HTTPException

from app.services.diagnostic import priest_financial as svc_pf
from app.services.diagnostic import cluster_seasonal as svc_cs
from app.services.diagnostic import project_risk as svc_pr

router = APIRouter(tags=["diagnostic"])

EntityType = Literal["parish", "school", "seminary"]


@router.get("/priest-financial/{institution_id}")
async def priest_financial_diagnostic(institution_id: str):
    try:
        return await svc_pf.get_priest_financial_diagnostic(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Priest-financial diagnostic error: {exc}")


@router.get("/cluster-seasonal/{entity_type}/{institution_id}")
async def cluster_seasonal_diagnostic(entity_type: EntityType, institution_id: str):
    try:
        return await svc_cs.get_cluster_seasonal_diagnostic(institution_id, entity_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cluster-seasonal diagnostic error: {exc}")


@router.get("/project-risk/{institution_id}")
async def project_risk_diagnostic(institution_id: str):
    try:
        return await svc_pr.get_project_risk_diagnostic(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Project risk diagnostic error: {exc}")
