"""
BOCPD  (Bayesian Online Change Point Detection)
================================================
Tier  : Predictive Analytics / Diagnostic Analytics
Uses  : Financial Forecast (change point detection component)
        Cluster and Seasonal Diagnostic
        Project Risk Diagnostic
Target: Identifies time steps where collection/disbursement regime shifts
KPI   : Change Point Detection Rate (%)

Uses the BOCD algorithm (Adams & MacKay 2007) with a Gaussian likelihood
and an exponential prior on run length.

Run: python model_bocpd.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install scipy pandas numpy joblib
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num, total_receipts_final
Step 3  : python model_bocpd.py
Output  : models/bocpd.joblib
          Contains: per-parish change point list, hazard rate, threshold.
KPI tip : Change Point Detection Rate is printed.  A very high rate
          (> 50%) may mean HAZARD is too low — increase it at the top of
          the file (default 1/12).  A rate of 0% means no regime shifts
          were detected.
Note    : Parishes with fewer than 4 filled months are skipped.
          This runs fast and can be used as a diagnostic companion to
          model_change_point_detection.py (which uses the ruptures library).
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from scipy.stats import norm

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

HAZARD      = 1 / 12   # expected run length = 12 months (one year)
THRESHOLD   = 0.5      # posterior probability threshold to flag a change point


class GaussianUnknownMean:
    """Conjugate Bayesian Gaussian with unknown mean and known precision."""

    def __init__(self, prior_mean=0, prior_var=1e6, noise_var=1.0):
        self.prior_mean  = prior_mean
        self.prior_var   = prior_var
        self.noise_var   = noise_var
        self._sum  = np.array([prior_mean / prior_var])
        self._prec = np.array([1.0 / prior_var])

    def pdf(self, data: float) -> np.ndarray:
        post_mean = self._sum / self._prec
        post_var  = 1.0 / self._prec + self.noise_var
        return norm.pdf(data, post_mean, np.sqrt(post_var))

    def update(self, data: float) -> None:
        new_prec  = self._prec + 1.0 / self.noise_var
        new_sum   = self._sum  + data / self.noise_var
        self._prec = np.append(self._prec, 1.0 / self.prior_var)
        self._sum  = np.append(self._sum,  self.prior_mean / self.prior_var)
        self._prec[:-1] = new_prec
        self._sum [:-1] = new_sum


def bocpd(series: np.ndarray, hazard: float = HAZARD) -> np.ndarray:
    """
    Returns posterior probability of a change point at each time step.
    Shape: (T,)
    """
    T   = len(series)
    R   = np.zeros((T + 1, T + 1))   # run-length distribution
    R[0, 0] = 1.0
    noise_var = np.var(series) if np.var(series) > 0 else 1.0
    model = GaussianUnknownMean(
        prior_mean=np.mean(series),
        prior_var=noise_var * 100,
        noise_var=noise_var,
    )
    change_probs = np.zeros(T)

    for t in range(1, T + 1):
        x = series[t - 1]
        pred = model.pdf(x)

        R[t, 1:t + 1] = R[t - 1, 0:t] * pred * (1 - hazard)
        R[t, 0]       = np.sum(R[t - 1, 0:t] * pred * hazard)
        R[t]         /= R[t].sum() + 1e-10

        change_probs[t - 1] = R[t, 0]
        model.update(x)

    return change_probs


def train(df: pd.DataFrame, target: str = "total_receipts_final") -> None:
    parishes = df["parish_name"].unique()
    all_results = []

    for parish in parishes:
        series = (
            df[df["parish_name"] == parish]
            .sort_values(["year", "month_num"])[target]
            .dropna()
            .values
        )
        if len(series) < 4:
            continue

        probs = bocpd(series)
        change_points = np.where(probs > THRESHOLD)[0]

        all_results.append({
            "parish": parish,
            "n_months": len(series),
            "change_points_at_months": list(change_points + 1),
            "n_change_points": len(change_points),
        })

    if not all_results:
        print("[SKIP] Not enough data -- need at least 4 filled months per parish.")
        return

    results_df = pd.DataFrame(all_results)
    print(results_df[["parish", "n_months", "n_change_points"]].to_string(index=False))

    detected = results_df["n_change_points"].sum()
    total    = results_df["n_months"].sum()
    rate     = detected / total * 100 if total > 0 else 0
    print(f"\nChange Point Detection Rate: {rate:.1f}%")

    out = os.path.join(MODELS_DIR, "bocpd.joblib")
    joblib.dump({
        "results": all_results,
        "hazard": HAZARD,
        "threshold": THRESHOLD,
        "target": target,
    }, out)
    print(f"Saved -> {out}")


if __name__ == "__main__":
    print("BOCPD -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("BOCPD", df)
