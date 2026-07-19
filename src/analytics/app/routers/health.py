from fastapi import APIRouter

from app.services import analytics_db
from app.services.warehouse_monitor import health as warehouse_health

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    return {"status": "ok", "service": "diocese-analytics"}


@router.get("/warehouse/health")
def warehouse_health_check():
    if not analytics_db.enabled():
        return {"status": "disabled", "reason": "ANALYTICS_DB_URL is not configured"}
    return warehouse_health()
