"""
Shared champion model selection utilities for all predictive services.

Selection protocol:
  1. Split series: a fixed-size holdout (one seasonal cycle, see
     train_test_split_ts), not a percentage — a percentage holdout keeps
     growing forever as more months are submitted, when one season is
     already enough to evaluate a champion against. When enough history
     exists, additional chronological walk-forward folds (see
     walk_forward_folds) are also generated so a candidate's score is the
     average WAPE across several unseen windows, not just one.
  2. All candidate models run simultaneously in a thread pool (one thread per
     model per fold). Prophet, SARIMA, XGBoost, and statsmodels all release
     the GIL during heavy computation, so ThreadPoolExecutor gives genuine
     parallelism here.
  3. Champion = lowest average WAPE across all folds.
  4. Results are cached by data fingerprint (MD5 of every fold's bytes).
     Same data → instant return. Different data (new submissions) → re-runs
     automatically without any explicit invalidation step needed.

WAPE = sum(|actual - predicted|) / sum(|actual|)
"""

from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Any, Callable

import numpy as np

# ── WAPE ──────────────────────────────────────────────────────────────────────


def wape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denom = float(np.sum(np.abs(actual)))
    if denom == 0:
        return 1.0
    return float(np.sum(np.abs(actual - predicted))) / denom


# ── Additional accuracy metrics ────────────────────────────────────────────────
#
# WAPE alone can hide systematic bias — a model can post a decent WAPE while
# consistently over- or under-forecasting, and nothing in a WAPE-only response
# surfaces that. MAPE and MPE catch that; MASE tells you whether a model is
# actually better than "just repeat last year's same month," which WAPE alone
# can't answer either. Shared here (not duplicated per service) since all three
# forecast services and the offline evaluation script need the same math.


def mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Mean Absolute Percentage Error, as a 0-100 percentage. Points where
    actual == 0 are excluded (the ratio is undefined there), matching the
    standard convention — this is why WAPE, not MAPE, is used for champion
    selection, but MAPE is still useful to report alongside it."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = actual != 0
    if not np.any(mask):
        return 0.0 if np.allclose(predicted, 0.0) else 100.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def mpe(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Mean Percentage Error, signed, as a 0-100 percentage — reveals systematic
    over-forecasting (positive) or under-forecasting (negative) that WAPE's
    absolute value hides."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    denom = float(np.sum(np.abs(actual)))
    if denom == 0:
        return 0.0
    return float(np.sum(predicted - actual) / denom * 100)


def mase(actual: np.ndarray, predicted: np.ndarray, train: np.ndarray, seasonal_period: int = 12) -> float:
    """Mean Absolute Scaled Error — the champion's MAE scaled against a naive
    baseline's MAE computed on the training series (seasonal-naive, lag-12,
    when there's enough history; simple lag-1 naive otherwise). MASE < 1 means
    the model beats "just repeat last year's same month"; >= 1 means it
    doesn't — a check WAPE alone can't provide."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    train = np.asarray(train, dtype=float)
    model_mae = float(np.mean(np.abs(actual - predicted)))

    if len(train) > seasonal_period:
        naive_errors = np.abs(train[seasonal_period:] - train[:-seasonal_period])
    else:
        naive_errors = np.abs(np.diff(train))

    naive_mae = float(np.mean(naive_errors)) if naive_errors.size > 0 else 0.0
    if naive_mae == 0:
        return 0.0 if model_mae == 0 else float("inf")
    return model_mae / naive_mae


def full_metrics(actual: np.ndarray, predicted: np.ndarray, train: np.ndarray) -> dict[str, float]:
    """WAPE (0-1 fraction, matching this module's existing convention) plus
    MAPE/MPE (0-100 percentages) and MASE (ratio) in one call, so services
    don't have to remember to call four functions separately."""
    return {
        "wape": round(wape(actual, predicted), 4),
        "mape_pct": round(mape(actual, predicted), 4),
        "mpe_pct": round(mpe(actual, predicted), 4),
        "mase": round(mase(actual, predicted, train), 4),
    }


# ── Train / holdout split ─────────────────────────────────────────────────────

# One full seasonal cycle — this diocese's collections have strong yearly
# liturgical seasonality (Christmas, Holy Week), so a holdout shorter than 12
# months risks missing a season entirely, and a longer one wastes data that
# would be better spent training. Anchoring the holdout at a fixed size
# (rather than a fixed percentage) means every additional month submitted in
# the future goes to training instead of being split off at a fixed ratio
# forever.
DEFAULT_HOLDOUT_MONTHS = 12
MIN_TRAIN_MONTHS = 3


def train_test_split_ts(
    series: np.ndarray,
    holdout_months: int = DEFAULT_HOLDOUT_MONTHS,
    min_train_months: int = MIN_TRAIN_MONTHS,
) -> tuple[np.ndarray, np.ndarray]:
    n = len(series)
    max_holdout = max(1, n - min_train_months)
    holdout = min(holdout_months, max_holdout)
    split = n - holdout
    return series[:split], series[split:]


def walk_forward_folds(
    series: np.ndarray,
    holdout_months: int = DEFAULT_HOLDOUT_MONTHS,
    min_train_months: int = MIN_TRAIN_MONTHS,
    max_folds: int = 2,
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Chronological, EARLIER folds only, oldest first — never shuffled,
    since a model trained on future months to predict past ones would be
    leaking, not validating. Deliberately does NOT include the most recent
    window (the one train_test_split_ts already produces): this is meant to
    be passed straight in as select_champion's `extra_folds`, so
    `[(train, holdout)] + walk_forward_folds(series)` never scores the same
    window twice. Each earlier fold requires a FULL holdout_months window
    and generation stops once the series runs out of room for one — so the
    fold *count* scales automatically with how much history a given
    institution has (a fledgling institution gets 0 extra folds, a
    long-submitting one gets up to max_folds) without needing separate
    tuning per institution. `max_folds` caps how many EXTRA folds are added
    on top of the real holdout (default 2, so up to 3 windows are scored in
    total once combined with the real holdout in select_champion)."""
    n = len(series)
    max_holdout = max(1, n - min_train_months)
    most_recent_holdout = min(holdout_months, max_holdout)
    cursor = n - most_recent_holdout  # where the most-recent (already-covered) fold's train begins

    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for _ in range(max_folds):
        holdout = holdout_months  # earlier folds must be a full season, or we stop rather than degrade quality
        start = cursor - holdout
        if start < min_train_months or holdout <= 0:
            break
        folds.append((series[:start], series[start:cursor]))
        cursor = start
    folds.reverse()
    return folds


# ── Generalization diagnostic (overfitting / underfitting) ────────────────────
#
# WAPE on the real holdout says how a candidate did on one specific unseen
# window, but not whether that performance would hold on a DIFFERENT unseen
# window — a model can simply get lucky (or unlucky) on the one holdout it's
# scored against. Classical "training-set error" doesn't answer this either,
# and is actively misleading for exactly the candidates most prone to
# overfitting: XGBoost can fit its own training data almost perfectly
# regardless of genuine skill, so an in-sample-vs-holdout gap would look
# alarming for every XGBoost candidate whether or not it actually overfits.
#
# Instead, this carves a SECOND, nested holdout out of the training window
# itself and reuses the exact same trainer callable already used for real
# champion selection — no per-model special-casing needed for the different
# statsmodels/Prophet/XGBoost/Markov internals. Comparing WAPE on this
# nested window against WAPE on the real holdout reveals whether performance
# is *stable* across different unseen periods (Just Right), *unstable* —
# good on one window, bad on the other (Overfitting: the candidate has
# picked up incidental structure specific to whichever data it's fed rather
# than a genuine pattern), or *uniformly poor* on both (Underfitting: the
# model isn't capturing the pattern at all, not just having a bad day).

_OVERFIT_RELATIVE_GAP = 0.5  # |real_wape - nested_wape| / nested_wape beyond this -> unstable across windows
_UNDERFIT_WAPE_FLOOR = 0.30  # both windows this bad -> the model isn't fitting, not just unlucky


def diagnose_generalization(
    trainer: Callable[[np.ndarray, np.ndarray], np.ndarray],
    train: np.ndarray,
    holdout: np.ndarray,
    nested_holdout_months: int = DEFAULT_HOLDOUT_MONTHS,
    min_train_months: int = MIN_TRAIN_MONTHS,
) -> dict[str, Any] | None:
    """None when `train` is too short to carve out a nested holdout on top of
    the real one — diagnosing generalization needs its own held-back slice,
    distinct from both the data actually used for the live forecast and the
    real holdout already scored elsewhere."""
    n = len(train)
    nested_size = min(nested_holdout_months, max(0, n - min_train_months))
    if nested_size <= 0:
        return None

    nested_train = train[:-nested_size]
    nested_holdout = train[-nested_size:]

    try:
        nested_wape = wape(nested_holdout, trainer(nested_train, nested_holdout))
        real_wape = wape(holdout, trainer(train, holdout))
    except Exception:
        return None

    gap = real_wape - nested_wape
    relative_gap = (gap / nested_wape) if nested_wape > 0 else (0.0 if gap == 0 else float("inf"))

    if nested_wape >= _UNDERFIT_WAPE_FLOOR and real_wape >= _UNDERFIT_WAPE_FLOOR:
        diagnosis = "underfitting"
    elif abs(relative_gap) > _OVERFIT_RELATIVE_GAP:
        diagnosis = "overfitting"
    else:
        diagnosis = "just_right"

    return {
        "nested_wape": round(nested_wape, 4),
        "real_holdout_wape": round(real_wape, 4),
        "gap": round(gap, 4),
        "diagnosis": diagnosis,
    }


# ── Result cache (content-addressed by data fingerprint) ──────────────────────

_cache: dict[str, tuple[str, dict[str, float]]] = {}
_cache_lock = threading.Lock()
_MAX_CACHE_ENTRIES = 512  # ~512 institution × series combinations


def _fingerprint(folds: list[tuple[np.ndarray, np.ndarray]]) -> str:
    combined = np.concatenate([arr for fold in folds for arr in fold])
    return hashlib.md5(combined.tobytes()).hexdigest()


def _cache_get(fp: str) -> tuple[str, dict[str, float]] | None:
    with _cache_lock:
        return _cache.get(fp)


def _cache_set(fp: str, result: tuple[str, dict[str, float]]) -> None:
    with _cache_lock:
        if len(_cache) >= _MAX_CACHE_ENTRIES:
            oldest = next(iter(_cache))
            del _cache[oldest]
        _cache[fp] = result


def clear_champion_cache() -> None:
    """Explicitly wipe all cached results (e.g. after a bulk data migration)."""
    with _cache_lock:
        _cache.clear()


# ── Per-model worker ──────────────────────────────────────────────────────────

_MODEL_TIMEOUT_S = 90  # per-model-per-fold wall-clock timeout


def _evaluate_candidate(
    name: str,
    trainer: Callable[[np.ndarray, np.ndarray], np.ndarray],
    folds: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[str, float]:
    """Train one candidate on every fold and return its (name, average WAPE
    across folds). A candidate that fails on even one fold scores worst-case
    for the whole thing — a model that can't fit one window of this
    institution's history isn't a reliable champion, even if it did fine on
    another. Never raises."""
    try:
        fold_wapes = [wape(f_holdout, trainer(f_train, f_holdout)) for f_train, f_holdout in folds]
        return name, round(float(np.mean(fold_wapes)), 6)
    except Exception:
        return name, 9999.0


# ── Parallel champion selection ───────────────────────────────────────────────


def select_champion(
    candidates: dict[str, Callable[[np.ndarray, np.ndarray], np.ndarray]],
    train: np.ndarray,
    holdout: np.ndarray,
    extra_folds: list[tuple[np.ndarray, np.ndarray]] | None = None,
) -> tuple[str, dict[str, float]]:
    """
    Run all candidate models simultaneously (one thread each) and return the
    champion plus every model's WAPE score.

    `extra_folds` (see walk_forward_folds) adds earlier chronological
    holdout windows on top of the real one — when given, each candidate's
    score is the AVERAGE WAPE across every fold rather than a single
    holdout's WAPE, a more robust signal that isn't swayed by one window
    happening to be unusually easy or hard for a given candidate. Omit (or
    pass an empty list) to keep the original single-holdout behavior —
    exactly what happens automatically for institutions too short on
    history to support extra folds.

    Subsequent calls with identical fold data return from cache immediately
    — models only re-run when the underlying data has changed.

    Returns: (champion_name, {model_name: average_wape_score})
    """
    folds = [(train, holdout)] + (extra_folds or [])
    fp = _fingerprint(folds)
    cached = _cache_get(fp)
    if cached is not None:
        return cached

    scores: dict[str, float] = {}

    with ThreadPoolExecutor(max_workers=len(candidates)) as pool:
        future_to_name = {
            pool.submit(_evaluate_candidate, name, trainer, folds): name for name, trainer in candidates.items()
        }
        for future in as_completed(
            future_to_name,
            timeout=_MODEL_TIMEOUT_S * len(folds) * len(candidates),
        ):
            model_name = future_to_name[future]
            try:
                _, score = future.result(timeout=_MODEL_TIMEOUT_S * len(folds))
                scores[model_name] = score
            except (FuturesTimeoutError, Exception):
                scores[model_name] = 9999.0

    # Safety: any model that never completed gets worst-case score
    for name in candidates:
        scores.setdefault(name, 9999.0)

    champion = min(scores, key=lambda k: scores[k])
    result = (champion, scores)
    _cache_set(fp, result)
    return result


# ── Markov Chain helpers ──────────────────────────────────────────────────────


def _bin_series(series: np.ndarray, n_bins: int = 5) -> np.ndarray:
    percentiles = np.linspace(0, 100, n_bins + 1)
    edges = np.percentile(series, percentiles)
    edges[-1] += 1e-9
    return np.digitize(series, edges[1:-1])


def markov_transition_matrix(series: np.ndarray, n_states: int = 5) -> np.ndarray:
    states = _bin_series(series, n_bins=n_states)
    matrix = np.zeros((n_states, n_states))
    for i in range(len(states) - 1):
        s_from = max(0, min(n_states - 1, states[i] - 1))
        s_to = max(0, min(n_states - 1, states[i + 1] - 1))
        matrix[s_from, s_to] += 1
    row_sums = matrix.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    return matrix / row_sums


def markov_forecast(
    train: np.ndarray,
    holdout: np.ndarray,
    n_states: int = 5,
) -> np.ndarray:
    n = len(holdout)
    if len(train) < 4:
        return np.full(n, float(np.mean(train)))

    states = _bin_series(train, n_bins=n_states)
    matrix = markov_transition_matrix(train, n_states=n_states)
    percentile_edges = np.percentile(train, np.linspace(0, 100, n_states + 1))

    def state_mean(state_idx: int) -> float:
        lo = percentile_edges[state_idx]
        hi = percentile_edges[state_idx + 1]
        vals = train[(train >= lo) & (train <= hi)]
        return float(np.mean(vals)) if len(vals) > 0 else float(np.mean(train))

    current_state = max(0, min(n_states - 1, int(states[-1]) - 1))
    preds: list[float] = []
    for _ in range(n):
        next_state = int(np.argmax(matrix[current_state]))
        preds.append(state_mean(next_state))
        current_state = next_state

    return np.array(preds)
