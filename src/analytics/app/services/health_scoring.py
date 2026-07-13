from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from app.models.schemas import AnomalyResult, HealthDimensions, HealthScoreResponse
from app.services.data_definitions import (
    _SCHEMA_MAP,
    MONTH_ORDER,
)
from app.services.supabase_client import get_supabase, get_table

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
    _consumable_col: str,
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
    avg_receipts = df["total_receipts"].mean()
    avg_expenses = df["total_expenses"].mean()

    operating_margin = _safe_div(avg_receipts - avg_expenses, avg_receipts or 1)
    expense_ratio = _safe_div(avg_expenses, avg_receipts or 1)

    liquidity = _clamp(_safe_div(avg_receipts, avg_expenses or 1) * 100)
    sustainability = _clamp(50 + operating_margin * 200)
    efficiency = _clamp(100 - max(0.0, expense_ratio - 0.75) * 200)

    std_dev = float(df["total_receipts"].std(ddof=0))
    revenue_stability = _clamp(100 - _safe_div(std_dev, avg_receipts or 1) * 250)

    last = df["total_receipts"].iloc[-1]
    prev = df["total_receipts"].iloc[-2] if len(df) > 1 else last
    growth_rate = _safe_div(last - prev, prev or 1)
    growth_stability = _clamp(50 + growth_rate * 250)
    stability = round(revenue_stability * 0.7 + growth_stability * 0.3)

    expected_periods = max(12, len(df))
    reporting_compliance = _clamp(_safe_div(len(df), expected_periods) * 100)

    composite = round(
        _clamp(
            liquidity * 0.25
            + sustainability * 0.25
            + efficiency * 0.20
            + stability * 0.15
            + reporting_compliance * 0.15
        )
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
            growth=round(reporting_compliance),
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


# ── Snapshot write-back ───────────────────────────────────────────────────────

_DIM_MAP = {
    "parish": ("parish_analytics", "dim_parishes", "parish_key"),
    "school": ("school_analytics", "dim_schools", "school_key"),
    "seminary": ("seminary_analytics", "dim_seminaries", "seminary_key"),
}
_FACT_MAP = {
    "parish": ("parish_analytics", "fact_parish_health_snapshots", "parish_key"),
    "school": ("school_analytics", "fact_school_health_snapshots", "school_key"),
    "seminary": ("seminary_analytics", "fact_seminary_health_snapshots", "seminary_key"),
}


def _write_snapshot(institution_id: str, entity_type: str, score: HealthScoreResponse) -> None:
    """Persist a health snapshot to the analytics star schema. Silently no-ops on any failure."""
    try:
        # 1. Resolve institution name from diocese.institutions
        inst_row = (
            get_supabase()
            .schema("diocese")
            .table("institutions")
            .select("name")
            .eq("id", institution_id)
            .maybe_single()
            .execute()
        )
        inst_name = inst_row.data["name"] if inst_row.data else institution_id

        # 2. Ensure dim_institutions row exists and get institution_key
        di = (
            get_table("shared_analytics", "dim_institutions")
            .select("institution_key")
            .eq("institution_id", institution_id)
            .maybe_single()
            .execute()
        )
        if di.data:
            institution_key = di.data["institution_key"]
        else:
            ins = (
                get_table("shared_analytics", "dim_institutions")
                .insert(
                    {
                        "institution_id": institution_id,
                        "institution_name": inst_name,
                        "institution_type": entity_type,
                    }
                )
                .execute()
            )
            institution_key = ins.data[0]["institution_key"]

        # 3. Ensure type-specific dim row exists and get entity_key
        dim_schema, dim_table, dim_pk = _DIM_MAP[entity_type]
        dd = (
            get_table(dim_schema, dim_table)
            .select(dim_pk)
            .eq("institution_key", institution_key)
            .maybe_single()
            .execute()
        )
        if dd.data:
            entity_key = dd.data[dim_pk]
        else:
            ins2 = get_table(dim_schema, dim_table).insert({"institution_key": institution_key}).execute()
            entity_key = ins2.data[0][dim_pk]

        # 4. date_key = YYYYMM for the current month
        now = datetime.now(timezone.utc)
        date_key = now.year * 100 + now.month

        # 5. Insert or update fact snapshot for this (entity_key, date_key)
        fact_schema, fact_table, fact_fk = _FACT_MAP[entity_type]
        existing = (
            get_table(fact_schema, fact_table)
            .select("snapshot_id")
            .eq(fact_fk, entity_key)
            .eq("date_key", date_key)
            .maybe_single()
            .execute()
        )
        payload = {
            "composite_score": float(score.composite_score),
            "liquidity_score": float(score.dimensions.liquidity),
            "sustainability_score": float(score.dimensions.sustainability),
            "stability_score": float(score.dimensions.stability),
        }
        if existing.data:
            get_table(fact_schema, fact_table).update(payload).eq("snapshot_id", existing.data["snapshot_id"]).execute()
        else:
            get_table(fact_schema, fact_table).insert({fact_fk: entity_key, "date_key": date_key, **payload}).execute()

    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("Health snapshot write-back failed: %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────


async def get_health_score(
    institution_id: str,
    entity_type: str,
    entity_class: Optional[str] = None,
) -> HealthScoreResponse:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")

    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    # deduplicate while preserving order
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    result = (
        get_table(schema, "financial_records")
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
    _write_snapshot(institution_id, entity_type, score)
    return score


async def get_anomaly(institution_id: str, month: str) -> AnomalyResult:
    result = (
        get_table("parishes", "financial_records")
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
    institutions = get_table("diocese", "institutions").select("id, name, institution_type").execute()

    valid = [
        inst for inst in (institutions.data or []) if inst.get("institution_type", "parish").lower() in _SCHEMA_MAP
    ]

    async def _score_one(inst: dict) -> dict | None:
        itype = inst.get("institution_type", "parish").lower()
        try:
            score = await get_health_score(inst["id"], itype)
            return {
                "entity_id": inst["id"],
                "entity_type": itype,
                "composite_score": score.composite_score,
                "trend": score.trend,
            }
        except Exception:
            return None

    gathered = await asyncio.gather(*[_score_one(inst) for inst in valid])
    results = [r for r in gathered if r is not None]

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
