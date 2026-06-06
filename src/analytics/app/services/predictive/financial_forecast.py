"""
Predictive: Financial Forecast
Candidates: Prophet, SARIMA, Holt-Winters, XGBoost, Markov Chain.
Champion selected by WAPE on 20% holdout.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import _SCHEMA_MAP, build_date_index
from app.services.predictive._champion import (
    markov_forecast,
    select_champion,
    train_test_split_ts,
)
from app.services.supabase_client import get_table

# ── Candidate trainers ────────────────────────────────────────────────────────

def _prophet_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from prophet import Prophet

    n_hold = len(holdout)
    dates = pd.date_range(end=pd.Timestamp.today(), periods=len(train), freq="MS")
    df_train = pd.DataFrame({"ds": dates, "y": train})
    m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
    m.fit(df_train)
    future = m.make_future_dataframe(periods=n_hold, freq="MS")
    forecast = m.predict(future)
    return forecast["yhat"].iloc[-n_hold:].values


def _sarima_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    n_hold = len(holdout)
    model = SARIMAX(
        train, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False, enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    forecast = fitted.forecast(steps=n_hold)
    return np.array(forecast)


def _holtwinters_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    n_hold = len(holdout)
    seasonal = "add" if len(train) >= 24 else None
    model = ExponentialSmoothing(
        train,
        trend="add",
        seasonal=seasonal,
        seasonal_periods=12 if seasonal else None,
    )
    fitted = model.fit(optimized=True)
    return fitted.forecast(n_hold)


def _xgboost_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    import xgboost as xgb

    n_hold = len(holdout)
    lags = min(6, len(train) - 1)

    def make_features(series: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        X, y = [], []
        for i in range(lags, len(series)):
            X.append(series[i - lags: i])
            y.append(series[i])
        return np.array(X), np.array(y)

    X_tr, y_tr = make_features(train)
    if len(X_tr) < 2:
        return np.full(n_hold, float(np.mean(train)))

    model = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42)
    model.fit(X_tr, y_tr)

    window = list(train[-lags:])
    preds = []
    for _ in range(n_hold):
        feat = np.array(window[-lags:]).reshape(1, -1)
        p = float(model.predict(feat)[0])
        preds.append(p)
        window.append(p)

    return np.array(preds)


def _markov_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    return markov_forecast(train, holdout)


_CANDIDATES = {
    "Prophet": _prophet_trainer,
    "SARIMA": _sarima_trainer,
    "Holt-Winters": _holtwinters_trainer,
    "XGBoost": _xgboost_trainer,
    "Markov Chain": _markov_trainer,
}


def _generate_forecast(champion: str, full_series: np.ndarray, periods: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (yhat, lower, upper) for `periods` steps using the champion model."""
    try:
        if champion == "Prophet":
            from prophet import Prophet
            dates = pd.date_range(end=pd.Timestamp.today(), periods=len(full_series), freq="MS")
            df_p = pd.DataFrame({"ds": dates, "y": full_series})
            m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
            m.fit(df_p)
            future = m.make_future_dataframe(periods=periods, freq="MS")
            fc = m.predict(future)
            yhat = fc["yhat"].iloc[-periods:].values
            lower = fc["yhat_lower"].iloc[-periods:].values
            upper = fc["yhat_upper"].iloc[-periods:].values
            return yhat, lower, upper

        elif champion == "SARIMA":
            from statsmodels.tsa.statespace.sarimax import SARIMAX
            model = SARIMAX(
                full_series, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12),
                enforce_stationarity=False, enforce_invertibility=False,
            )
            fitted = model.fit(disp=False)
            pred = fitted.get_forecast(steps=periods)
            yhat = pred.predicted_mean.values
            ci = pred.conf_int()
            return yhat, ci.iloc[:, 0].values, ci.iloc[:, 1].values

        elif champion == "Holt-Winters":
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            seasonal = "add" if len(full_series) >= 24 else None
            model = ExponentialSmoothing(
                full_series, trend="add",
                seasonal=seasonal, seasonal_periods=12 if seasonal else None,
            )
            fitted = model.fit(optimized=True)
            yhat = fitted.forecast(periods)
            std = float(np.std(full_series - fitted.fittedvalues)) if len(fitted.fittedvalues) > 0 else 0
            return yhat, yhat - 1.96 * std, yhat + 1.96 * std

        elif champion == "XGBoost":
            yhat = _xgboost_trainer(full_series, np.zeros(periods))
            residuals = full_series - np.convolve(full_series, np.ones(3) / 3, mode="same")
            std = float(np.std(residuals))
            return yhat, yhat - 1.96 * std, yhat + 1.96 * std

        else:  # Markov Chain
            yhat = markov_forecast(full_series, np.zeros(periods))
            std = float(np.std(full_series)) * 0.2
            return yhat, yhat - std, yhat + std

    except Exception:
        mean_val = float(np.mean(full_series))
        std_val = float(np.std(full_series)) * 0.2
        yhat = np.full(periods, mean_val)
        return yhat, yhat - std_val, yhat + std_val


def _fetch_and_process(institution_id: str, entity_type: str, periods: int) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()
    schema, receipt_cols, expense_cols, _ = _SCHEMA_MAP[entity_type]

    all_cols = ["institution_id", "month", "year"] + receipt_cols + expense_cols
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
        "forecast_receipts": [],
        "forecast_expenses": [],
        "champion": {"champion_model": "N/A", "metrics": {}, "all_candidates": {}, "wape": 1.0, "needs_retraining": True},
        "signal": "stable",
        "timestamp": ts,
    }

    if not res.data or len(res.data) < 6:
        return insufficient

    df = pd.DataFrame(res.data)
    df = build_date_index(df)

    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)

    r_series = df["total_receipts"].values.astype(float)
    e_series = df["total_expenses"].values.astype(float)

    # Champion selection on receipts
    r_train, r_hold = train_test_split_ts(r_series)
    champion_name, all_scores = select_champion(_CANDIDATES, r_train, r_hold)
    champion_wape = all_scores.get(champion_name, 1.0)
    needs_retraining = champion_wape > 0.15

    # Generate receipts forecast
    r_yhat, r_lower, r_upper = _generate_forecast(champion_name, r_series, periods)
    # Generate expenses forecast (always use Holt-Winters for simplicity on expenses)
    e_yhat, e_lower, e_upper = _generate_forecast("Holt-Winters", e_series, periods)

    last_date = df["date"].iloc[-1]
    future_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=periods, freq="MS")
    period_labels = future_dates.strftime("%Y-%m").tolist()

    forecast_receipts = [
        {
            "period": period_labels[i],
            "value": round(float(r_yhat[i]), 2),
            "lower_bound": round(float(r_lower[i]), 2),
            "upper_bound": round(float(r_upper[i]), 2),
        }
        for i in range(periods)
    ]

    forecast_expenses = [
        {
            "period": period_labels[i],
            "value": round(float(e_yhat[i]), 2),
            "lower_bound": round(float(e_lower[i]), 2),
            "upper_bound": round(float(e_upper[i]), 2),
        }
        for i in range(periods)
    ]

    mean_forecast = float(np.mean(r_yhat))
    mean_hist = float(np.mean(r_series[-6:])) if len(r_series) >= 6 else float(np.mean(r_series))
    signal = "rise" if mean_forecast > mean_hist * 1.02 else ("fall" if mean_forecast < mean_hist * 0.98 else "stable")

    return {
        "data_sufficient": True,
        "entity_id": institution_id,
        "entity_type": entity_type,
        "forecast_receipts": forecast_receipts,
        "forecast_expenses": forecast_expenses,
        "champion": {
            "champion_model": champion_name,
            "metrics": {"wape": round(champion_wape, 4)},
            "all_candidates": {k: round(v, 4) for k, v in all_scores.items()},
            "wape": round(champion_wape, 4),
            "needs_retraining": needs_retraining,
        },
        "signal": signal,
        "timestamp": ts,
    }


async def get_financial_forecast(institution_id: str, entity_type: str, periods: int = 12) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type, periods)
