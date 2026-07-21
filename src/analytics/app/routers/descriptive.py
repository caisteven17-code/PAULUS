"""
Descriptive analytics router — What happened?
Prefix: /analytics/descriptive
"""

from typing import Literal

from fastapi import APIRouter, HTTPException

from app.services.descriptive import financial_trend as svc_ft
from app.services.descriptive import parish_cluster as svc_pc
from app.services.descriptive import pastoral_assignment as svc_pa
from app.services.descriptive import projects as svc_proj
from app.services.descriptive import seasonality_trend as svc_st

router = APIRouter(tags=["descriptive"])

EntityType = Literal["parish", "school", "seminary"]


@router.get("/financial-trend/{entity_type}/{institution_id}")
async def financial_trend(
    entity_type: EntityType,
    institution_id: str,
    year: int | None = None,
    timeframe: Literal["6m", "12m", "all"] | None = None,
    vicariates: str | None = None,
    institution_ids: str | None = None,
):
    try:
        vicariate_list = [v for v in vicariates.split(",") if v] if vicariates else None
        institution_id_list = [i for i in institution_ids.split(",") if i] if institution_ids else None
        return await svc_ft.get_financial_trend(
            institution_id,
            entity_type,
            year=year,
            timeframe=timeframe,
            vicariates=vicariate_list,
            institution_ids=institution_id_list,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Financial trend error: {exc}")


@router.get("/pastoral-assignment/{institution_id}")
async def pastoral_assignment(institution_id: str):
    try:
        return await svc_pa.get_pastoral_assignment(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pastoral assignment error: {exc}")


@router.get("/parish-cluster")
async def parish_cluster():
    try:
        return await svc_pc.get_parish_cluster()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parish cluster error: {exc}")


@router.get("/seasonality/{entity_type}/{institution_id}")
async def seasonality_trend(
    entity_type: EntityType,
    institution_id: str,
    year: int | None = None,
    timeframe: Literal["6m", "12m", "all"] | None = None,
):
    try:
        return await svc_st.get_seasonality_trend(institution_id, entity_type, year=year, timeframe=timeframe)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Seasonality trend error: {exc}")


@router.get("/projects/{institution_id}")
async def projects_descriptive(institution_id: str):
    try:
        return await svc_proj.get_projects(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Projects descriptive error: {exc}")
