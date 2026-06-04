from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from app.models.schemas import AnomalyResult, HealthDimensions, HealthScoreResponse
from app.services.supabase_client import get_supabase

# ── Column definitions per entity type ──────────────────────────────────────

PARISH_RECEIPTS = [
    "mass_intentions_claimed",
    "confirmation_total",
    "charge_over_above",
    "mass_collection_weekday",
    "mass_collection_sunday",
    "mass_collection_saturday",
    "consumable_collections",
    "other_collections_total",
    "donations",
    "interest_income",
    "subsidy_inflow",
    "special_collections",
    "second_collections",
    "other_receipts",
    "construction_receipts",
]
PARISH_EXPENSES = [
    "priest_share",
    "mass_stipend",
    "other_pastoral_expenses",
    "salaries_wages_benefits",
    "govt_contributions",
    "utilities",
    "communications",
    "other_rectory_expenses",
    "construction_expenses",
]
PARISH_CONSUMABLE = "consumable_collections"

SCHOOL_RECEIPTS = ["tuition_revenues", "miscellaneous_fees", "other_income", "subsidy_inflow"]
SCHOOL_EXPENSES = [
    "faculty_payroll",
    "admin_staff_payroll",
    "utilities",
    "facilities_maintenance",
    "supplies",
    "other_expenses",
]
SCHOOL_CONSUMABLE = "tuition_revenues"

SEMINARY_RECEIPTS = [
    "donations",
    "seminary_fees",
    "mass_collections",
    "other_sources",
    "subsidy_from_rbscp",
    "tuition_fees",
    "board_lodging_fees",
    "drm_modules",
    "sra_reading_lab",
    "retreat",
    "honorarium_fee",
    "miscellaneous_fees",
]
SEMINARY_EXPENSES = [
    "daily_food",
    "food_others",
    "gasoline_seminary",
    "gasoline_vocation",
    "permits_licenses",
    "office_supplies",
    "kitchen_equipment",
    "medical_supplies",
    "liturgical_supplies",
    "construction_materials",
    "other_supplies",
    "lpg",
    "repairs_maintenance",
    "equipment_furniture",
]
SEMINARY_CONSUMABLE = "seminary_fees"

_SCHEMA_MAP = {
    "parish": ("parishes", PARISH_RECEIPTS, PARISH_EXPENSES, PARISH_CONSUMABLE),
    "school": ("schools", SCHOOL_RECEIPTS, SCHOOL_EXPENSES, SCHOOL_CONSUMABLE),
    "seminary": ("seminaries", SEMINARY_RECEIPTS, SEMINARY_EXPENSES, SEMINARY_CONSUMABLE),
}

MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _safe_div(num: float, den: float) -> float:
    return num / den if den != 0 else 0.0


def _build_analysis(
    score: float,
    entity_type: str,
    liquidity: float,
    efficiency: float,
    growth_rate: float,
) -> tuple[str, list[str]]:
    if score >= 80:
        analysis = f"Excellent financial health. The {entity_type} shows strong liquidity and sustainable practices."
        recs = ["Consider expanding mission outreach programs.", "Maintain current reserves."]
    elif score >= 60:
        analysis = f"Good financial health with some areas for optimization. The {entity_type} is stable but could improve efficiency."
        recs = ["Review discretionary spending.", "Optimize collection processes."]
    elif score >= 40:
        analysis = (
            "Fair financial health. There are concerns regarding sustainability and liquidity that need attention."
        )
        recs = ["Implement stricter budget controls.", "Seek additional revenue streams."]
    else:
        analysis = f"Critical financial health. Immediate intervention is required to ensure the {entity_type}'s operational stability."
        recs = ["Urgent financial audit recommended.", "Suspend non-essential disbursements."]

    if liquidity < 50:
        analysis += " Liquidity is a major concern."
    if efficiency < 50:
        analysis += " Operational efficiency is below target."
    if growth_rate < 0:
        analysis += " Recent collections show a downward trend."

    return analysis, recs


# ── Core scoring logic ────────────────────────────────────────────────────────


def _score_from_records(
    df: pd.DataFrame,
    receipt_cols: list[str],
    expense_cols: list[str],
    consumable_col: str,
    entity_type: str,
) -> HealthScoreResponse | None:
    if df.empty:
        return None

    # Sort by year then month
    df = df.copy()
    df["month_idx"] = df["month"].map({m: i for i, m in enumerate(MONTH_ORDER)})
    df = df.sort_values(["year", "month_idx"]).reset_index(drop=True)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    df["consumable"] = pd.to_numeric(df.get(consumable_col, 0), errors="coerce").fillna(0.0)

    avg_receipts = df["total_receipts"].mean()
    avg_expenses = df["total_expenses"].mean()
    avg_consumable = df["consumable"].mean()

    liquidity = _clamp(_safe_div(avg_receipts, avg_expenses or 1) * 100 - 50)
    sustainability = _clamp((_safe_div(avg_consumable, avg_expenses or 1) - 0.4) * 125)
    efficiency = _clamp(100 - (_safe_div(avg_expenses, avg_receipts or 1) - 0.5) * 100)

    std_dev = float(df["total_receipts"].std(ddof=0))
    stability = _clamp(100 - _safe_div(std_dev, avg_receipts or 1) * 250)

    last = df["total_receipts"].iloc[-1]
    prev = df["total_receipts"].iloc[-2] if len(df) > 1 else last
    growth_rate = _safe_div(last - prev, prev or 1)
    growth = _clamp(50 + growth_rate * 500)

    composite = round(
        _clamp(liquidity * 0.30 + sustainability * 0.25 + efficiency * 0.20 + stability * 0.15 + growth * 0.10)
    )

    trend = "up" if composite > 70 else ("down" if composite < 40 else "stable")
    analysis, recs = _build_analysis(composite, entity_type, liquidity, efficiency, growth_rate)

    return HealthScoreResponse(
        entity_id=str(df["institution_id"].iloc[0]),
        entity_type=entity_type,
        composite_score=composite,
        dimensions=HealthDimensions(
            liquidity=round(liquidity),
            sustainability=round(sustainability),
            efficiency=round(efficiency),
            stability=round(stability),
            growth=round(growth),
        ),
        trend=trend,
        percentage_change=round(growth_rate * 100, 2),
        analysis=analysis,
        recommendations=recs,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _default_score(entity_id: str, entity_type: str) -> HealthScoreResponse:
    return HealthScoreResponse(
        entity_id=entity_id,
        entity_type=entity_type,
        composite_score=72,
        dimensions=HealthDimensions(liquidity=75, sustainability=68, efficiency=82, stability=65, growth=55),
        trend="stable",
        percentage_change=2.4,
        analysis="Insufficient financial records to compute a score. Showing default estimate.",
        recommendations=["Submit monthly financial records to enable accurate scoring."],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── Public API ────────────────────────────────────────────────────────────────


async def get_health_score(
    institution_id: str,
    entity_type: str,
    entity_class: Optional[str] = None,
) -> HealthScoreResponse:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")

    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]
    table = f"{schema}.financial_records"

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    # deduplicate while preserving order
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    sb = get_supabase()
    result = (
        sb.table(table)
        .select(", ".join(select_cols))
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    if not result.data:
        return _default_score(institution_id, entity_type)

    df = pd.DataFrame(result.data)
    score = _score_from_records(df, receipt_cols, expense_cols, consumable_col, entity_type)
    if score is None:
        return _default_score(institution_id, entity_type)

    score.entity_class = entity_class
    return score


async def get_anomaly(institution_id: str, month: str) -> AnomalyResult:
    sb = get_supabase()
    result = (
        sb.table("parishes.financial_records")
        .select("institution_id, month, year, net_receipts, consumable_collections")
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .execute()
    )

    ts = datetime.now(timezone.utc).isoformat()

    if not result.data:
        return AnomalyResult(
            entity_id=institution_id,
            target_month=month,
            anomaly_detected=False,
            timestamp=ts,
        )

    df = pd.DataFrame(result.data)
    df["net_receipts"] = pd.to_numeric(df["net_receipts"], errors="coerce").fillna(0.0)
    avg = df["net_receipts"].mean()
    target_rows = df[df["month"] == month]

    if target_rows.empty:
        return AnomalyResult(entity_id=institution_id, target_month=month, anomaly_detected=False, timestamp=ts)

    target_val = float(target_rows["net_receipts"].iloc[0])
    deviation = abs(target_val - avg) / (avg or 1)
    detected = deviation > 0.20

    if not detected:
        return AnomalyResult(entity_id=institution_id, target_month=month, anomaly_detected=False, timestamp=ts)

    anomaly_type = "High Disbursements" if target_val < avg else "Collection Fluctuation"
    return AnomalyResult(
        entity_id=institution_id,
        target_month=month,
        anomaly_detected=True,
        anomaly_type=anomaly_type,
        severity="medium" if deviation < 0.4 else "high",
        confidence_score=round(min(95, 60 + deviation * 100), 1),
        analysis=f"Net receipts for {month} deviate {round(deviation * 100)}% from the monthly average.",
        timestamp=ts,
    )


async def get_diocese_summary() -> dict:
    sb = get_supabase()
    institutions = sb.table("diocese.institutions").select("id, name, institution_type").execute()

    results: list[dict] = []
    for inst in institutions.data or []:
        itype = inst.get("institution_type", "parish").lower()
        if itype not in _SCHEMA_MAP:
            continue
        try:
            score = await get_health_score(inst["id"], itype)
            results.append(
                {
                    "entity_id": inst["id"],
                    "entity_type": itype,
                    "composite_score": score.composite_score,
                    "trend": score.trend,
                }
            )
        except Exception:
            pass

    scores = [r["composite_score"] for r in results]
    avg = round(sum(scores) / len(scores), 1) if scores else 0

    return {
        "total_institutions": len(results),
        "average_score": avg,
        "healthy_count": sum(1 for s in scores if s >= 70),
        "at_risk_count": sum(1 for s in scores if 40 <= s < 70),
        "critical_count": sum(1 for s in scores if s < 40),
        "by_type": {
            t: round(
                sum(r["composite_score"] for r in results if r["entity_type"] == t)
                / max(1, sum(1 for r in results if r["entity_type"] == t)),
                1,
            )
            for t in ("parish", "school", "seminary")
        },
        "institutions": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
