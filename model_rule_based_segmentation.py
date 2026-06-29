"""
Rule-Based Parish Segmentation
================================
Tier  : Descriptive Analytics
Uses  : Parish Cluster (assign cluster based on financial rules)
KPI   : Cluster Purity, Rule Coverage Rate (%)

Clusters are defined by collection volume and net margin thresholds.
Segments each parish into one of four clusters:
  A -- High collection, positive net margin
  B -- High collection, negative net margin
  C -- Low collection, positive net margin
  D -- Low collection, negative net margin

Thresholds are derived from median splits (adjust per diocese data).

Run: python model_rule_based_segmentation.py

INSTRUCTIONS
------------
Status  : [runs now] — no extra columns needed beyond the base CSV
Step 1  : pip install pandas numpy joblib
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, total_receipts_final,
            total_expenses_final  (used to compute net_margin)
Step 3  : python model_rule_based_segmentation.py
Output  : models/rule_based_segmentation.joblib
          Contains: collection threshold, margin threshold,
          and cluster assignment per parish.
KPI tip : Rule Coverage Rate should be 100% (every parish assigned a
          cluster A–D).  "Unknown" assignments mean a row has null values
          in total_receipts_final or net_margin — fill those cells first.
Clusters:
    A — High collection + positive net margin  (strong parishes)
    B — High collection + negative net margin  (high-spend parishes)
    C — Low collection  + positive net margin  (lean but balanced)
    D — Low collection  + negative net margin  (at-risk parishes)
Note    : Thresholds are median-splits by default.  To use fixed diocese
          thresholds instead, replace the median calculation in train()
          with your own values for col_threshold and margin_threshold.
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib

from utils import load_data, engineer_features, print_metric_table, MODELS_DIR

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview


def assign_cluster(row: pd.Series,
                   col_threshold: float,
                   margin_threshold: float = 0.0) -> str:
    col    = row.get("total_receipts_final", np.nan)
    margin = row.get("net_margin", np.nan)

    if pd.isna(col) or pd.isna(margin):
        return "Unknown"

    high_col = col >= col_threshold
    pos_margin = margin >= margin_threshold

    if high_col and pos_margin:
        return "A"
    if high_col and not pos_margin:
        return "B"
    if not high_col and pos_margin:
        return "C"
    return "D"


def train(df: pd.DataFrame) -> None:
    # Compute per-parish annual average collections
    parish_agg = (
        df.groupby("parish_name")["total_receipts_final"]
        .mean()
        .reset_index()
        .rename(columns={"total_receipts_final": "avg_collections"})
    )

    parish_net = (
        df.groupby("parish_name")["net_margin"]
        .mean()
        .reset_index()
        .rename(columns={"net_margin": "avg_net_margin"})
    )

    summary = parish_agg.merge(parish_net, on="parish_name")

    # Median split thresholds
    col_threshold    = summary["avg_collections"].median()
    margin_threshold = 0.0

    print(f"Collection threshold (median): {col_threshold:,.0f}")
    print(f"Net margin threshold:          {margin_threshold:.0%}\n")

    summary["cluster"] = summary.apply(
        lambda r: assign_cluster(
            {"total_receipts_final": r["avg_collections"],
             "net_margin":           r["avg_net_margin"]},
            col_threshold,
            margin_threshold,
        ),
        axis=1,
    )

    print_metric_table(
        summary,
        columns=["parish_name", "avg_collections", "avg_net_margin", "cluster"],
        decimal_cols={"avg_collections": 2},
    )

    dist = summary["cluster"].value_counts()
    coverage = (summary["cluster"] != "Unknown").sum() / len(summary) * 100
    print(f"\nCluster distribution:\n{dist.to_string()}")
    print(f"\nRule Coverage Rate: {coverage:.1f}%")

    out = os.path.join(MODELS_DIR, "rule_based_segmentation.joblib")
    joblib.dump({
        "col_threshold":    col_threshold,
        "margin_threshold": margin_threshold,
        "assignments":      summary.to_dict(orient="records"),
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Rule-Based Parish Segmentation -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Rule-Based Segmentation", df)
