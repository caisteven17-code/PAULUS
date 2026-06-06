"""
Predictive: Pastoral Assignment Financial Trend Forecast
Candidates: Holt-Winters, SARIMA, XGBoost, Markov Chain.
Also predicts discrete state (improving/stable/declining) via Markov transitions.
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
    markov_transition_matrix,
    select_champion,
    train_test_split_ts,
)


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


def _sarima_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    n = len(holdout)
    model = SARIMAX(
        train, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False, enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    return np.array(fitted.forecast(steps=n))


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


def _markov_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    return markov_forecast(train, holdout)


_CANDIDATES = {
    "Holt-Winters": _holtwinters_trainer,
    "SARIMA": _sarima_trainer,
    "XGBoost": _xgboost_trainer,
    "Markov Chain": _markov_trainer,
}


def _state_of(series: np.ndarray, window: int = 3) -> str:
    if len(series) < window + 1:
        return "stable"
    recent = series[-window:]
    slope = float(np.polyfit(range(window), recent, 1)[0])
    std = float(np.std(series))
    if abs(slope) < std * 0.05:
        return "stable"
    return "improving" if slope > 0 else "declining"


def _fetch_and_process(institution_id: str, periods: int) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    schema = None
    receipt_cols: list[str] = []
    for etype, (s, rc, _, _) in _SCHEMA_MAP.items():
        res_check = (
            get_table(s, "financial_records")
            .select("institution_id")
            .eq("institution_id", institution_id)
            .limit(1)
            .execute()
        )
        if res_check.data:
            schema, receipt_cols, _, _ = _SCHEMA_MAP[etype]
            break

    insufficient = {
        "data_sufficient": False,
        "institution_id": institution_id,
        "continuous_forecast": [],
        "state_prediction": "stable",
        "transition_probabilities": {},
        "champion": {"champion_model": "N/A", "metrics": {}, "all_candidates": {}, "wape": 1.0, "needs_retraining": True},
        "timestamp": ts,
    }

    if schema is None:
        return insufficient

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

    # Generate forecast
    try:
        if champion_name == "Holt-Winters":
            yhat = _holtwinters_trainer(series, np.zeros(periods))
        elif champion_name == "SARIMA":
            yhat = _sarima_trainer(series, np.zeros(periods))
        elif champion_name == "XGBoost":
            yhat = _xgboost_trainer(series, np.zeros(periods))
        else:
            yhat = markov_forecast(series, np.zeros(periods))
    except Exception:
        yhat = np.full(periods, float(np.mean(series)))

    std = float(np.std(series)) * 0.15
    last_date = df["date"].iloc[-1]
    future_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=periods, freq="MS")
    period_labels = future_dates.strftime("%Y-%m").tolist()

    continuous_forecast = [
        {
            "period": period_labels[i],
            "value": round(float(yhat[i]), 2),
            "lower_bound": round(float(yhat[i]) - 1.96 * std, 2),
            "upper_bound": round(float(yhat[i]) + 1.96 * std, 2),
        }
        for i in range(periods)
    ]

    # State prediction via Markov
    state_prediction = _state_of(series)
    n_states = 3  # improving, stable, declining
    # Map continuous series to 3-state
    p33 = float(np.percentile(series, 33))
    p67 = float(np.percentile(series, 67))

    def to_state(v: float) -> int:
        return 0 if v <= p33 else (2 if v >= p67 else 1)

    state_seq = np.array([to_state(v) for v in series])
    tm = np.zeros((3, 3))
    for i in range(len(state_seq) - 1):
        tm[state_seq[i], state_seq[i + 1]] += 1
    row_sums = tm.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    tm = tm / row_sums

    state_names = ["declining", "stable", "improving"]
    current_state_idx = to_state(float(series[-1]))
    next_state_probs = tm[current_state_idx]
    transition_probabilities = {
        state_names[i]: round(float(next_state_probs[i]), 4)
        for i in range(3)
    }

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "continuous_forecast": continuous_forecast,
        "state_prediction": state_prediction,
        "transition_probabilities": transition_probabilities,
        "champion": {
            "champion_model": champion_name,
            "metrics": {"wape": round(champion_wape, 4)},
            "all_candidates": {k: round(v, 4) for k, v in all_scores.items()},
            "wape": round(champion_wape, 4),
            "needs_retraining": champion_wape > 0.15,
        },
        "timestamp": ts,
    }


async def get_pastoral_forecast(institution_id: str, periods: int = 6) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id, periods)
