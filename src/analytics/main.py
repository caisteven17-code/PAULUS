import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    LITURGICAL_APPROVAL_POLL_SECONDS,
    LITURGICAL_APPROVAL_SYNC_ENABLED,
    WAREHOUSE_BRONZE_COMPARISON_ENABLED,
    WAREHOUSE_EDUCATION_POLL_SECONDS,
    WAREHOUSE_EDUCATION_SYNC_ENABLED,
    WAREHOUSE_GOLD_INCREMENTAL_ENABLED,
    WAREHOUSE_INSTITUTION_POLL_SECONDS,
    WAREHOUSE_INSTITUTION_SYNC_ENABLED,
    WAREHOUSE_PILOT_INSTITUTION_IDS,
    WAREHOUSE_PILOT_POLL_SECONDS,
    WAREHOUSE_PILOT_SYNC_ENABLED,
    WAREHOUSE_SUBMISSION_POLL_SECONDS,
    WAREHOUSE_SUBMISSION_SYNC_ENABLED,
    WAREHOUSE_SYNC_ALL_PARISHES,
)
from app.routers import health, iafr, pusher
from app.services import (
    analytics_db,
    education_financial_sync,
    institution_dimension_sync,
    liturgical_calendar_loader,
    submission_dimension_sync,
    warehouse_worker,
)

try:
    from app.routers import analytics, descriptive, diagnostic, predictive, prescriptive

    OPTIONAL_ROUTERS_ERROR = None
except Exception as exc:
    analytics = descriptive = diagnostic = predictive = prescriptive = None
    OPTIONAL_ROUTERS_ERROR = exc

app = FastAPI(title="Diocese Analytics API", version="2.0.0")
logger = logging.getLogger(__name__)

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
app.include_router(health.router)
app.include_router(iafr.router)

_warehouse_worker_stop: asyncio.Event | None = None
_warehouse_worker_task: asyncio.Task | None = None
_institution_worker_task: asyncio.Task | None = None
_submission_worker_task: asyncio.Task | None = None
_liturgical_worker_task: asyncio.Task | None = None
_education_worker_task: asyncio.Task | None = None

# Existing routers (unchanged when optional analytics dependencies are installed)
if OPTIONAL_ROUTERS_ERROR is None:
    app.include_router(analytics.router, prefix="/analytics")
    # New 4-tier analytics pipeline routers
    app.include_router(descriptive.router, prefix="/analytics/descriptive")
    app.include_router(diagnostic.router, prefix="/analytics/diagnostic")
    app.include_router(predictive.router, prefix="/analytics/predictive")
    app.include_router(prescriptive.router, prefix="/analytics/prescriptive")


@app.on_event("startup")
async def _size_default_executor():
    # Every descriptive/health-scoring service in this app wraps its blocking
    # Supabase/AWS calls in asyncio.to_thread, which borrows the loop's
    # default executor — Python's default there is only ~8-12 workers on
    # typical hardware. That's fine for one request, but the health-scores
    # batch fires dozens of these concurrently (one per institution), so most
    # of them queue behind the small pool instead of actually running,
    # pushing per-request latency well past the gateway's 10s timeout. These
    # are I/O-bound waits (network round trips), not CPU-bound work, so a much
    # larger thread count than the CPU core count is the standard fix.
    asyncio.get_running_loop().set_default_executor(ThreadPoolExecutor(max_workers=64))


@app.on_event("startup")
async def _reap_stale_etl_runs():
    # Any warehouse_control.etl_runs row still 'running' at this point was
    # orphaned by a previous process instance dying mid-run (killed, crashed,
    # redeployed) before it could record a real outcome — a run can never
    # legitimately span a process restart. Left alone, these accumulate
    # indefinitely and make the ETL history unreliable. Runs regardless of
    # whether the sync workers below are enabled, since orphaned rows can
    # predate the current .env configuration.
    if analytics_db.enabled():
        try:
            reaped = await asyncio.to_thread(analytics_db.reap_stale_etl_runs)
            if reaped:
                logger.warning("Reaped %d orphaned warehouse_control.etl_runs row(s)", reaped)
        except Exception:
            logger.exception("Failed to reap stale etl_runs rows at startup")


@app.on_event("startup")
async def _start_warehouse_worker():
    global \
        _warehouse_worker_stop, \
        _warehouse_worker_task, \
        _institution_worker_task, \
        _submission_worker_task, \
        _liturgical_worker_task, \
        _education_worker_task
    if (
        not WAREHOUSE_PILOT_SYNC_ENABLED
        and not WAREHOUSE_INSTITUTION_SYNC_ENABLED
        and not WAREHOUSE_SUBMISSION_SYNC_ENABLED
        and not LITURGICAL_APPROVAL_SYNC_ENABLED
        and not WAREHOUSE_EDUCATION_SYNC_ENABLED
    ):
        return
    if WAREHOUSE_PILOT_SYNC_ENABLED and not WAREHOUSE_SYNC_ALL_PARISHES and not WAREHOUSE_PILOT_INSTITUTION_IDS:
        raise RuntimeError("WAREHOUSE_PILOT_SYNC_ENABLED requires WAREHOUSE_PILOT_INSTITUTION_IDS")
    if not analytics_db.enabled():
        raise RuntimeError("Warehouse synchronization requires ANALYTICS_DB_URL")
    _warehouse_worker_stop = asyncio.Event()
    if WAREHOUSE_PILOT_SYNC_ENABLED:
        _warehouse_worker_task = asyncio.create_task(warehouse_worker.run_forever(_warehouse_worker_stop))
    if WAREHOUSE_INSTITUTION_SYNC_ENABLED:
        _institution_worker_task = asyncio.create_task(institution_dimension_sync.run_forever(_warehouse_worker_stop))
    if WAREHOUSE_SUBMISSION_SYNC_ENABLED:
        _submission_worker_task = asyncio.create_task(submission_dimension_sync.run_forever(_warehouse_worker_stop))
    if LITURGICAL_APPROVAL_SYNC_ENABLED:
        _liturgical_worker_task = asyncio.create_task(
            liturgical_calendar_loader.run_approval_sync_forever(_warehouse_worker_stop)
        )
    if WAREHOUSE_EDUCATION_SYNC_ENABLED:
        _education_worker_task = asyncio.create_task(education_financial_sync.run_forever(_warehouse_worker_stop))


@app.on_event("shutdown")
async def _shutdown_analytics_db():
    if _warehouse_worker_stop is not None:
        _warehouse_worker_stop.set()
    if _warehouse_worker_task is not None:
        try:
            await asyncio.wait_for(_warehouse_worker_task, timeout=10)
        except TimeoutError:
            _warehouse_worker_task.cancel()
    if _institution_worker_task is not None:
        try:
            await asyncio.wait_for(_institution_worker_task, timeout=10)
        except TimeoutError:
            _institution_worker_task.cancel()
    if _submission_worker_task is not None:
        try:
            await asyncio.wait_for(_submission_worker_task, timeout=10)
        except TimeoutError:
            _submission_worker_task.cancel()
    if _liturgical_worker_task is not None:
        try:
            await asyncio.wait_for(_liturgical_worker_task, timeout=10)
        except TimeoutError:
            _liturgical_worker_task.cancel()
    if _education_worker_task is not None:
        try:
            await asyncio.wait_for(_education_worker_task, timeout=10)
        except TimeoutError:
            _education_worker_task.cancel()
    analytics_db.close_pool()
    analytics_db.close_etl_pool()


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
        "worker": warehouse_worker.worker_status(),
        "silver_source": "supabase_direct",
        "bronze_comparison_enabled": WAREHOUSE_BRONZE_COMPARISON_ENABLED,
        "gold_incremental_enabled": WAREHOUSE_GOLD_INCREMENTAL_ENABLED,
        "institution_sync_enabled": WAREHOUSE_INSTITUTION_SYNC_ENABLED,
        "institution_poll_seconds": WAREHOUSE_INSTITUTION_POLL_SECONDS,
        "institution_worker_running": (_institution_worker_task is not None and not _institution_worker_task.done()),
        "submission_sync_enabled": WAREHOUSE_SUBMISSION_SYNC_ENABLED,
        "submission_poll_seconds": WAREHOUSE_SUBMISSION_POLL_SECONDS,
        "submission_worker_running": (_submission_worker_task is not None and not _submission_worker_task.done()),
        "liturgical_approval_sync_enabled": LITURGICAL_APPROVAL_SYNC_ENABLED,
        "liturgical_approval_poll_seconds": LITURGICAL_APPROVAL_POLL_SECONDS,
        "liturgical_worker_running": (_liturgical_worker_task is not None and not _liturgical_worker_task.done()),
        "education_sync_enabled": WAREHOUSE_EDUCATION_SYNC_ENABLED,
        "education_poll_seconds": WAREHOUSE_EDUCATION_POLL_SECONDS,
        "education_worker_running": (_education_worker_task is not None and not _education_worker_task.done()),
    }
