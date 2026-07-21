from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import AnomalyResult, HealthScoreResponse
from app.services import health_scoring

router = APIRouter(tags=["analytics"])

EntityType = Literal["parish", "school", "seminary"]


@router.get("/health/{entity_type}/{institution_id}", response_model=HealthScoreResponse)
async def compute_health_score(
    entity_type: EntityType,
    institution_id: str,
    entity_class: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    timeframe: Optional[Literal["6m", "12m", "all"]] = Query(default=None),
):
    try:
        return await health_scoring.get_health_score(institution_id, entity_type, entity_class, year, timeframe)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analytics error: {exc}")


@router.get("/anomaly/{institution_id}", response_model=AnomalyResult)
async def detect_anomaly(institution_id: str, month: str = Query(...)):
    try:
        return await health_scoring.get_anomaly(institution_id, month)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Anomaly detection error: {exc}")


@router.get("/diocese")
async def diocese_summary():
    try:
        return await health_scoring.get_diocese_summary()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Diocese summary error: {exc}")
