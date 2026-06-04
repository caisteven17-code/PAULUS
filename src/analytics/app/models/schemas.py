from typing import List, Optional

from pydantic import BaseModel


class HealthDimensions(BaseModel):
    liquidity: float
    sustainability: float
    efficiency: float
    stability: float
    growth: float


class HealthScoreResponse(BaseModel):
    entity_id: str
    entity_type: str
    entity_class: Optional[str] = None
    composite_score: float
    dimensions: HealthDimensions
    trend: str
    percentage_change: float
    analysis: str
    recommendations: List[str]
    timestamp: str


class AnomalyResult(BaseModel):
    entity_id: str
    target_month: Optional[str] = None
    anomaly_detected: bool
    anomaly_type: Optional[str] = None
    severity: Optional[str] = None
    confidence_score: Optional[float] = None
    analysis: Optional[str] = None
    timestamp: str


class InstitutionSummary(BaseModel):
    entity_id: str
    entity_type: str
    composite_score: float
    trend: str


class DioceseSummary(BaseModel):
    total_institutions: int
    average_score: float
    healthy_count: int
    at_risk_count: int
    critical_count: int
    by_type: dict
    institutions: List[InstitutionSummary]
    timestamp: str
