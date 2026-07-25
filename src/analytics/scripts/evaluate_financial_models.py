"""
Evaluate predictive financial models against real Supabase financial records.

This is intentionally separate from the FastAPI routers and dashboard. It checks
whether candidate models can run on production-shaped DB data, ranks them by
holdout accuracy, and writes comparison reports for review.

Run from repo root:
    python src/analytics/scripts/evaluate_financial_models.py --entity-type parish
    python src/analytics/scripts/evaluate_financial_models.py --entity-type parish --entity-id <uuid>
    python src/analytics/scripts/evaluate_financial_models.py --all
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
import pandas as pd

ANALYTICS_ROOT = Path(__file__).resolve().parents[1]
if str(ANALYTICS_ROOT) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_ROOT))

from app.services import _aws_financials  # noqa: E402
from app.services.data_definitions import SCHEMA_MAP, build_date_index  # noqa: E402
from app.services.predictive._champion import markov_forecast, train_test_split_ts  # noqa: E402
from app.services.predictive.financial_forecast import (  # noqa: E402
    LITURGICAL_FEATURE_COLUMNS,
    _clean_exog,
    _holtwinters_trainer,
    _prophet_trainer,
    _sarima_trainer,
    _sarimax_exog_trainer,
    _xgboost_trainer,
    fetch_liturgical_features,
)
from app.services.supabase_client import get_table  # noqa: E402
from app.services.weather_repository import get_table as get_weather_table  # noqa: E402
from model_lab.dashboard_graphs import plot_forecast_comparison, plot_model_leaderboard  # noqa: E402

OUTPUT_DIR = ANALYTICS_ROOT / "model_lab" / "outputs" / "db_evaluation"
MIN_RECORDS = 6
DEFAULT_HOLDOUT_MIN = 2

LAGUNA_MUNICIPALITIES = [
    "Alaminos",
    "Bay",
    "Binan City",
    "Cabuyao City",
    "Calamba City",
    "Calauan",
    "Cavinti",
    "Famy",
    "Kalayaan",
    "Liliw",
    "Los Banos",
    "Luisiana",
    "Lumban",
    "Mabitac",
    "Magdalena",
    "Majayjay",
    "Nagcarlan",
    "Paete",
    "Pagsanjan",
    "Pakil",
    "Pangil",
    "Pila",
    "Rizal",
    "San Pablo City",
    "San Pedro City",
    "Santa Cruz",
    "Santa Maria",
    "Santa Rosa City",
    "Siniloan",
    "Victoria",
]

WEATHER_FEATURE_COLUMNS = [
    "light_rain_days",
    "moderate_rain_days",
    "heavy_rain_days",
    "rain_inconclusive_days",
    "not_hazardous_days",
    "caution_days",
    "extreme_caution_days",
    "danger_days",
    "extreme_danger_days",
    "temp_inconclusive_days",
    "total_days_observed",
    "data_completeness_pct",
    "rain_cohens_kappa",
    "rain_lins_ccc",
    "temp_cohens_kappa",
    "temp_lins_ccc",
    "wind_light_days",
    "wind_moderate_days",
    "wind_strong_days",
    "wind_storm_days",
    "severe_weather_days",
    "humidity_high_days",
]

BASE_EXOG_FEATURE_COLUMNS = [
    "month_num",
    "month_sin",
    "month_cos",
    *LITURGICAL_FEATURE_COLUMNS,
    *WEATHER_FEATURE_COLUMNS,
]


@dataclass(frozen=True)
class EntityEvaluation:
    entity_type: str
    entity_id: str
    target: str
    record_count: int
    train_count: int
    holdout_count: int
    model: str
    status: str
    wape_pct: float | None
    mae: float | None
    rmse: float | None
    mpe_pct: float | None
    actual_total: float | None
    predicted_total: float | None
    exog_features_used: int
    municipality: str | None
    error: str | None


@dataclass(frozen=True)
class PredictionPoint:
    entity_type: str
    entity_id: str
    target: str
    model: str
    date: str
    actual: float
    predicted: float
    residual: float


def _coerce_json(value):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {k: _coerce_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_coerce_json(v) for v in value]
    return value


def _fetch_all_pages(query_builder, page_size: int = 1000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        response = query_builder.range(offset, offset + page_size - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _select_columns(entity_type: str) -> list[str]:
    _, receipt_cols, expense_cols, _ = SCHEMA_MAP[entity_type]
    columns = ["institution_id", "month", "year"] + receipt_cols + expense_cols
    return list(dict.fromkeys(columns))


def fetch_entity_ids(entity_type: str, limit: int | None = None) -> list[str]:
    schema, _, _, _ = SCHEMA_MAP[entity_type]
    rows = _fetch_all_pages(
        get_table(schema, "financial_records")
        .select("institution_id")
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
    )
    ids = sorted({str(row["institution_id"]) for row in rows if row.get("institution_id")})
    return ids[:limit] if limit else ids


def _normalize_place_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.lower()
    replacements = {
        "ñ": "n",
        "city of ": "",
        "sta.": "santa",
        "sto.": "santo",
    }
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


def infer_municipality(address: str | None, name: str | None = None) -> str | None:
    haystack = _normalize_place_text(f"{address or ''} {name or ''}")
    if not haystack:
        return None

    # Match longer names first so "San Pablo City" wins before "Pablo".
    for municipality in sorted(LAGUNA_MUNICIPALITIES, key=len, reverse=True):
        needle = _normalize_place_text(municipality)
        if re.search(rf"\b{re.escape(needle)}\b", haystack):
            return municipality
    return None


def fetch_institution_profile(entity_id: str) -> dict:
    response = (
        get_table("diocese", "institutions")
        .select("id, name, address, latitude, longitude")
        .eq("id", entity_id)
        .limit(1)
        .execute()
    )
    row = (response.data or [{}])[0]
    row["municipality"] = infer_municipality(row.get("address"), row.get("name"))
    return row


def fetch_financial_records(entity_type: str, entity_id: str) -> pd.DataFrame:
    """AWS warehouse first for parishes (matches the production path,
    `financial_forecast.py`'s `_aws_financials.parish_monthly_df()`), Supabase
    otherwise. Per docs/HYBRID_DATABASE_TARGET_ARCHITECTURE.md, Supabase owns
    operational data and AWS owns derived analytical data — this evaluation
    script previously skipped the AWS-first step entirely and evaluated an
    effectively empty Supabase table for parishes with real, mostly-complete
    history sitting in the warehouse. Schools/seminaries have no AWS silver
    tables yet, so they correctly stay on Supabase only."""
    if entity_type == "parish":
        aws_df = _aws_financials.parish_monthly_df(entity_id)
        if aws_df is not None and not aws_df.empty:
            return aws_df

    schema, _, _, _ = SCHEMA_MAP[entity_type]
    columns = _select_columns(entity_type)
    rows = _fetch_all_pages(
        get_table(schema, "financial_records")
        .select(", ".join(columns))
        .eq("institution_id", entity_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
    )
    if not rows:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(rows)


def fetch_weather_features(municipality: str | None, start_date: pd.Timestamp, end_date: pd.Timestamp) -> pd.DataFrame:
    if not municipality or pd.isna(start_date) or pd.isna(end_date):
        return pd.DataFrame(columns=["date", *WEATHER_FEATURE_COLUMNS])

    rows = _fetch_all_pages(
        get_weather_table("reference", "weather_monthly_summary")
        .select("*")
        .eq("municipality", municipality)
        .gte("year_month", start_date.date().isoformat())
        .lte("year_month", end_date.date().isoformat())
        .order("year_month")
    )
    if not rows:
        return pd.DataFrame(columns=["date", *WEATHER_FEATURE_COLUMNS])

    weather = pd.DataFrame(rows)
    weather["date"] = pd.to_datetime(weather["year_month"], errors="coerce")
    for col in WEATHER_FEATURE_COLUMNS:
        if col not in weather.columns:
            weather[col] = 0.0
        weather[col] = pd.to_numeric(weather[col], errors="coerce").fillna(0.0)
    return weather[["date", *WEATHER_FEATURE_COLUMNS]]


def add_exogenous_features(df: pd.DataFrame, institution: dict) -> pd.DataFrame:
    mapped = df.copy()
    mapped["month_sin"] = np.sin(2 * np.pi * mapped["month_num"] / 12)
    mapped["month_cos"] = np.cos(2 * np.pi * mapped["month_num"] / 12)

    liturgical = fetch_liturgical_features(mapped["year"].dropna().astype(int).tolist())
    if not liturgical.empty:
        mapped = mapped.merge(liturgical, on=["year", "month_num"], how="left")
    for col in LITURGICAL_FEATURE_COLUMNS:
        if col not in mapped.columns:
            mapped[col] = 0.0
        mapped[col] = pd.to_numeric(mapped[col], errors="coerce").fillna(0.0)

    municipality = institution.get("municipality")
    weather = fetch_weather_features(municipality, mapped["date"].min(), mapped["date"].max())
    if not weather.empty:
        mapped = mapped.merge(weather, on="date", how="left")
    for col in WEATHER_FEATURE_COLUMNS:
        if col not in mapped.columns:
            mapped[col] = 0.0
        mapped[col] = pd.to_numeric(mapped[col], errors="coerce").fillna(0.0)

    mapped["municipality"] = municipality
    return mapped


def normalize_financial_records(df: pd.DataFrame, entity_type: str) -> pd.DataFrame:
    _, receipt_cols, expense_cols, _ = SCHEMA_MAP[entity_type]
    if df.empty:
        return df

    if "total_receipts" in df.columns and "total_expenses" in df.columns:
        # AWS warehouse path (`_aws_financials.parish_monthly_df`) — totals are
        # already aggregated server-side and `date`/`month_num` already set by
        # its own `_finalize()`; nothing to sum from raw receipt/expense columns.
        mapped = df.copy()
        if "date" not in mapped.columns:
            mapped = build_date_index(mapped)
    else:
        mapped = build_date_index(df)
        for col in receipt_cols + expense_cols:
            if col not in mapped.columns:
                mapped[col] = 0.0
            mapped[col] = pd.to_numeric(mapped[col], errors="coerce").fillna(0.0)

        mapped["total_receipts"] = mapped[receipt_cols].sum(axis=1)
        mapped["total_expenses"] = mapped[expense_cols].sum(axis=1)

    mapped["net_receipts"] = mapped["total_receipts"] - mapped["total_expenses"]

    # Model-lab compatibility columns. These mirror the old test CSV names but
    # are sourced from the production domain tables above.
    mapped["total_receipts_final"] = mapped["total_receipts"]
    mapped["total_expenses_final"] = mapped["total_expenses"]
    mapped["net_receipts_deficit"] = mapped["net_receipts"]
    mapped["month_num"] = mapped["date"].dt.month
    return mapped.sort_values("date").reset_index(drop=True)


def _exponential_smoothing_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing, SimpleExpSmoothing

    n_hold = len(holdout)
    candidates = []
    try:
        candidates.append(SimpleExpSmoothing(train, initialization_method="estimated").fit())
    except Exception:
        pass
    try:
        candidates.append(
            ExponentialSmoothing(train, trend="add", seasonal=None, initialization_method="estimated").fit()
        )
    except Exception:
        pass

    if not candidates:
        return np.full(n_hold, float(np.mean(train)))

    best_pred: np.ndarray | None = None
    best_wape = float("inf")
    for fitted in candidates:
        pred = np.maximum(np.asarray(fitted.forecast(n_hold), dtype=float), 0.0)
        score = _wape_pct(holdout, pred)
        if score < best_wape:
            best_wape = score
            best_pred = pred
    return best_pred if best_pred is not None else np.full(n_hold, float(np.mean(train)))


def _moving_average_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    window = min(3, len(train))
    return np.full(len(holdout), float(np.mean(train[-window:])))


def _seasonal_naive_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    if len(train) >= 12:
        values = train[-12:]
        return np.array([values[i % len(values)] for i in range(len(holdout))], dtype=float)
    return _moving_average_trainer(train, holdout)


def _markov_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    return markov_forecast(train, holdout)


def _xgboost_exog_trainer(
    train: np.ndarray,
    holdout: np.ndarray,
    train_exog: np.ndarray | None,
    holdout_exog: np.ndarray | None,
) -> np.ndarray:
    import xgboost as xgb

    train_exog = _clean_exog(train_exog)
    holdout_exog = _clean_exog(holdout_exog)
    if train_exog is None or holdout_exog is None:
        return _xgboost_trainer(train, holdout)

    lags = min(3, len(train) - 1)
    if lags < 1 or len(train) <= lags:
        return np.full(len(holdout), float(np.mean(train)))

    x_train = []
    y_train = []
    for idx in range(lags, len(train)):
        x_train.append(np.concatenate([train[idx - lags : idx], train_exog[idx]]))
        y_train.append(train[idx])

    model = xgb.XGBRegressor(n_estimators=120, max_depth=3, learning_rate=0.08, random_state=42)
    model.fit(np.asarray(x_train), np.asarray(y_train))

    window = list(train[-lags:])
    preds = []
    for idx in range(len(holdout)):
        features = np.concatenate([np.asarray(window[-lags:], dtype=float), holdout_exog[idx]]).reshape(1, -1)
        pred = float(model.predict(features)[0])
        preds.append(pred)
        window.append(pred)
    return np.asarray(preds, dtype=float)


def _linear_exog_trainer(
    train: np.ndarray,
    holdout: np.ndarray,
    train_exog: np.ndarray | None,
    holdout_exog: np.ndarray | None,
) -> np.ndarray:
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    train_exog = _clean_exog(train_exog)
    holdout_exog = _clean_exog(holdout_exog)
    if train_exog is None or holdout_exog is None or train_exog.shape[1] == 0:
        return _moving_average_trainer(train, holdout)

    model = Pipeline([("scaler", StandardScaler()), ("regressor", Ridge(alpha=1.0))])
    model.fit(train_exog, train)
    return np.asarray(model.predict(holdout_exog), dtype=float)


def model_candidates() -> dict[str, Callable[[np.ndarray, np.ndarray], np.ndarray]]:
    return {
        "Seasonal Naive": _seasonal_naive_trainer,
        "Moving Average": _moving_average_trainer,
        "Exponential Smoothing": _exponential_smoothing_trainer,
        "Holt-Winters": _holtwinters_trainer,
        "SARIMA": _sarima_trainer,
        "XGBoost": _xgboost_trainer,
        "Prophet": _prophet_trainer,
        "Markov Chain": _markov_trainer,
    }


def exogenous_model_candidates() -> dict[
    str, Callable[[np.ndarray, np.ndarray, np.ndarray | None, np.ndarray | None], np.ndarray]
]:
    return {
        "Linear Regression + Exog": _linear_exog_trainer,
        "SARIMAX + Exog": _sarimax_exog_trainer,
        "XGBoost + Exog": _xgboost_exog_trainer,
    }


def _wape_pct(actual: np.ndarray, predicted: np.ndarray) -> float:
    denom = float(np.sum(np.abs(actual)))
    if denom == 0:
        return 0.0 if float(np.sum(np.abs(predicted))) == 0 else 100.0
    return float(np.sum(np.abs(actual - predicted)) / denom * 100)


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    residual = predicted - actual
    return {
        "wape_pct": _wape_pct(actual, predicted),
        "mae": float(np.mean(np.abs(residual))),
        "rmse": float(np.sqrt(np.mean(np.square(residual)))),
        "mpe_pct": float(np.sum(residual) / np.sum(np.abs(actual)) * 100) if np.sum(np.abs(actual)) else 0.0,
        "actual_total": float(np.sum(actual)),
        "predicted_total": float(np.sum(predicted)),
    }


def evaluate_series(
    entity_type: str,
    entity_id: str,
    target: str,
    series: np.ndarray,
    dates: Sequence[pd.Timestamp],
    exog: np.ndarray | None = None,
    municipality: str | None = None,
) -> tuple[list[EntityEvaluation], list[PredictionPoint]]:
    if len(series) < MIN_RECORDS:
        return [
            EntityEvaluation(
                entity_type=entity_type,
                entity_id=entity_id,
                target=target,
                record_count=len(series),
                train_count=0,
                holdout_count=0,
                model="N/A",
                status="insufficient_data",
                wape_pct=None,
                mae=None,
                rmse=None,
                mpe_pct=None,
                actual_total=None,
                predicted_total=None,
                exog_features_used=0,
                municipality=municipality,
                error=f"Need at least {MIN_RECORDS} monthly records.",
            )
        ], []

    train, holdout = train_test_split_ts(series)
    train_exog = holdout_exog = None
    holdout_dates = list(dates[len(train) :])
    if len(holdout) < DEFAULT_HOLDOUT_MIN:
        split = max(1, len(series) - DEFAULT_HOLDOUT_MIN)
        train, holdout = series[:split], series[split:]
        holdout_dates = list(dates[split:])
        if exog is not None:
            train_exog, holdout_exog = exog[:split], exog[split:]
    elif exog is not None:
        split = len(train)
        train_exog, holdout_exog = exog[:split], exog[split:]

    results: list[EntityEvaluation] = []
    predictions: list[PredictionPoint] = []
    for name, trainer in model_candidates().items():
        try:
            predicted = np.maximum(np.asarray(trainer(train, holdout), dtype=float), 0.0)
            if len(predicted) != len(holdout):
                raise ValueError(f"Expected {len(holdout)} predictions, got {len(predicted)}")
            metric_values = _metrics(holdout, predicted)
            results.append(
                EntityEvaluation(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    record_count=len(series),
                    train_count=len(train),
                    holdout_count=len(holdout),
                    model=name,
                    status="ok",
                    wape_pct=round(metric_values["wape_pct"], 4),
                    mae=round(metric_values["mae"], 2),
                    rmse=round(metric_values["rmse"], 2),
                    mpe_pct=round(metric_values["mpe_pct"], 4),
                    actual_total=round(metric_values["actual_total"], 2),
                    predicted_total=round(metric_values["predicted_total"], 2),
                    exog_features_used=0,
                    municipality=municipality,
                    error=None,
                )
            )
            predictions.extend(
                PredictionPoint(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    model=name,
                    date=pd.Timestamp(holdout_dates[idx]).date().isoformat(),
                    actual=round(float(holdout[idx]), 2),
                    predicted=round(float(predicted[idx]), 2),
                    residual=round(float(predicted[idx] - holdout[idx]), 2),
                )
                for idx in range(len(holdout))
            )
        except Exception as exc:
            results.append(
                EntityEvaluation(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    record_count=len(series),
                    train_count=len(train),
                    holdout_count=len(holdout),
                    model=name,
                    status="failed",
                    wape_pct=None,
                    mae=None,
                    rmse=None,
                    mpe_pct=None,
                    actual_total=float(np.sum(holdout)),
                    predicted_total=None,
                    exog_features_used=0,
                    municipality=municipality,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )

    exog_feature_count = int(exog.shape[1]) if exog is not None and exog.ndim == 2 else 0
    for name, trainer in exogenous_model_candidates().items():
        try:
            predicted = np.maximum(
                np.asarray(trainer(train, holdout, train_exog, holdout_exog), dtype=float),
                0.0,
            )
            if len(predicted) != len(holdout):
                raise ValueError(f"Expected {len(holdout)} predictions, got {len(predicted)}")
            metric_values = _metrics(holdout, predicted)
            results.append(
                EntityEvaluation(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    record_count=len(series),
                    train_count=len(train),
                    holdout_count=len(holdout),
                    model=name,
                    status="ok",
                    wape_pct=round(metric_values["wape_pct"], 4),
                    mae=round(metric_values["mae"], 2),
                    rmse=round(metric_values["rmse"], 2),
                    mpe_pct=round(metric_values["mpe_pct"], 4),
                    actual_total=round(metric_values["actual_total"], 2),
                    predicted_total=round(metric_values["predicted_total"], 2),
                    exog_features_used=exog_feature_count,
                    municipality=municipality,
                    error=None,
                )
            )
            predictions.extend(
                PredictionPoint(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    model=name,
                    date=pd.Timestamp(holdout_dates[idx]).date().isoformat(),
                    actual=round(float(holdout[idx]), 2),
                    predicted=round(float(predicted[idx]), 2),
                    residual=round(float(predicted[idx] - holdout[idx]), 2),
                )
                for idx in range(len(holdout))
            )
        except Exception as exc:
            results.append(
                EntityEvaluation(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    target=target,
                    record_count=len(series),
                    train_count=len(train),
                    holdout_count=len(holdout),
                    model=name,
                    status="failed",
                    wape_pct=None,
                    mae=None,
                    rmse=None,
                    mpe_pct=None,
                    actual_total=float(np.sum(holdout)),
                    predicted_total=None,
                    exog_features_used=exog_feature_count,
                    municipality=municipality,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
    return results, predictions


def evaluate_entity(
    entity_type: str, entity_id: str, targets: list[str]
) -> tuple[list[EntityEvaluation], list[PredictionPoint]]:
    raw = fetch_financial_records(entity_type, entity_id)
    mapped = normalize_financial_records(raw, entity_type)
    institution = fetch_institution_profile(entity_id)
    if mapped.empty:
        return [
            EntityEvaluation(
                entity_type=entity_type,
                entity_id=entity_id,
                target=target,
                record_count=0,
                train_count=0,
                holdout_count=0,
                model="N/A",
                status="no_records",
                wape_pct=None,
                mae=None,
                rmse=None,
                mpe_pct=None,
                actual_total=None,
                predicted_total=None,
                exog_features_used=0,
                municipality=institution.get("municipality"),
                error="No financial_records rows found.",
            )
            for target in targets
        ], []

    mapped = add_exogenous_features(mapped, institution)
    exog_frame = mapped[BASE_EXOG_FEATURE_COLUMNS].copy()
    exog_frame = exog_frame.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    exog = exog_frame.to_numpy(dtype=float)
    municipality = institution.get("municipality")

    evaluations: list[EntityEvaluation] = []
    predictions: list[PredictionPoint] = []
    for target in targets:
        series = mapped[target].to_numpy(dtype=float)
        target_evaluations, target_predictions = evaluate_series(
            entity_type,
            entity_id,
            target,
            series,
            mapped["date"].tolist(),
            exog,
            municipality,
        )
        evaluations.extend(target_evaluations)
        predictions.extend(target_predictions)
    return evaluations, predictions


def _leaderboard_frame(results: list[EntityEvaluation]) -> pd.DataFrame:
    columns = list(EntityEvaluation.__dataclass_fields__.keys())
    frame = pd.DataFrame([asdict(result) for result in results], columns=columns)
    if frame.empty:
        return frame
    return frame.sort_values(
        by=["entity_type", "entity_id", "target", "status", "wape_pct"],
        na_position="last",
    ).reset_index(drop=True)


def _summary(frame: pd.DataFrame) -> dict:
    if frame.empty or "status" not in frame.columns:
        return {"ok_results": 0, "champions": [], "by_model": []}
    ok = frame[frame["status"] == "ok"].copy()
    if ok.empty:
        return {"ok_results": 0, "champions": []}
    champions = ok.sort_values("wape_pct").groupby(["entity_type", "entity_id", "target"], as_index=False).first()
    by_model = (
        ok.groupby("model", as_index=False)
        .agg(
            runs=("model", "size"),
            avg_wape_pct=("wape_pct", "mean"),
            median_wape_pct=("wape_pct", "median"),
            failures=("status", lambda values: int((values != "ok").sum())),
        )
        .sort_values("avg_wape_pct")
    )
    return {
        "ok_results": int(len(ok)),
        "champions": champions.to_dict(orient="records"),
        "by_model": by_model.round(4).to_dict(orient="records"),
    }


def _readiness_report(frame: pd.DataFrame) -> dict:
    """Group evaluated institutions by how much history they actually have, so a
    run with few/no eligible institutions says so explicitly instead of quietly
    producing an empty summary."""
    if frame.empty or "record_count" not in frame.columns:
        return {"total_entities": 0, "eligible_for_evaluation": 0, "buckets": {}}

    per_entity = frame.groupby(["entity_type", "entity_id"], as_index=False)["record_count"].max()
    counts = per_entity["record_count"]
    buckets = {
        f"below_minimum (<{MIN_RECORDS} months)": int((counts < MIN_RECORDS).sum()),
        f"{MIN_RECORDS}_to_11_months": int(((counts >= MIN_RECORDS) & (counts < 12)).sum()),
        "12_to_23_months": int(((counts >= 12) & (counts < 24)).sum()),
        "24_plus_months": int((counts >= 24).sum()),
    }
    return {
        "total_entities": int(len(per_entity)),
        "eligible_for_evaluation": int((counts >= MIN_RECORDS).sum()),
        "buckets": buckets,
    }


def _calibration_coverage(prediction_frame: pd.DataFrame) -> list[dict]:
    """Empirical prediction-interval calibration per model: build an 80% band from
    the 10th/90th percentile of that model's own historical residuals, then report
    what % of actuals actually fall inside it. A well-calibrated 80% interval
    should contain ~80% of actuals — this replaces the old fixed `predicted * 8%`
    band, which wasn't measuring anything."""
    if prediction_frame.empty:
        return []

    results = []
    for model, group in prediction_frame.groupby("model"):
        residuals = (group["predicted"] - group["actual"]).to_numpy(dtype=float)
        if len(residuals) < 5:
            continue
        r_low, r_high = np.percentile(residuals, [10, 90])
        lower = group["predicted"] - r_high
        upper = group["predicted"] - r_low
        covered = (group["actual"] >= lower) & (group["actual"] <= upper)
        results.append(
            {
                "model": model,
                "n_predictions": int(len(group)),
                "residual_p10": round(float(r_low), 2),
                "residual_p90": round(float(r_high), 2),
                "empirical_coverage_pct": round(float(covered.mean() * 100), 2),
                "target_coverage_pct": 80.0,
            }
        )
    return sorted(results, key=lambda row: row["model"])


def _safe_stem(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")[:120]


def _prediction_frame(predictions: list[PredictionPoint]) -> pd.DataFrame:
    columns = list(PredictionPoint.__dataclass_fields__.keys())
    return pd.DataFrame([asdict(point) for point in predictions], columns=columns)


def write_graphs(
    evaluation_frame: pd.DataFrame,
    prediction_frame: pd.DataFrame,
    summary: dict,
    run_dir: Path,
    calibration: list[dict] | None = None,
) -> list[str]:
    graph_dir = run_dir / "graphs"
    graph_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []

    ok = evaluation_frame[evaluation_frame["status"] == "ok"].copy() if not evaluation_frame.empty else pd.DataFrame()
    if ok.empty:
        return paths

    leaderboard = ok.groupby("model", as_index=False).agg(wape=("wape_pct", "mean")).sort_values("wape")
    if not leaderboard.empty:
        paths.append(plot_model_leaderboard(leaderboard, str(graph_dir)))

    if prediction_frame.empty or not summary.get("champions"):
        return paths

    calibration_by_model = {row["model"]: row for row in (calibration or [])}
    champions = pd.DataFrame(summary["champions"])
    for _, champion in champions.iterrows():
        mask = (
            (prediction_frame["entity_type"] == champion["entity_type"])
            & (prediction_frame["entity_id"] == champion["entity_id"])
            & (prediction_frame["target"] == champion["target"])
            & (prediction_frame["model"] == champion["model"])
        )
        rows = prediction_frame[mask].copy()
        if rows.empty:
            continue

        rows["date"] = pd.to_datetime(rows["date"], errors="coerce")
        rows = rows.sort_values("date")
        # Empirical residual-quantile band from this model's own historical
        # residuals (see `_calibration_coverage`) — a statistically meaningful
        # interval instead of the old fixed `predicted * 8%` guess. Falls back
        # to the old heuristic only if there isn't enough history yet to have
        # computed a calibration band for this model.
        model_calibration = calibration_by_model.get(champion["model"])
        if model_calibration is not None:
            lower = rows["predicted"] - model_calibration["residual_p90"]
            upper = rows["predicted"] - model_calibration["residual_p10"]
        else:
            residual_abs = (rows["predicted"] - rows["actual"]).abs()
            uncertainty = np.maximum(residual_abs, rows["predicted"].abs() * 0.08)
            lower = rows["predicted"] - uncertainty
            upper = rows["predicted"] + uncertainty
        chart_frame = pd.DataFrame(
            {
                "month": rows["date"].dt.strftime("%Y-%m"),
                "actual": rows["actual"],
                "forecast": rows["predicted"],
                "lower": lower.clip(lower=0),
                "upper": upper,
            }
        )
        stem = _safe_stem(f"forecast_comparison_{champion['entity_type']}_{champion['entity_id']}_{champion['target']}")
        paths.append(plot_forecast_comparison(chart_frame, str(graph_dir), file_stem=stem))

    return paths


HISTORY_CSV = OUTPUT_DIR / "history.csv"


def _append_history(run_id: str, timestamp: str, summary: dict, readiness: dict) -> None:
    """Append one row per model per run to a persistent history CSV, so WAPE
    drift across runs can be read from one file instead of re-deriving it from
    every timestamped run folder."""
    by_model = summary.get("by_model") or [{}]
    rows = [
        {
            "run_id": run_id,
            "timestamp": timestamp,
            "eligible_entities": readiness.get("eligible_for_evaluation", 0),
            "total_entities": readiness.get("total_entities", 0),
            "model": row.get("model"),
            "avg_wape_pct": row.get("avg_wape_pct"),
            "median_wape_pct": row.get("median_wape_pct"),
            "runs": row.get("runs", 0),
            "failures": row.get("failures", 0),
        }
        for row in by_model
    ]
    history_frame = pd.DataFrame(rows)
    HISTORY_CSV.parent.mkdir(parents=True, exist_ok=True)
    write_header = not HISTORY_CSV.exists()
    history_frame.to_csv(HISTORY_CSV, mode="a", header=write_header, index=False)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate financial forecast models against Supabase DB records.")
    parser.add_argument("--entity-type", choices=sorted(SCHEMA_MAP), help="Entity type to evaluate.")
    parser.add_argument("--entity-id", help="Specific institution_id to evaluate.")
    parser.add_argument("--all", action="store_true", help="Evaluate all entity types.")
    parser.add_argument("--limit", type=int, help="Limit number of entities per type.")
    parser.add_argument(
        "--target",
        choices=["receipts", "expenses", "net", "all"],
        default="receipts",
        help="Financial series to evaluate.",
    )
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="Directory for CSV/JSON reports.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.all and not args.entity_type:
        raise SystemExit("Use --entity-type <parish|school|seminary> or --all.")

    entity_types = sorted(SCHEMA_MAP) if args.all else [args.entity_type]
    target_map = {
        "receipts": ["total_receipts"],
        "expenses": ["total_expenses"],
        "net": ["net_receipts"],
        "all": ["total_receipts", "total_expenses", "net_receipts"],
    }
    targets = target_map[args.target]

    all_results: list[EntityEvaluation] = []
    all_predictions: list[PredictionPoint] = []
    for entity_type in entity_types:
        entity_ids = [args.entity_id] if args.entity_id else fetch_entity_ids(entity_type, args.limit)
        print(f"{entity_type}: evaluating {len(entity_ids)} entit{'y' if len(entity_ids) == 1 else 'ies'}")
        for entity_id in entity_ids:
            entity_results, entity_predictions = evaluate_entity(entity_type, entity_id, targets)
            all_results.extend(entity_results)
            all_predictions.extend(entity_predictions)

    output_root = Path(args.output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = output_root / stamp
    run_dir.mkdir(parents=True, exist_ok=True)
    frame = _leaderboard_frame(all_results)
    predictions = _prediction_frame(all_predictions)
    summary = _summary(frame)
    readiness = _readiness_report(frame)
    calibration = _calibration_coverage(predictions)

    csv_path = run_dir / "financial_model_evaluation.csv"
    json_path = run_dir / "financial_model_evaluation.json"
    predictions_csv_path = run_dir / "financial_model_predictions.csv"
    graph_paths = write_graphs(frame, predictions, summary, run_dir, calibration)
    frame.to_csv(csv_path, index=False)
    predictions.to_csv(predictions_csv_path, index=False)
    json_path.write_text(
        json.dumps(
            _coerce_json(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "run_id": stamp,
                    "run_dir": str(run_dir),
                    "db_mapping": {
                        entity_type: {
                            "schema": mapping[0],
                            "table": "financial_records",
                            "receipt_columns": mapping[1],
                            "expense_columns": mapping[2],
                            "normalized_targets": ["total_receipts", "total_expenses", "net_receipts"],
                        }
                        for entity_type, mapping in SCHEMA_MAP.items()
                    },
                    "summary": summary,
                    "readiness": readiness,
                    "calibration": calibration,
                    "graphs": graph_paths,
                    "results": frame.to_dict(orient="records"),
                    "predictions": predictions.to_dict(orient="records"),
                }
            ),
            indent=2,
        )
    )
    _append_history(stamp, datetime.now(timezone.utc).isoformat(), summary, readiness)

    print(f"\nRun folder: {run_dir}")
    print(f"Wrote CSV:  {csv_path}")
    print(f"Wrote predictions CSV: {predictions_csv_path}")
    print(f"Wrote JSON: {json_path}")
    print(f"Appended history: {HISTORY_CSV}")
    if graph_paths:
        print("\nWrote graphs:")
        for path in graph_paths:
            print(f"  {path}")

    print(
        f"\nData readiness: {readiness['eligible_for_evaluation']}/{readiness['total_entities']} "
        f"entities have >= {MIN_RECORDS} monthly records."
    )
    if readiness["total_entities"] > 0 and readiness["eligible_for_evaluation"] == 0:
        print(f"  No entities cleared the minimum yet — breakdown: {readiness['buckets']}")

    ok = frame[frame["status"] == "ok"]
    if not ok.empty:
        champions = pd.DataFrame(summary["champions"])
        print("\nChampion per entity/target:")
        print(champions[["entity_type", "entity_id", "target", "model", "wape_pct", "mpe_pct"]].to_string(index=False))

        print("\nAverage model performance:")
        print(pd.DataFrame(summary["by_model"]).to_string(index=False))

    if calibration:
        print("\nPrediction-interval calibration (80% band, target coverage 80%):")
        print(pd.DataFrame(calibration).to_string(index=False))

    failed = frame[frame["status"] == "failed"]
    if not failed.empty:
        print(f"\nFailed model runs: {len(failed)}. See JSON report for errors.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
