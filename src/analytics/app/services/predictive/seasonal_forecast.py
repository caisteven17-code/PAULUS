"""
Predictive: Seasonality Forecast
Champion: Prophet, SARIMA, Holt-Winters, XGBoost — selected by WAPE on holdout.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.supabase_client import get_supabase, get_table
from app.services.predictive._champion import (
    markov_forecast,
    select_champion,
    train_test_split_ts,
)


def _prophet_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from prophet import Prophet

    n = len(holdout)
    dates = pd.date_range(end=pd.Timestamp.today(), periods=len(train), freq="MS")
    df_p = pd.DataFrame({"ds": dates, "y": train})
    m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
    m.fit(df_p)
    future = m.make_future_dataframe(periods=n, freq="MS")
    fc = m.predict(future)
    return fc["yhat"].iloc[-n:].values


def _sarima_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    n = len(holdout)
    model = SARIMAX(
        train, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False, enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    return np.array(fitted.forecast(steps=n))


def _holtwinters_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    n = len(holdout)
    seasonal = "add" if len(train) >= 24 else None
    model = ExponentialSmoothing(
        train, trend="add",
        seasonal=seasonal, seasonal_periods=12 if seasonal else None,
    )
    fitted = model.fit(optimized=True)
    return fitted.forecast(n)


def _xgboost_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    import xgboost as xgb

    n = len(holdout)
    lags = min(6, len(train) - 1)

    def make_features(s: np.ndarray):
        X, y = [], []
        for i in range(lags, len(s)):
            X.append(s[i - lags: i])
            y.append(s[i])
        return np.array(X), np.array(y)

    X_tr, y_tr = make_features(train)
    if len(X_tr) < 2:
        return np.full(n, float(np.mean(train)))

    model = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42)
    model.fit(X_tr, y_tr)

    window = list(train[-lags:])
    preds = []
    for _ in range(n):
        feat = np.array(window[-lags:]).reshape(1, -1)
        p = float(model.predict(feat)[0])
        preds.append(p)
        window.append(p)
    return np.array(preds)


_CANDIDATES = {
    "Prophet": _prophet_trainer,
    "SARIMA": _sarima_trainer,
    "Holt-Winters": _holtwinters_trainer,
    "XGBoost": _xgboost_trainer,
}


def _fetch_and_process(institution_id: str, entity_type: str, periods: int) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()
    schema, receipt_cols, _, _ = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols
    seen: set[str] = set()
    select_cols: list[str] = []
    for c in all_cols:
        if c not in seen:
            select_cols.append(c)
            seen.add(c)

    res = (
        get_table(schema, "financial_records")
        .select(", ".join(select_cols))
        .eq("institution_id", institution_id)
        .eq("is_current_version", True)
        .is_("deleted_at", "null")
        .order("year")
        .execute()
    )

    insufficient = {
        "data_sufficient": False,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "seasonal_forecast": [],
        "champion": {"champion_model": "N/A", "metrics": {}, "all_candidates": {}, "wape": 1.0, "needs_retraining": True},
        "kpis": {},
        "timestamp": ts,
    }

    if not res.data or len(res.data) < 6:
        return insufficient

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    series = df["total_receipts"].values.astype(float)

    train, holdout = train_test_split_ts(series)
    champion_name, all_scores = select_champion(_CANDIDATES, train, holdout)
    champion_wape = all_scores.get(champion_name, 1.0)

    # Generate forecast with champion
    try:
        trainer = _CANDIDATES[champion_name]
        yhat = trainer(series, np.zeros(periods))
    except Exception:
        yhat = np.full(periods, float(np.mean(series)))

    std = float(np.std(series)) * 0.15
    last_date = df["date"].iloc[-1]
    future_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=periods, freq="MS")
    period_labels = future_dates.strftime("%Y-%m").tolist()

    seasonal_forecast = [
        {
            "period": period_labels[i],
            "value": round(float(yhat[i]), 2),
            "lower_bound": round(float(yhat[i]) - 1.96 * std, 2),
            "upper_bound": round(float(yhat[i]) + 1.96 * std, 2),
        }
        for i in range(periods)
    ]

    avg_hist = float(np.mean(series[-12:])) if len(series) >= 12 else float(np.mean(series))
    avg_forecast = float(np.mean(yhat))

    kpis = {
        "avg_historical_collection": round(avg_hist, 2),
        "avg_forecasted_collection": round(avg_forecast, 2),
        "forecast_vs_historical_pct": round(safe_div(avg_forecast - avg_hist, avg_hist) * 100, 2),
        "peak_forecast_value": round(float(np.max(yhat)), 2),
        "trough_forecast_value": round(float(np.min(yhat)), 2),
    }

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "seasonal_forecast": seasonal_forecast,
        "champion": {
            "champion_model": champion_name,
            "metrics": {"wape": round(champion_wape, 4)},
            "all_candidates": {k: round(v, 4) for k, v in all_scores.items()},
            "wape": round(champion_wape, 4),
            "needs_retraining": champion_wape > 0.15,
        },
        "kpis": kpis,
        "timestamp": ts,
    }


async def get_seasonal_forecast(institution_id: str, entity_type: str, periods: int = 6) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type, periods)
