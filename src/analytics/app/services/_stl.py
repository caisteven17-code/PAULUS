"""Shared STL-decomposition helper.

financial_trend.py and seasonality_trend.py each carried their own copy of
this exact logic (same period-12 robust STL, same short-series fallback) —
one source keeps the two from drifting apart, and lets the parish-quadrant
clustering reuse the identical residual definition instead of adding a third
copy.
"""

from __future__ import annotations

import pandas as pd


def run_stl(series: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Run STL decomposition; return (trend, seasonal, residual)."""
    from statsmodels.tsa.seasonal import STL

    n = len(series)
    # STL requires at least 2 full seasonal cycles; fallback to linear trend
    if n < 24:
        trend = series.rolling(window=max(1, n // 3), center=True, min_periods=1).mean()
        seasonal = pd.Series(0.0, index=series.index)
        residual = series - trend
        return trend, seasonal, residual

    stl = STL(series, period=12, robust=True)
    result = stl.fit()
    return (
        pd.Series(result.trend, index=series.index),
        pd.Series(result.seasonal, index=series.index),
        pd.Series(result.resid, index=series.index),
    )


def run_stl_residuals(series: pd.Series) -> pd.Series:
    """Residual component only — for callers that don't need trend/seasonal."""
    _, _, residual = run_stl(series)
    return residual
