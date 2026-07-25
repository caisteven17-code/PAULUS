"""
Predictive: Financial Forecast
Candidates: Prophet, SARIMA, SARIMAX, Holt-Winters, XGBoost, Markov Chain.
Champion selected by average WAPE across a fixed-size (one seasonal cycle)
holdout plus any additional chronological walk-forward folds the series has
room for — see _champion.py.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Sequence

import numpy as np
import pandas as pd

from app.services import _aws_financials
from app.services.data_definitions import _SCHEMA_MAP, build_date_index
from app.services.predictive._champion import (
    diagnose_generalization,
    full_metrics,
    markov_forecast,
    select_champion,
    train_test_split_ts,
    walk_forward_folds,
)
from app.services.supabase_client import get_table

# ── Liturgical exogenous features (SARIMAX only) ──────────────────────────────
#
# Plain SARIMA's fixed 12-month seasonal term can't track moveable liturgical
# feasts (Easter/Holy Week shift dates year to year) — a liturgical-calendar
# exogenous regressor can. SARIMAX races as an *additional* candidate alongside
# plain SARIMA, not a replacement; WAPE decides per institution, same empirical
# pattern used everywhere else in this codebase. Deliberately liturgical-only,
# not weather — liturgical data is diocese-wide (no municipality join needed)
# and is the actual domain-specific reason SARIMAX should help here.

LITURGICAL_FEATURE_COLUMNS = [
    "liturgical_solemnity_days",
    "liturgical_feast_days",
    "liturgical_memorial_days",
    "liturgical_sunday_days",
    "liturgical_weekday_days",
    "liturgical_advent_days",
    "liturgical_christmas_days",
    "liturgical_lent_days",
    "liturgical_easter_days",
    "liturgical_triduum_days",
    "liturgical_ordinary_days",
    "liturgical_major_days",
    "liturgical_penitential_days",
]


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


def fetch_liturgical_features(years: Sequence[int]) -> pd.DataFrame:
    years = sorted({int(year) for year in years if pd.notna(year)})
    if not years:
        return pd.DataFrame(columns=["year", "month_num", *LITURGICAL_FEATURE_COLUMNS])

    rows = _fetch_all_pages(
        get_table("reference", "liturgical_calendar")
        .select("year, month, rank, liturgical_season, review_status")
        .in_("year", years)
    )
    if not rows:
        return pd.DataFrame(columns=["year", "month_num", *LITURGICAL_FEATURE_COLUMNS])

    calendar = pd.DataFrame(rows)
    if "review_status" in calendar.columns:
        calendar = calendar[calendar["review_status"].isin(["approved", "approved_with_revisions", "pending"])]
    calendar["year"] = pd.to_numeric(calendar["year"], errors="coerce")
    calendar["month_num"] = pd.to_numeric(calendar["month"], errors="coerce")
    calendar["rank"] = calendar["rank"].astype(str).str.upper().str.strip()
    calendar["liturgical_season"] = calendar["liturgical_season"].astype(str).str.lower().str.strip()

    feature_map = {
        "liturgical_solemnity_days": calendar["rank"].eq("SOLEMNITY"),
        "liturgical_feast_days": calendar["rank"].eq("FEAST"),
        "liturgical_memorial_days": calendar["rank"].eq("MEMORIAL"),
        "liturgical_sunday_days": calendar["rank"].eq("SUNDAY"),
        "liturgical_weekday_days": calendar["rank"].eq("WEEKDAY"),
        "liturgical_advent_days": calendar["liturgical_season"].eq("advent"),
        "liturgical_christmas_days": calendar["liturgical_season"].eq("christmas"),
        "liturgical_lent_days": calendar["liturgical_season"].eq("lent"),
        "liturgical_easter_days": calendar["liturgical_season"].eq("easter"),
        "liturgical_triduum_days": calendar["liturgical_season"].eq("paschal triduum"),
        "liturgical_ordinary_days": calendar["liturgical_season"].eq("ordinary time"),
    }
    for feature_name, mask in feature_map.items():
        calendar[feature_name] = mask.astype(int)

    calendar["liturgical_major_days"] = (
        calendar["liturgical_solemnity_days"] + calendar["liturgical_feast_days"] + calendar["liturgical_sunday_days"]
    )
    calendar["liturgical_penitential_days"] = calendar["liturgical_lent_days"] + calendar["liturgical_triduum_days"]

    return (
        calendar.dropna(subset=["year", "month_num"])
        .groupby(["year", "month_num"], as_index=False)[LITURGICAL_FEATURE_COLUMNS]
        .sum()
    )


def _build_exog_frame(years: Sequence[int], months: Sequence[int]) -> np.ndarray:
    """Liturgical feature matrix aligned to the given (year, month_num) pairs."""
    frame = pd.DataFrame({"year": list(years), "month_num": list(months)})
    liturgical = fetch_liturgical_features(years)
    if not liturgical.empty:
        frame = frame.merge(liturgical, on=["year", "month_num"], how="left")
    for col in LITURGICAL_FEATURE_COLUMNS:
        if col not in frame.columns:
            frame[col] = 0.0
        frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0.0)
    return frame[LITURGICAL_FEATURE_COLUMNS].to_numpy(dtype=float)


def _clean_exog(values: np.ndarray | None) -> np.ndarray | None:
    if values is None or values.size == 0:
        return None
    cleaned = np.asarray(values, dtype=float)
    return np.nan_to_num(cleaned, nan=0.0, posinf=0.0, neginf=0.0)


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
        train,
        order=(1, 1, 1),
        seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    forecast = fitted.forecast(steps=n_hold)
    return np.array(forecast)


def _sarimax_exog_trainer(
    train: np.ndarray,
    holdout: np.ndarray,
    train_exog: np.ndarray | None,
    holdout_exog: np.ndarray | None,
) -> np.ndarray:
    """SARIMA + liturgical-calendar exogenous regressors. Falls back to plain
    SARIMA when no usable exogenous data is available for this institution."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    train_exog = _clean_exog(train_exog)
    holdout_exog = _clean_exog(holdout_exog)
    if train_exog is None or holdout_exog is None or train_exog.shape[1] == 0:
        return _sarima_trainer(train, holdout)

    seasonal_order = (1, 1, 1, 12) if len(train) >= 24 else (0, 0, 0, 0)
    model = SARIMAX(
        train,
        exog=train_exog,
        order=(1, 1, 1),
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    return np.asarray(fitted.forecast(steps=len(holdout), exog=holdout_exog), dtype=float)


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
            X.append(series[i - lags : i])
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


def _generate_forecast(
    champion: str,
    full_series: np.ndarray,
    periods: int,
    exog: tuple[np.ndarray, np.ndarray] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (yhat, lower, upper) for `periods` steps using the champion model.
    `exog`, when given, is (full_series_liturgical_exog, future_liturgical_exog) —
    only used when champion == "SARIMAX"."""
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
                full_series,
                order=(1, 1, 1),
                seasonal_order=(1, 1, 1, 12),
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fitted = model.fit(disp=False)
            pred = fitted.get_forecast(steps=periods)
            yhat = pred.predicted_mean.values
            ci = pred.conf_int()
            return yhat, ci.iloc[:, 0].values, ci.iloc[:, 1].values

        elif champion == "SARIMAX" and exog is not None:
            from statsmodels.tsa.statespace.sarimax import SARIMAX

            full_exog, future_exog = exog
            full_exog = _clean_exog(full_exog)
            future_exog = _clean_exog(future_exog)
            if full_exog is None or future_exog is None or full_exog.shape[1] == 0:
                return _generate_forecast("SARIMA", full_series, periods)

            seasonal_order = (1, 1, 1, 12) if len(full_series) >= 24 else (0, 0, 0, 0)
            model = SARIMAX(
                full_series,
                exog=full_exog,
                order=(1, 1, 1),
                seasonal_order=seasonal_order,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fitted = model.fit(disp=False)
            pred = fitted.get_forecast(steps=periods, exog=future_exog)
            yhat = pred.predicted_mean.values
            ci = pred.conf_int()
            return yhat, ci.iloc[:, 0].values, ci.iloc[:, 1].values

        elif champion == "Holt-Winters":
            from statsmodels.tsa.holtwinters import ExponentialSmoothing

            seasonal = "add" if len(full_series) >= 24 else None
            model = ExponentialSmoothing(
                full_series,
                trend="add",
                seasonal=seasonal,
                seasonal_periods=12 if seasonal else None,
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


def _fetch_series(institution_id: str, entity_type: str) -> pd.DataFrame | None:
    """Monthly df with date/total_receipts/total_expenses — AWS warehouse first
    for parishes, Supabase otherwise. None when fewer than 6 months exist."""
    if entity_type == "parish":
        df = _aws_financials.parish_monthly_df(institution_id)
        if df is not None and len(df) >= 6:
            return df

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
    if not res.data or len(res.data) < 6:
        return None

    df = pd.DataFrame(res.data)
    df = build_date_index(df)
    for col in receipt_cols + expense_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["total_receipts"] = df[receipt_cols].sum(axis=1)
    df["total_expenses"] = df[expense_cols].sum(axis=1)
    return df


def _fetch_and_process(institution_id: str, entity_type: str, periods: int) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    df = _fetch_series(institution_id, entity_type)
    if df is None:
        return {
            "data_sufficient": False,
            "entity_id": institution_id,
            "entity_type": entity_type,
            "forecast_receipts": [],
            "forecast_expenses": [],
            "champion": {
                "champion_model": "N/A",
                "metrics": {},
                "all_candidates": {},
                "wape": 1.0,
                "needs_retraining": True,
            },
            "signal": "stable",
            "timestamp": ts,
        }

    r_series = df["total_receipts"].values.astype(float)
    e_series = df["total_expenses"].values.astype(float)

    # Liturgical exogenous features for the SARIMAX candidate — built once per
    # request and bound into a closure below, so `_champion.py`'s shared
    # (train, holdout) -> predictions signature stays untouched.
    full_exog = _build_exog_frame(df["year"].tolist(), df["month_num"].tolist())

    # Champion selection on receipts
    r_train, r_hold = train_test_split_ts(r_series)
    # Extra chronological folds (see walk_forward_folds) so champion
    # selection averages WAPE across several unseen windows instead of just
    # the one most-recent holdout — a candidate that only looks good on one
    # lucky window won't be crowned champion just for that.
    extra_folds = walk_forward_folds(r_series)

    # Every fold produced by train_test_split_ts/walk_forward_folds from
    # r_series is prefix-anchored (train is always r_series[:len(train)],
    # holdout immediately follows) — so len(train) alone identifies exactly
    # which slice of full_exog corresponds to *any* given fold, real holdout
    # or extra. This is what lets one SARIMAX closure serve every fold
    # correctly instead of being bound to a single fixed exog split.
    def _sarimax_candidate(train: np.ndarray, holdout: np.ndarray) -> np.ndarray:
        start = len(train)
        end = start + len(holdout)
        return _sarimax_exog_trainer(train, holdout, full_exog[:start], full_exog[start:end])

    candidates = dict(_CANDIDATES)  # copy — don't mutate the module-level dict
    candidates["SARIMAX"] = _sarimax_candidate

    champion_name, all_scores = select_champion(candidates, r_train, r_hold, extra_folds=extra_folds)
    # This is the fold-AVERAGED WAPE used to pick the champion (across the
    # real holdout plus every extra fold) — deliberately used to drive
    # needs_retraining too, since it's a more robust signal than any single
    # window. It will generally differ from champion.metrics.wape below,
    # which is the champion's WAPE on the real holdout alone (needed to line
    # up with MAPE/MASE/MPE, which are only computed on that one window) —
    # two numbers with different meanings, not a bug if they don't match.
    champion_wape = all_scores.get(champion_name, 1.0)
    needs_retraining = champion_wape > 0.15

    # select_champion() only returns WAPE scores, not predictions, to keep its
    # shared signature simple — re-run the champion once on the same split to
    # get its holdout predictions, so MAPE/MASE/MPE can be computed alongside
    # WAPE (which alone can hide systematic over/under-forecasting bias).
    try:
        champion_holdout_preds = np.asarray(candidates[champion_name](r_train, r_hold), dtype=float)
        champion_metrics = full_metrics(r_hold, champion_holdout_preds, r_train)
    except Exception:
        champion_metrics = {"wape": round(champion_wape, 4)}

    # Overfitting/underfitting diagnostic for the champion — see
    # diagnose_generalization's docstring for why this uses a nested holdout
    # within r_train rather than classical in-sample fit error (which would
    # be trivially near-zero for XGBoost regardless of true generalization).
    generalization = diagnose_generalization(candidates[champion_name], r_train, r_hold)

    last_date = df["date"].iloc[-1]
    future_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=periods, freq="MS")
    period_labels = future_dates.strftime("%Y-%m").tolist()

    forecast_exog = None
    if champion_name == "SARIMAX":
        future_exog = _build_exog_frame(future_dates.year.tolist(), future_dates.month.tolist())
        forecast_exog = (full_exog, future_exog)

    # Generate receipts forecast
    r_yhat, r_lower, r_upper = _generate_forecast(champion_name, r_series, periods, exog=forecast_exog)
    # Generate expenses forecast (always use Holt-Winters for simplicity on expenses)
    e_yhat, e_lower, e_upper = _generate_forecast("Holt-Winters", e_series, periods)

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
            "metrics": champion_metrics,
            "all_candidates": {k: round(v, 4) for k, v in all_scores.items()},
            "wape": round(champion_wape, 4),
            "needs_retraining": needs_retraining,
            "folds_used": 1 + len(extra_folds),
            "generalization": generalization,
        },
        "signal": signal,
        "timestamp": ts,
    }


async def get_financial_forecast(institution_id: str, entity_type: str, periods: int = 12) -> dict[str, Any]:
    if entity_type not in _SCHEMA_MAP:
        raise ValueError(f"Unknown entity type: {entity_type}")
    return await asyncio.to_thread(_fetch_and_process, institution_id, entity_type, periods)
