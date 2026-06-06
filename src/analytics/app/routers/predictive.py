"""
Predictive analytics router — What will happen?
Prefix: /analytics/predictive
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.services.predictive import financial_forecast as svc_ff
from app.services.predictive import pastoral_forecast as svc_pf
from app.services.predictive import cluster_forecast as svc_cf
from app.services.predictive import seasonal_forecast as svc_sf
from app.services.predictive import project_forecast as svc_proj

router = APIRouter(tags=["predictive"])

EntityType = Literal["parish", "school", "seminary"]


@router.get("/financial-forecast/{entity_type}/{institution_id}")
async def financial_forecast(
    entity_type: EntityType,
    institution_id: str,
    periods: int = Query(default=12, ge=1, le=36),
):
    try:
        return await svc_ff.get_financial_forecast(institution_id, entity_type, periods)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Financial forecast error: {exc}")


@router.get("/pastoral-forecast/{institution_id}")
async def pastoral_forecast(
    institution_id: str,
    periods: int = Query(default=6, ge=1, le=24),
):
    try:
        return await svc_pf.get_pastoral_forecast(institution_id, periods)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pastoral forecast error: {exc}")


@router.get("/cluster-forecast")
async def cluster_forecast():
    try:
        return await svc_cf.get_cluster_forecast()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cluster forecast error: {exc}")


@router.get("/seasonal-forecast/{entity_type}/{institution_id}")
async def seasonal_forecast(
    entity_type: EntityType,
    institution_id: str,
    periods: int = Query(default=6, ge=1, le=24),
):
    try:
        return await svc_sf.get_seasonal_forecast(institution_id, entity_type, periods)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Seasonal forecast error: {exc}")


@router.get("/project-forecast/{institution_id}")
async def project_forecast(institution_id: str):
    try:
        return await svc_proj.get_project_forecast(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Project forecast error: {exc}")
