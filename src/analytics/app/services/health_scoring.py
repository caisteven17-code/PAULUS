from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from app.models.schemas import AnomalyResult, HealthDimensions, HealthScoreResponse
from app.services import _aws_financials, _singleflight, analytics_db
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
    timeframe: str | None = None,
) -> HealthScoreResponse | None:
    """Supabase path: df has the raw per-category columns, summed here."""
    if df.empty:
        return None

    df = df.copy()
    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    return _score_from_totals(df, entity_type, timeframe)


def _score_from_totals(
    df: pd.DataFrame,
    entity_type: str,
    timeframe: str | None = None,
) -> HealthScoreResponse | None:
    """AWS path (and the tail end of the Supabase path): df already carries
    total_receipts/total_expenses per month — only the pre-aggregation step
    differs between sources, everything downstream is identical."""
    if df.empty:
        return None

    # Sort by year then month
    df = df.copy()
    df["month_idx"] = df["month"].map({m: i for i, m in enumerate(MONTH_ORDER)})
    df = df.sort_values(["year", "month_idx"]).reset_index(drop=True)

    # Timeframe narrows to the trailing N months *within* whatever the query
    # already scoped (e.g. a single year, if one was requested) — same
    # 6m/12m/all convention used by the descriptive financial-trend endpoint.
    window = {"6m": 6, "12m": 12}.get(timeframe or "")
    if window:
        df = df.tail(window).reset_index(drop=True)

    # Fewer than 2 points means there's no month-over-month growth to
    # measure at all — an honest "insufficient," not a noisy real number.
    if len(df) < 2:
        return None

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
        period_start_year=int(df["year"].min()),
        period_end_year=int(df["year"].max()),
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
        data_sufficient=False,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── AWS warehouse fetch (parish only — same source financial_trend.py uses)──


# Supabase's parishes.financial_records exists for legacy/demo compatibility
# but its per-category receipt/expense columns are never populated by the
# real ingestion pipeline (verified empty across all 92 parishes) — the real
# monthly totals live in the AWS warehouse, fetched via the shared
# _aws_financials.parish_monthly_totals helper (also used by
# financial_trend.py's decline-monitor batch).
def _fetch_aws_totals(institution_ids: list[str], year: Optional[int] = None) -> pd.DataFrame:
    return _aws_financials.parish_monthly_totals(institution_ids, year)


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
        # Institution name is a bronze/transactional read — always from Supabase,
        # regardless of where the gold-layer write below lands.
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

        if not analytics_db.enabled():
            # Supabase owns the operational financial record, so the score can
            # be recomputed after AWS recovers. Never recreate an analytical
            # fallback copy in Supabase.
            import logging

            logging.getLogger(__name__).warning("Health snapshot deferred because ANALYTICS_DB_URL is unavailable")
            return
        _write_snapshot_aws(institution_id, entity_type, inst_name, score)

    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("Health snapshot write-back failed: %s", exc)


def _snapshot_payload(score: HealthScoreResponse) -> dict:
    return {
        "composite_score": float(score.composite_score),
        "liquidity_score": float(score.dimensions.liquidity),
        "sustainability_score": float(score.dimensions.sustainability),
        "stability_score": float(score.dimensions.stability),
    }


def _write_snapshot_aws(institution_id: str, entity_type: str, inst_name: str, score: HealthScoreResponse) -> None:
    # 1. Find-or-create dim_institutions row, get institution_key (single round trip)
    institution_key = analytics_db.upsert_row(
        "shared_analytics",
        "dim_institutions",
        {
            "institution_id": institution_id,
            "institution_name": inst_name,
            "institution_type": entity_type,
        },
        conflict_cols="institution_id",
        returning="institution_key",
    )

    # 2. Find-or-create type-specific dim row, get entity_key
    dim_schema, dim_table, dim_pk = _DIM_MAP[entity_type]
    entity_key = analytics_db.upsert_row(
        dim_schema,
        dim_table,
        {"institution_key": institution_key},
        conflict_cols="institution_key",
        returning=dim_pk,
    )

    # 3. date_key = YYYYMM for the current month
    now = datetime.now(timezone.utc)
    date_key = now.year * 100 + now.month

    # 4. Insert or update fact snapshot for this (entity_key, date_key).
    # No unique constraint on (fact_fk, date_key) exists on this table, so a
    # single ON CONFLICT upsert isn't possible — select-then-branch like the
    # Supabase path above.
    fact_schema, fact_table, fact_fk = _FACT_MAP[entity_type]
    existing = analytics_db.fetch_one(
        fact_schema, fact_table, {fact_fk: entity_key, "date_key": date_key}, columns="snapshot_id"
    )
    payload = _snapshot_payload(score)
    if existing:
        set_clause = ", ".join(f'"{k}" = %s' for k in payload)
        analytics_db.execute(
            f'UPDATE "{fact_schema}"."{fact_table}" SET {set_clause} WHERE snapshot_id = %s',
            [*payload.values(), existing["snapshot_id"]],
        )
    else:
        row = {fact_fk: entity_key, "date_key": date_key, **payload}
        col_list = ", ".join(f'"{k}"' for k in row)
        placeholders = ", ".join(["%s"] * len(row))
        analytics_db.execute(
            f'INSERT INTO "{fact_schema}"."{fact_table}" ({col_list}) VALUES ({placeholders})',
            list(row.values()),
        )


# Snapshot writes are pure best-effort history bookkeeping (every failure is
# already swallowed inside _write_snapshot) — they don't need to be on the
# response's critical path. Scheduling them as background tasks, instead of
# awaiting the blocking Supabase/AWS calls inline, keeps the event loop free
# to service other concurrent requests. Kept in a module-level set so the
# tasks aren't garbage-collected before they finish.
_snapshot_tasks: set[asyncio.Task] = set()


def _schedule_snapshot_write(institution_id: str, entity_type: str, score: HealthScoreResponse) -> None:
    task = asyncio.create_task(asyncio.to_thread(_write_snapshot, institution_id, entity_type, score))
    _snapshot_tasks.add(task)
    task.add_done_callback(_snapshot_tasks.discard)


# ── Public API ────────────────────────────────────────────────────────────────


async def get_health_score(
    institution_id: str,
    entity_type: str,
    entity_class: Optional[str] = None,
    year: Optional[int] = None,
    timeframe: Optional[str] = None,
) -> HealthScoreResponse:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")

    if entity_type == "parish" and analytics_db.enabled():
        df = await asyncio.to_thread(_fetch_aws_totals, [institution_id], year)
        # AWS is authoritative for parishes — it's the only source that
        # distinguishes "no records yet for this year" from "nothing to
        # score." Falling back to Supabase here would silently recompute
        # from its always-empty placeholder columns instead of admitting
        # that.
        score = _score_from_totals(df, entity_type, timeframe) if not df.empty else None
        if score is None:
            return _default_score(institution_id, entity_type)
        score.entity_class = entity_class
        if year is None and (timeframe is None or timeframe == "all"):
            _schedule_snapshot_write(institution_id, entity_type, score)
        return score

    schema, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    # deduplicate while preserving order
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    def _fetch_records() -> list[dict]:
        query = (
            get_table(schema, "financial_records")
            .select(", ".join(select_cols))
            .eq("institution_id", institution_id)
            .eq("is_current_version", True)
            .is_("deleted_at", "null")
        )
        if year:
            query = query.eq("year", year)
        return query.order("year").execute().data

    # supabase-py's Client is synchronous (blocking httpx under the hood).
    # Calling .execute() directly here would block the whole asyncio event
    # loop for the request's round-trip — harmless for one request, but the
    # health-scores batch fires dozens of these concurrently, and a blocked
    # event loop can't service any other request (including the descriptive
    # dashboard's own queries) until each one finishes in turn.
    records = await asyncio.to_thread(_fetch_records)

    if not records:
        return _default_score(institution_id, entity_type)

    df = pd.DataFrame(records)
    score = _score_from_records(df, receipt_cols, expense_cols, consumable_col, entity_type, timeframe)
    if score is None:
        return _default_score(institution_id, entity_type)

    score.entity_class = entity_class
    # Only the unscoped ("full history") request represents this
    # institution's actual current standing — a year/timeframe-narrowed
    # score is a what-if slice for the dashboard, not a new data point for
    # the historical snapshot trend.
    if year is None and (timeframe is None or timeframe == "all"):
        _schedule_snapshot_write(institution_id, entity_type, score)
    return score


async def get_health_scores_batch(
    entities: list[dict],
    year: Optional[int] = None,
    timeframe: Optional[str] = None,
) -> list[HealthScoreResponse]:
    """Batched variant of get_health_score for dashboards scoring every
    institution at once. get_health_score does one round trip per
    institution; firing 90+ of those concurrently doesn't actually run
    concurrently in any way that helps — each round trip still costs its own
    network latency, and with enough of them in flight at once, the slowest
    stragglers land well past the gateway's request timeout. Fetching each
    group's records in a single query turns 90+ round trips into one per
    source (AWS for parishes, one Supabase query per entity type for the
    rest)."""
    # Same duplicate-concurrent-request risk as financial-trend/parish-cluster
    # (see _singleflight.py) — e.g. multiple tabs on the same filter state all
    # requesting the identical entity set at once. Key on a canonical
    # (sorted) representation of the request so distinct scopes never share
    # a cache entry.
    key_entities = ",".join(
        sorted(f"{e['institution_id']}:{e['entity_type']}:{e.get('entity_class')}" for e in entities)
    )
    key = f"health_scores_batch:{year}:{timeframe}:{key_entities}"
    return await _singleflight.coalesce(key, lambda: _get_health_scores_batch_uncached(entities, year, timeframe))


async def _get_health_scores_batch_uncached(
    entities: list[dict],
    year: Optional[int] = None,
    timeframe: Optional[str] = None,
) -> list[HealthScoreResponse]:
    by_type: dict[str, list[dict]] = {}
    for e in entities:
        by_type.setdefault(e["entity_type"], []).append(e)

    # Parishes: AWS is authoritative (see get_health_score) — one query for
    # every requested parish instead of one per institution.
    aws_totals_by_institution: dict[str, pd.DataFrame] = {}
    parish_group = by_type.pop("parish", None)
    if parish_group and analytics_db.enabled():
        ids = [e["institution_id"] for e in parish_group]
        df = await asyncio.to_thread(_fetch_aws_totals, ids, year)
        if not df.empty:
            for institution_id, group_df in df.groupby("institution_id"):
                aws_totals_by_institution[institution_id] = group_df
    elif parish_group:
        by_type["parish"] = parish_group  # AWS unavailable — Supabase fallback below

    def _fetch_group(entity_type: str, ids: list[str]) -> list[dict]:
        schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]
        all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
        seen: set[str] = set()
        select_cols: list[str] = []
        for c in all_cols:
            if c not in seen:
                select_cols.append(c)
                seen.add(c)
        query = (
            get_table(schema, "financial_records")
            .select(", ".join(select_cols))
            .in_("institution_id", ids)
            .eq("is_current_version", True)
            .is_("deleted_at", "null")
        )
        if year:
            query = query.eq("year", year)
        return query.order("year").execute().data or []

    records_by_institution: dict[str, list[dict]] = {}
    for entity_type, group in by_type.items():
        if entity_type not in _SCHEMA_MAP:
            continue
        ids = [e["institution_id"] for e in group]
        rows = await asyncio.to_thread(_fetch_group, entity_type, ids)
        for row in rows:
            records_by_institution.setdefault(row["institution_id"], []).append(row)

    results: list[HealthScoreResponse] = []
    for e in entities:
        institution_id = e["institution_id"]
        entity_type = e["entity_type"]
        if entity_type not in _SCHEMA_MAP:
            results.append(_default_score(institution_id, entity_type))
            continue

        if entity_type == "parish" and institution_id in aws_totals_by_institution:
            score = _score_from_totals(aws_totals_by_institution[institution_id], entity_type, timeframe)
        elif entity_type == "parish" and analytics_db.enabled():
            # Requested but had no AWS rows at all — genuinely nothing to
            # score, not a reason to fall back to Supabase's empty columns.
            score = None
        else:
            rows = records_by_institution.get(institution_id, [])
            if not rows:
                results.append(_default_score(institution_id, entity_type))
                continue
            _, receipt_cols, expense_cols, consumable_col = _SCHEMA_MAP[entity_type]
            df = pd.DataFrame(rows)
            score = _score_from_records(df, receipt_cols, expense_cols, consumable_col, entity_type, timeframe)

        if score is None:
            results.append(_default_score(institution_id, entity_type))
            continue

        score.entity_class = e.get("entity_class")
        if year is None and (timeframe is None or timeframe == "all"):
            _schedule_snapshot_write(institution_id, entity_type, score)
        results.append(score)

    return results


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
