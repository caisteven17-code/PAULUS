"""
Time Series Decomposition
==========================
Tier  : Descriptive Analytics
Uses  : Financial Trend (trend + seasonality extraction)
        Pastoral Assignment Analysis (assignment period trend)
        Seasonality Trend (seasonal component per liturgical event)
KPI   : Annual Collection Growth Rate, Month-over-Month Collection Change,
        Disbursement-to-Collection Ratio, Net Receipt Deficit Rate

Decomposes collection series into Trend + Seasonal + Residual.
Saves decomposition results and summary statistics per parish.

Run: python model_time_series_decomposition.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install statsmodels pandas numpy joblib
Step 2  : Make sure parishes_financial_records_2023.csv is in the same
          folder and has these columns filled in:
            parish_name, month_num,
            total_receipts_final, total_expenses_final, net_receipts_deficit
Step 3  : python model_time_series_decomposition.py
Output  : models/time_series_decomposition.joblib
          Contains: per-parish KPI summaries + trend/seasonal/residual
          components for parishes with >= 12 months of data.
KPI tip : Parishes are flagged if:
            annual_growth_pct   < -11.38%
            disb_to_col_ratio   > 93.47%
            net_deficit_rate    > 46.83%
          These thresholds come from the KPI diagram — adjust them at
          the bottom of the train() function if your diocese uses different
          benchmarks.
Note    : Parishes with fewer than 4 months are skipped.
          STL decomposition (preferred) requires >= 12 months; shorter
          series fall back to additive seasonal_decompose.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from statsmodels.tsa.seasonal import seasonal_decompose, STL

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
CSV_PATH = os.path.join(os.path.dirname(__file__), "parishes_financial_records_2023.csv")

MIN_PERIODS = 12   # STL needs >= 2 full seasonal cycles ideally; minimum 1


def growth_rate(series: pd.Series) -> float:
    """Annual collection growth rate = (last - first) / first."""
    clean = series.dropna()
    if len(clean) < 2 or clean.iloc[0] == 0:
        return np.nan
    return (clean.iloc[-1] - clean.iloc[0]) / abs(clean.iloc[0]) * 100


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    summaries = []
    decomps   = {}

    for parish in parishes:
        p = df[df["parish_name"] == parish].sort_values("month_num")
        series = p[target].dropna()

        if len(series) < 4:
            continue

        # KPI: collection growth rate
        annual_growth = growth_rate(series)

        # KPI: disbursement-to-collection ratio
        disb   = p["total_expenses_final"].dropna()
        d2c    = (disb.sum() / series.sum() * 100) if series.sum() > 0 else np.nan

        # KPI: net receipt deficit rate (months with deficit / total months)
        net    = p["net_receipts_deficit"].dropna()
        ndr    = (net < 0).sum() / len(net) * 100 if len(net) > 0 else np.nan

        # KPI: MoM change
        mom    = series.pct_change().mean() * 100 if len(series) >= 2 else np.nan

        summaries.append({
            "parish":              parish,
            "n_months":            len(series),
            "annual_growth_pct":   round(annual_growth, 2) if not np.isnan(annual_growth) else None,
            "disb_to_col_ratio_%": round(d2c, 2)  if not np.isnan(d2c)    else None,
            "net_deficit_rate_%":  round(ndr, 2)  if not np.isnan(ndr)    else None,
            "mom_change_%":        round(mom, 2)  if not np.isnan(mom)    else None,
        })

        # Decompose if enough data
        if len(series) >= MIN_PERIODS:
            try:
                result = STL(series, period=12, robust=True).fit()
                decomps[parish] = {
                    "trend":    result.trend.tolist(),
                    "seasonal": result.seasonal.tolist(),
                    "resid":    result.resid.tolist(),
                }
            except Exception:
                try:
                    result = seasonal_decompose(series, model="additive", period=min(6, len(series)//2))
                    decomps[parish] = {
                        "trend":    result.trend.dropna().tolist(),
                        "seasonal": result.seasonal.tolist(),
                        "resid":    result.resid.dropna().tolist(),
                    }
                except Exception:
                    pass

    if not summaries:
        print("[SKIP] Not enough data -- need filled financial values.")
        return

    summary_df = pd.DataFrame(summaries)
    print(summary_df.to_string(index=False))

    # Flag parishes outside KPI thresholds from the diagram
    flagged = summary_df[
        (summary_df["annual_growth_pct"].fillna(0) < -11.38) |
        (summary_df["disb_to_col_ratio_%"].fillna(0) > 93.47) |
        (summary_df["net_deficit_rate_%"].fillna(0) > 46.83)
    ]
    if not flagged.empty:
        print(f"\n[!] {len(flagged)} parishes flagged outside KPI thresholds:")
        print(flagged["parish"].tolist())

    out = os.path.join(MODELS_DIR, "time_series_decomposition.joblib")
    joblib.dump({"summaries": summaries, "decompositions": decomps, "target": target}, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Time Series Decomposition -- Training\n")
    df = load_data(CSV_PATH)
    df = engineer_features(df)
    train(df)
