import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    WAREHOUSE_BRONZE_COMPARISON_ENABLED,
    WAREHOUSE_PILOT_INSTITUTION_IDS,
    WAREHOUSE_PILOT_POLL_SECONDS,
    WAREHOUSE_PILOT_SYNC_ENABLED,
    WAREHOUSE_SYNC_ALL_PARISHES,
)
from app.routers import pusher
from app.services import analytics_db, warehouse_worker

try:
    from app.routers import analytics, descriptive, diagnostic, health, iafr, predictive, prescriptive

    OPTIONAL_ROUTERS_ERROR = None
except Exception as exc:
    analytics = descriptive = diagnostic = health = iafr = predictive = prescriptive = None
    OPTIONAL_ROUTERS_ERROR = exc

app = FastAPI(title="Diocese Analytics API", version="2.0.0")

origins = os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
origins += ["http://127.0.0.1:3000", "http://localhost:4000", "http://127.0.0.1:4000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pusher.router)

_warehouse_worker_stop: asyncio.Event | None = None
_warehouse_worker_task: asyncio.Task | None = None

# Existing routers (unchanged when optional analytics dependencies are installed)
if OPTIONAL_ROUTERS_ERROR is None:
    app.include_router(health.router)
    app.include_router(analytics.router, prefix="/analytics")
    app.include_router(iafr.router)

    # New 4-tier analytics pipeline routers
    app.include_router(descriptive.router, prefix="/analytics/descriptive")
    app.include_router(diagnostic.router, prefix="/analytics/diagnostic")
    app.include_router(predictive.router, prefix="/analytics/predictive")
    app.include_router(prescriptive.router, prefix="/analytics/prescriptive")


@app.on_event("startup")
async def _start_warehouse_worker():
    global _warehouse_worker_stop, _warehouse_worker_task
    if not WAREHOUSE_PILOT_SYNC_ENABLED:
        return
    if not WAREHOUSE_SYNC_ALL_PARISHES and not WAREHOUSE_PILOT_INSTITUTION_IDS:
        raise RuntimeError("WAREHOUSE_PILOT_SYNC_ENABLED requires WAREHOUSE_PILOT_INSTITUTION_IDS")
    if not analytics_db.enabled():
        raise RuntimeError("WAREHOUSE_PILOT_SYNC_ENABLED requires ANALYTICS_DB_URL")
    _warehouse_worker_stop = asyncio.Event()
    _warehouse_worker_task = asyncio.create_task(warehouse_worker.run_forever(_warehouse_worker_stop))


@app.on_event("shutdown")
async def _shutdown_analytics_db():
    if _warehouse_worker_stop is not None:
        _warehouse_worker_stop.set()
    if _warehouse_worker_task is not None:
        try:
            await asyncio.wait_for(_warehouse_worker_task, timeout=10)
        except TimeoutError:
            _warehouse_worker_task.cancel()
    analytics_db.close_pool()


@app.get("/analytics/dependency-warning")
async def analytics_dependency_warning():
    if OPTIONAL_ROUTERS_ERROR is None:
        return {"ok": True}
    return {"ok": False, "error": str(OPTIONAL_ROUTERS_ERROR)}


@app.get("/warehouse/pilot-status")
async def warehouse_pilot_status():
    return {
        "enabled": WAREHOUSE_PILOT_SYNC_ENABLED,
        "institution_ids": WAREHOUSE_PILOT_INSTITUTION_IDS,
        "sync_all_parishes": WAREHOUSE_SYNC_ALL_PARISHES,
        "poll_seconds": WAREHOUSE_PILOT_POLL_SECONDS,
        "worker_running": _warehouse_worker_task is not None and not _warehouse_worker_task.done(),
        "silver_source": "supabase_direct",
        "bronze_comparison_enabled": WAREHOUSE_BRONZE_COMPARISON_ENABLED,
    }
