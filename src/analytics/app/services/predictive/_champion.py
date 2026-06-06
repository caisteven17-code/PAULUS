"""
Shared champion model selection utilities for all predictive services.

Selection protocol:
  1. Split series: first 80% train, last 20% holdout.
  2. All candidate models run simultaneously in a thread pool (one thread per model).
     Prophet, SARIMA, XGBoost, and statsmodels all release the GIL during heavy
     computation, so ThreadPoolExecutor gives genuine parallelism here.
  3. Champion = lowest WAPE on the holdout set.
  4. Results are cached by data fingerprint (MD5 of train+holdout bytes).
     Same data → instant return. Different data (new submissions) → re-runs
     automatically without any explicit invalidation step needed.

WAPE = sum(|actual - predicted|) / sum(|actual|)
"""

from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Callable

import numpy as np


# ── WAPE ──────────────────────────────────────────────────────────────────────

def wape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denom = float(np.sum(np.abs(actual)))
    if denom == 0:
        return 1.0
    return float(np.sum(np.abs(actual - predicted))) / denom


# ── Train / holdout split ─────────────────────────────────────────────────────

def train_test_split_ts(
    series: np.ndarray,
    train_pct: float = 0.8,
) -> tuple[np.ndarray, np.ndarray]:
    n     = len(series)
    split = max(3, int(n * train_pct))
    return series[:split], series[split:]


# ── Result cache (content-addressed by data fingerprint) ──────────────────────

_cache: dict[str, tuple[str, dict[str, float]]] = {}
_cache_lock = threading.Lock()
_MAX_CACHE_ENTRIES = 512  # ~512 institution × series combinations


def _fingerprint(train: np.ndarray, holdout: np.ndarray) -> str:
    combined = np.concatenate([train, holdout])
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

_MODEL_TIMEOUT_S = 90  # per-model wall-clock timeout


def _evaluate_candidate(
    name: str,
    trainer: Callable[[np.ndarray, np.ndarray], np.ndarray],
    train: np.ndarray,
    holdout: np.ndarray,
) -> tuple[str, float]:
    """Train one candidate and return its (name, WAPE). Never raises."""
    try:
        preds = trainer(train, holdout)
        return name, round(wape(holdout, preds), 6)
    except Exception:
        return name, 9999.0


# ── Parallel champion selection ───────────────────────────────────────────────

def select_champion(
    candidates: dict[str, Callable[[np.ndarray, np.ndarray], np.ndarray]],
    train: np.ndarray,
    holdout: np.ndarray,
) -> tuple[str, dict[str, float]]:
    """
    Run all candidate models simultaneously (one thread each) and return the
    champion plus every model's WAPE score.

    Subsequent calls with identical training/holdout data return from cache
    immediately — models only re-run when the underlying data has changed.

    Returns: (champion_name, {model_name: wape_score})
    """
    fp = _fingerprint(train, holdout)
    cached = _cache_get(fp)
    if cached is not None:
        return cached

    scores: dict[str, float] = {}

    with ThreadPoolExecutor(max_workers=len(candidates)) as pool:
        future_to_name = {
            pool.submit(_evaluate_candidate, name, trainer, train, holdout): name
            for name, trainer in candidates.items()
        }
        for future in as_completed(
            future_to_name,
            timeout=_MODEL_TIMEOUT_S * len(candidates),
        ):
            model_name = future_to_name[future]
            try:
                _, score = future.result(timeout=_MODEL_TIMEOUT_S)
                scores[model_name] = score
            except (FuturesTimeoutError, Exception):
                scores[model_name] = 9999.0

    # Safety: any model that never completed gets worst-case score
    for name in candidates:
        scores.setdefault(name, 9999.0)

    champion = min(scores, key=lambda k: scores[k])
    result   = (champion, scores)
    _cache_set(fp, result)
    return result


# ── Markov Chain helpers ──────────────────────────────────────────────────────

def _bin_series(series: np.ndarray, n_bins: int = 5) -> np.ndarray:
    percentiles = np.linspace(0, 100, n_bins + 1)
    edges       = np.percentile(series, percentiles)
    edges[-1]  += 1e-9
    return np.digitize(series, edges[1:-1])


def markov_transition_matrix(series: np.ndarray, n_states: int = 5) -> np.ndarray:
    states = _bin_series(series, n_bins=n_states)
    matrix = np.zeros((n_states, n_states))
    for i in range(len(states) - 1):
        s_from = max(0, min(n_states - 1, states[i] - 1))
        s_to   = max(0, min(n_states - 1, states[i + 1] - 1))
        matrix[s_from, s_to] += 1
    row_sums            = matrix.sum(axis=1, keepdims=True)
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

    states           = _bin_series(train, n_bins=n_states)
    matrix           = markov_transition_matrix(train, n_states=n_states)
    percentile_edges = np.percentile(train, np.linspace(0, 100, n_states + 1))

    def state_mean(state_idx: int) -> float:
        lo   = percentile_edges[state_idx]
        hi   = percentile_edges[state_idx + 1]
        vals = train[(train >= lo) & (train <= hi)]
        return float(np.mean(vals)) if len(vals) > 0 else float(np.mean(train))

    current_state = max(0, min(n_states - 1, int(states[-1]) - 1))
    preds: list[float] = []
    for _ in range(n):
        next_state = int(np.argmax(matrix[current_state]))
        preds.append(state_mean(next_state))
        current_state = next_state

    return np.array(preds)
