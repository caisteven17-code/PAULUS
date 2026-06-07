"""
Shared data loading and feature engineering used by all three model scripts.
"""

import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
import joblib

MONTH_ORDER = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)


def load_data(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)

    df["month_num"] = df["month"].map({m: i + 1 for i, m in enumerate(MONTH_ORDER)})

    le = LabelEncoder()
    df["parish_id"] = le.fit_transform(df["parish_name"])
    joblib.dump(le, os.path.join(MODELS_DIR, "parish_label_encoder.joblib"))

    receipt_cols = [
        "collections_mass", "collections_other", "collections_other_receipts",
        "sacraments_arancel", "sacraments_parish_share", "sacraments_over_above",
    ]
    for col in receipt_cols:
        if col not in df.columns:
            df[col] = np.nan
    df["total_receipts_derived"] = df[receipt_cols].sum(axis=1, min_count=1)

    if "total_receipts" in df.columns:
        df["total_receipts_final"] = df["total_receipts"].combine_first(df["total_receipts_derived"])
    else:
        df["total_receipts_final"] = df["total_receipts_derived"]

    expense_cols = ["expenses_pastoral", "expenses_parish"]
    for col in expense_cols:
        if col not in df.columns:
            df[col] = np.nan
    df["total_expenses_derived"] = df[expense_cols].sum(axis=1, min_count=1)

    if "total_expenses" in df.columns:
        df["total_expenses_final"] = df["total_expenses"].combine_first(df["total_expenses_derived"])
    else:
        df["total_expenses_final"] = df["total_expenses_derived"]

    if "net_receipts_deficit" not in df.columns or df["net_receipts_deficit"].isna().all():
        df["net_receipts_deficit"] = df["total_receipts_final"] - df["total_expenses_final"]

    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["parish_id", "year", "month_num"]).reset_index(drop=True)

    df["month_sin"] = np.sin(2 * np.pi * df["month_num"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month_num"] / 12)

    df["sacraments_rate"] = (
        df.groupby("parish_id")["sacraments_rate"]
        .transform(lambda x: x.fillna(x.median()))
        .fillna(df["sacraments_rate"].median())
    )

    for lag in [1, 2, 3]:
        df[f"collections_lag{lag}"] = (
            df.groupby("parish_id")["total_receipts_final"].shift(lag)
        )

    df["collections_roll3"] = (
        df.groupby("parish_id")["total_receipts_final"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    )

    df["collections_mom_growth"] = (
        df.groupby("parish_id")["total_receipts_final"]
        .pct_change()
        .clip(-2, 2)
    )

    denom = df["total_receipts_final"].replace(0, np.nan)
    df["net_margin"] = df["net_receipts_deficit"] / denom

    df["parish_mean_collections"] = (
        df.groupby("parish_id")["total_receipts_final"].transform("mean")
    )
    df["parish_std_collections"] = (
        df.groupby("parish_id")["total_receipts_final"].transform("std").fillna(0)
    )

    df["collections_zscore"] = (
        (df["total_receipts_final"] - df["parish_mean_collections"])
        / df["parish_std_collections"].replace(0, np.nan)
    ).fillna(0)

    return df
