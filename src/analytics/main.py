import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analytics, health

app = FastAPI(title="Diocese Analytics API", version="1.0.0")

origins = os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
origins += ["http://127.0.0.1:3000", "http://localhost:4000", "http://127.0.0.1:4000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(analytics.router, prefix="/analytics")
