import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import pusher
from app.services import analytics_db

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

@app.on_event("shutdown")
def _shutdown_analytics_db():
    analytics_db.close_pool()


@app.get("/analytics/dependency-warning")
async def analytics_dependency_warning():
    if OPTIONAL_ROUTERS_ERROR is None:
        return {"ok": True}
    return {"ok": False, "error": str(OPTIONAL_ROUTERS_ERROR)}
