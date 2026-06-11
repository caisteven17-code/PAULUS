"""
Prescriptive analytics router — What should we do?
Prefix: /analytics/prescriptive
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.prescriptive import financial_recommendation as svc_fr
from app.services.prescriptive import institution_simulation as svc_is
from app.services.prescriptive import parish_upgrade as svc_pu
from app.services.prescriptive import pastoral_action as svc_pa
from app.services.prescriptive import pastoral_simulation as svc_ps
from app.services.prescriptive import project_portfolio as svc_pp
from app.services.prescriptive import seasonal_strategy as svc_ss

router = APIRouter(tags=["prescriptive"])

EntityType = Literal["parish", "school", "seminary"]


# ── Request bodies ─────────────────────────────────────────────────────────────


class SimulationRequest(BaseModel):
    collection_change_pct: float = 0.0
    expense_change_pct: float = 0.0
    periods: int = 12


class CounterfactualReplayRequest(BaseModel):
    start_month: int  # 1-12
    start_year: int
    modified_receipts: float | None = None
    modified_expenses: float | None = None


class PastoralSimulationRequest(BaseModel):
    assignment_duration_months: int = 12
    collection_impact_pct: float = 5.0
    periods: int = 12


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/financial-recommendation/{entity_type}/{institution_id}")
async def financial_recommendation(entity_type: EntityType, institution_id: str):
    try:
        return await svc_fr.get_financial_recommendation(institution_id, entity_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Financial recommendation error: {exc}")


@router.post("/institution-simulation/{entity_type}/{institution_id}")
async def institution_simulation(
    entity_type: EntityType,
    institution_id: str,
    body: SimulationRequest,
):
    try:
        return await svc_is.run_institution_simulation(
            institution_id,
            entity_type,
            collection_change_pct=body.collection_change_pct,
            expense_change_pct=body.expense_change_pct,
            periods=body.periods,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Institution simulation error: {exc}")


@router.post("/counterfactual-replay/{entity_type}/{institution_id}")
async def counterfactual_replay(
    entity_type: EntityType,
    institution_id: str,
    body: CounterfactualReplayRequest,
):
    """Digital Twin: replay history from a past month with modified values."""
    try:
        return await svc_is.run_counterfactual_replay(
            institution_id,
            entity_type,
            start_month=body.start_month,
            start_year=body.start_year,
            modified_receipts=body.modified_receipts,
            modified_expenses=body.modified_expenses,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Counterfactual replay error: {exc}")


@router.get("/pastoral-action/{institution_id}")
async def pastoral_action(institution_id: str):
    try:
        return await svc_pa.get_pastoral_action(institution_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pastoral action error: {exc}")


@router.post("/pastoral-simulation/{institution_id}")
async def pastoral_simulation(institution_id: str, body: PastoralSimulationRequest):
    try:
        return await svc_ps.run_pastoral_simulation(
            institution_id,
            assignment_duration_months=body.assignment_duration_months,
            collection_impact_pct=body.collection_impact_pct,
            periods=body.periods,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pastoral simulation error: {exc}")


@router.get("/parish-upgrade")
async def parish_upgrade(
    budget: float = Query(default=500000.0, ge=0),
    upgrade_cost: float = Query(default=50000.0, ge=0),
):
    try:
        return await svc_pu.get_parish_upgrade(budget=budget, upgrade_cost=upgrade_cost)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parish upgrade error: {exc}")


@router.get("/seasonal-strategy/{entity_type}/{institution_id}")
async def seasonal_strategy(
    entity_type: EntityType,
    institution_id: str,
    total_budget: float = Query(default=100000.0, ge=0),
    max_preparation_per_season: float = Query(default=30000.0, ge=0),
):
    try:
        return await svc_ss.get_seasonal_strategy(
            institution_id,
            entity_type,
            total_budget=total_budget,
            max_preparation_per_season=max_preparation_per_season,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Seasonal strategy error: {exc}")


@router.get("/project-portfolio/{institution_id}")
async def project_portfolio(
    institution_id: str,
    total_budget: float = Query(default=1000000.0, ge=0),
):
    try:
        return await svc_pp.get_project_portfolio(institution_id, total_budget=total_budget)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Project portfolio error: {exc}")
