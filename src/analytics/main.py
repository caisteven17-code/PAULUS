import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analytics, descriptive, diagnostic, health, predictive, prescriptive

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

# Existing routers (unchanged)
app.include_router(health.router)
app.include_router(analytics.router, prefix="/analytics")

# New 4-tier analytics pipeline routers
app.include_router(descriptive.router, prefix="/analytics/descriptive")
app.include_router(diagnostic.router, prefix="/analytics/diagnostic")
app.include_router(predictive.router, prefix="/analytics/predictive")
app.include_router(prescriptive.router, prefix="/analytics/prescriptive")
