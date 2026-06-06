from typing import Any, Dict, List, Optional

from pydantic import BaseModel

# ── Existing models (unchanged) ───────────────────────────────────────────────

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


# ── Shared primitives ─────────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    period: str
    value: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class ChampionModelResult(BaseModel):
    champion_model: str
    metrics: Dict[str, Any]
    all_candidates: Dict[str, Any]
    wape: float
    needs_retraining: bool  # True if WAPE > 0.15


# ── Descriptive schemas ───────────────────────────────────────────────────────

class FinancialTrendResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    monthly_series: List[Dict[str, Any]]   # [{period, total_receipts, total_expenses, trend, seasonal, residual}]
    anomaly_flags: List[Dict[str, Any]]    # [{period, is_anomaly, z_score}]
    kpis: Dict[str, float]                 # annual_growth_rate, disbursement_ratio, mom_change, deficit_rate
    decline_detected: bool
    timestamp: str


class PastoralAssignmentResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    assignment_periods: List[Dict[str, Any]]  # [{period_label, avg_monthly_collection, variance, mom_change}]
    performance_analysis: Dict[str, Any]
    timestamp: str


class ParishClusterResponse(BaseModel):
    data_sufficient: bool
    cluster_counts: Dict[str, int]          # {High-Performing, Growing, Stable, At-Risk}
    parishes: List[Dict[str, Any]]          # [{institution_id, cluster_label, avg_collection, growth_rate, variance}]
    kpis: Dict[str, float]                  # cluster_purity, rule_coverage_rate
    timestamp: str


class SeasonalityTrendResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    monthly_trend: List[Dict[str, Any]]     # [{month, avg_collection, seasonal_impact}]
    event_averages: List[Dict[str, Any]]    # [{event_name, avg_collection, vs_baseline_pct}]
    seasonal_anomalies: List[Dict[str, Any]]
    timestamp: str


class ProjectsDescriptiveResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    projects: List[Dict[str, Any]]          # [{project_id, name, completion_pct, raised, target}]
    aggregates: Dict[str, Any]              # total_raised, total_target, overall_completion_pct, count
    timestamp: str


# ── Diagnostic schemas ────────────────────────────────────────────────────────

class PriestFinancialDiagnosticResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    root_cause_indicator: str
    gauge_score: float
    association_score: float
    shap_values: Dict[str, float]
    narrative: str
    timestamp: str


class ClusterSeasonalDiagnosticResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    root_cause: str
    change_points: List[str]
    attribution_precision: float
    shap_values: Dict[str, float]
    narrative: str
    timestamp: str


class ProjectRiskDiagnosticResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    at_risk_projects: List[Dict[str, Any]]
    root_causes: List[str]
    kpis: Dict[str, float]
    change_points: List[str]
    narrative: str
    timestamp: str


# ── Predictive schemas ────────────────────────────────────────────────────────

class FinancialForecastResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    forecast_receipts: List[ForecastPoint]
    forecast_expenses: List[ForecastPoint]
    champion: ChampionModelResult
    signal: str                             # "rise" | "fall" | "stable"
    timestamp: str


class PastoralForecastResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    continuous_forecast: List[ForecastPoint]
    state_prediction: str                   # "improving" | "stable" | "declining"
    transition_probabilities: Dict[str, float]
    champion: ChampionModelResult
    timestamp: str


class ClusterForecastResponse(BaseModel):
    data_sufficient: bool
    parish_predictions: List[Dict[str, Any]]   # [{institution_id, current_cluster, predicted_cluster, probability}]
    transition_matrix: Dict[str, Dict[str, float]]
    movement_summary: Dict[str, int]
    timestamp: str


class SeasonalForecastResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    seasonal_forecast: List[ForecastPoint]
    champion: ChampionModelResult
    kpis: Dict[str, float]
    timestamp: str


class ProjectForecastResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    projects: List[Dict[str, Any]]          # [{project_id, success_probability, risk_score, predicted_delay}]
    model_metrics: Dict[str, float]
    timestamp: str


# ── Prescriptive schemas ──────────────────────────────────────────────────────

class FinancialRecommendationResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    optimal_allocation: Dict[str, float]    # {category: recommended_disbursement}
    budget_utilization_pct: float
    disbursement_saved_pct: float
    timestamp: str


class SimulationResponse(BaseModel):
    entity_id: str
    entity_type: str
    scenario_params: Dict[str, Any]
    simulated_monthly: List[Dict[str, Any]]
    health_score_trajectory: List[Dict[str, Any]]
    sensitivity_results: Dict[str, Any]
    timestamp: str


class PastoralActionResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    recommended_actions: List[Dict[str, Any]]
    efficiency_scores: Dict[str, float]
    performance_improvement_estimate: float
    timestamp: str


class ParishUpgradeResponse(BaseModel):
    data_sufficient: bool
    recommended_upgrades: List[Dict[str, Any]]  # [{institution_id, current_cluster, target_cluster, priority, budget}]
    actionability_rate: float
    budget_allocation: Dict[str, float]
    timestamp: str


class SeasonalStrategyResponse(BaseModel):
    data_sufficient: bool
    entity_id: str
    entity_type: str
    season_recommendations: List[Dict[str, Any]]
    sensitivity_results: Dict[str, Any]
    allocation_efficiency: float
    timestamp: str


class ProjectPortfolioResponse(BaseModel):
    data_sufficient: bool
    institution_id: str
    prioritized_projects: List[Dict[str, Any]]
    recommended_budget_allocation: Dict[str, float]
    completion_rate_predictions: Dict[str, float]
    timestamp: str
