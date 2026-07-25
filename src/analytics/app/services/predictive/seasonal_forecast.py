"""
Predictive: Seasonality Forecast
Champion: Prophet, SARIMA, SARIMAX, Holt-Winters, XGBoost — selected by average
WAPE across a fixed-size holdout plus any additional chronological
walk-forward folds the series has room for (see _champion.py).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services import _aws_financials
from app.services.data_definitions import _SCHEMA_MAP, build_date_index, safe_div
from app.services.predictive._champion import (
    diagnose_generalization,
    full_metrics,
    select_champion,
    train_test_split_ts,
    walk_forward_folds,
)
from app.services.predictive.financial_forecast import _build_exog_frame, _sarimax_exog_trainer
from app.services.supabase_client import get_table


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
        train,
        order=(1, 1, 1),
        seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    return np.array(fitted.forecast(steps=n))


def _holtwinters_trainer(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    n = len(holdout)
    seasonal = "add" if len(train) >= 24 else None
    model = ExponentialSmoothing(
        train,
        trend="add",
        seasonal=seasonal,
        seasonal_periods=12 if seasonal else None,
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
            X.append(s[i - lags : i])
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


def _fetch_series(institution_id: str, entity_type: str) -> pd.DataFrame | None:
    """Monthly df with date/total_receipts — AWS warehouse first for parishes,
    Supabase otherwise. None when fewer than 6 months exist."""
    if entity_type == "parish":
        df = _aws_financials.parish_monthly_df(institution_id)
        if df is not None and len(df) >= 6:
            return df

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
    if not res.data or len(res.data) < 6:
        return None

    df = pd.DataFrame(res.data)
    df = build_date_index(df)
    for col in receipt_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    return df


def _fetch_and_process(institution_id: str, entity_type: str, periods: int) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    df = _fetch_series(institution_id, entity_type)
    if df is None:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "seasonal_forecast": [],
            "champion": {
                "champion_model": "N/A",
                "metrics": {},
                "all_candidates": {},
                "wape": 1.0,
                "needs_retraining": True,
                "folds_used": 0,
                "generalization": None,
            },
            "kpis": {},
            "timestamp": ts,
        }

    series = df["total_receipts"].values.astype(float)

    # Liturgical exogenous features for the SARIMAX candidate — same rationale
    # and shared helper as financial_forecast.py: plain SARIMA's fixed 12-month
    # seasonal term can't track moveable feasts (Easter/Holy Week), an
    # exogenous liturgical regressor can.
    full_exog = _build_exog_frame(df["year"].tolist(), df["month_num"].tolist())

    train, holdout = train_test_split_ts(series)
    # Extra chronological folds (see walk_forward_folds), same as
    # financial_forecast.py — champion selection averages WAPE across
    # several unseen windows instead of trusting just the one most recent.
    extra_folds = walk_forward_folds(series)

    # Every fold from train_test_split_ts/walk_forward_folds is
    # prefix-anchored (train is always series[:len(train)]), so len(train)
    # alone identifies the matching slice of full_exog for any fold — same
    # trick as financial_forecast.py's _sarimax_candidate, needed because
    # this closure is now evaluated against more than one fold.
    def _sarimax_candidate(tr: np.ndarray, ho: np.ndarray) -> np.ndarray:
        start = len(tr)
        end = start + len(ho)
        return _sarimax_exog_trainer(tr, ho, full_exog[:start], full_exog[start:end])

    candidates = dict(_CANDIDATES)  # copy — don't mutate the module-level dict
    candidates["SARIMAX"] = _sarimax_candidate

    champion_name, all_scores = select_champion(candidates, train, holdout, extra_folds=extra_folds)
    # Fold-averaged score used for champion selection and needs_retraining —
    # will generally differ from champion.metrics.wape below, which is the
    # champion's WAPE on the real holdout alone (see financial_forecast.py's
    # matching comment for why that's not a bug).
    champion_wape = all_scores.get(champion_name, 1.0)

    # select_champion() only returns WAPE scores, not predictions — re-run the
    # champion once on the same holdout split to compute MAPE/MASE/MPE
    # alongside WAPE.
    try:
        champion_holdout_preds = np.asarray(candidates[champion_name](train, holdout), dtype=float)
        champion_metrics = full_metrics(holdout, champion_holdout_preds, train)
    except Exception:
        champion_metrics = {"wape": round(champion_wape, 4)}

    generalization = diagnose_generalization(candidates[champion_name], train, holdout)

    last_date = df["date"].iloc[-1]
    future_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=periods, freq="MS")
    period_labels = future_dates.strftime("%Y-%m").tolist()

    # Generate forecast with champion. SARIMAX needs the full-series exog plus
    # future exog for the forecast horizon, not the train/holdout split used
    # for champion selection, so it's handled separately from the generic
    # 2-arg trainer re-run the other candidates share.
    try:
        if champion_name == "SARIMAX":
            future_exog = _build_exog_frame(future_dates.year.tolist(), future_dates.month.tolist())
            yhat = _sarimax_exog_trainer(series, np.zeros(periods), full_exog, future_exog)
        else:
            trainer = candidates[champion_name]
            yhat = trainer(series, np.zeros(periods))
    except Exception:
        yhat = np.full(periods, float(np.mean(series)))

    std = float(np.std(series)) * 0.15

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
            "metrics": champion_metrics,
            "all_candidates": {k: round(v, 4) for k, v in all_scores.items()},
            "wape": round(champion_wape, 4),
            "needs_retraining": champion_wape > 0.15,
            "folds_used": 1 + len(extra_folds),
            "generalization": generalization,
        },
        "kpis": kpis,
        "timestamp": ts,
    }


async def get_seasonal_forecast(institution_id: str, entity_type: str, periods: int = 6) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type, periods)
