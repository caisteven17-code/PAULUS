"""
Shared data loading and feature engineering used by the model scripts.
"""

import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
import joblib
import re
from collections.abc import Sequence

MONTH_ORDER = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

DEFAULT_WORKBOOK_NAMES = (
    "2023.xlsx",
    "2024.xlsx",
    "2025.xlsx",
)
DEFAULT_LITURGICAL_CALENDAR = "liturgical_calendar_rows.csv"

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


def load_data(source_path: str | Sequence[str] | None = None) -> pd.DataFrame:
    df = _load_source_data(source_path)

    if "month_num" not in df.columns:
        if "month" not in df.columns:
            raise KeyError(
                "Input data must contain either 'month' or 'month_num'. "
                "If you are using raw Excel workbooks, keep the annual .xlsx files "
                "in this folder."
            )
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

    df = add_liturgical_calendar_features(df, source_path)

    return df


def add_liturgical_calendar_features(df: pd.DataFrame,
                                     source_path: str | Sequence[str] | None = None) -> pd.DataFrame:
    calendar_path = _find_liturgical_calendar_path(source_path)
    if calendar_path is None:
        return _ensure_liturgical_feature_columns(df)

    calendar_features = _load_liturgical_calendar_features(calendar_path)
    if calendar_features.empty:
        return _ensure_liturgical_feature_columns(df)

    merged = df.merge(calendar_features, on=["year", "month_num"], how="left")
    return _ensure_liturgical_feature_columns(merged)


def _find_liturgical_calendar_path(source_path: str | Sequence[str] | None = None) -> str | None:
    candidate_dirs = [os.path.dirname(__file__)]

    if source_path is not None and not (
        isinstance(source_path, Sequence) and not isinstance(source_path, (str, bytes, os.PathLike))
    ):
        source_text = str(source_path)
        candidate_dirs.append(source_text if os.path.isdir(source_text) else (os.path.dirname(source_text) or "."))

    for base_dir in _unique_paths(candidate_dirs):
        candidate = os.path.join(base_dir, DEFAULT_LITURGICAL_CALENDAR)
        if os.path.exists(candidate):
            return candidate
    return None


def _load_liturgical_calendar_features(calendar_path: str) -> pd.DataFrame:
    calendar = pd.read_csv(calendar_path)
    required = {"year", "month", "rank", "liturgical_season"}
    missing = required.difference(calendar.columns)
    if missing:
        raise KeyError(f"{DEFAULT_LITURGICAL_CALENDAR} is missing columns: {sorted(missing)}")

    calendar = calendar.copy()
    calendar["month_num"] = pd.to_numeric(calendar["month"], errors="coerce")
    calendar["year"] = pd.to_numeric(calendar["year"], errors="coerce")
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
        calendar["liturgical_solemnity_days"]
        + calendar["liturgical_feast_days"]
        + calendar["liturgical_sunday_days"]
    )
    calendar["liturgical_penitential_days"] = (
        calendar["liturgical_lent_days"]
        + calendar["liturgical_triduum_days"]
    )

    return (
        calendar
        .dropna(subset=["year", "month_num"])
        .groupby(["year", "month_num"], as_index=False)[LITURGICAL_FEATURE_COLUMNS]
        .sum()
    )


def _ensure_liturgical_feature_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in LITURGICAL_FEATURE_COLUMNS:
        if col not in df.columns:
            df[col] = 0
        df[col] = df[col].fillna(0)
    return df


def _load_source_data(source_path: str | Sequence[str] | None = None) -> pd.DataFrame:
    if source_path is None:
        workbook_paths = _find_fallback_workbooks(os.path.dirname(__file__))
        if workbook_paths:
            return _load_raw_workbooks(workbook_paths)
        print("[INFO] No annual Excel workbooks found. Using synthetic model-testing data.")
        return _build_synthetic_model_testing_data()

    if isinstance(source_path, Sequence) and not isinstance(source_path, (str, bytes, os.PathLike)):
        return _load_raw_workbooks([str(path) for path in source_path])

    source_path = str(source_path)
    workbook_paths = _find_fallback_workbooks(source_path)

    if os.path.exists(source_path):
        if source_path.lower().endswith((".xlsx", ".xls")):
            return _load_raw_workbooks([source_path])

        df = pd.read_csv(source_path)
        if "month" in df.columns or "month_num" in df.columns:
            return df

    if workbook_paths:
        return _load_raw_workbooks(workbook_paths)

    if os.path.exists(source_path):
        raise KeyError(
            f"{os.path.basename(source_path)} does not have normalized model columns "
            "such as 'month' and 'parish_name'. Use the raw annual Excel workbooks "
            "2023.xlsx, 2024.xlsx, and 2025.xlsx."
        )

    raise FileNotFoundError(source_path)


def _find_fallback_workbooks(csv_path: str) -> list[str]:
    base_dir = csv_path if os.path.isdir(csv_path) else (os.path.dirname(csv_path) or ".")
    annual_paths = [
        os.path.join(base_dir, filename)
        for filename in DEFAULT_WORKBOOK_NAMES
        if os.path.exists(os.path.join(base_dir, filename))
    ]
    annual_paths.extend(_discover_annual_workbooks(base_dir))
    return _unique_paths(sorted(annual_paths))


def _discover_annual_workbooks(base_dir: str) -> list[str]:
    if not os.path.isdir(base_dir):
        return []

    paths = []
    for filename in os.listdir(base_dir):
        if re.fullmatch(r"20\d{2}\.xlsx?", filename, re.IGNORECASE):
            paths.append(os.path.join(base_dir, filename))
    return sorted(paths)


def _unique_paths(paths: Sequence[str]) -> list[str]:
    seen = set()
    unique = []
    for path in paths:
        normalized = os.path.abspath(path).lower()
        if normalized not in seen:
            seen.add(normalized)
            unique.append(path)
    return unique


def _load_raw_workbooks(workbook_paths: Sequence[str]) -> pd.DataFrame:
    frames = []
    for workbook_path in workbook_paths:
        workbook_df = _load_raw_workbook(workbook_path)
        workbook_df["source_workbook"] = os.path.basename(workbook_path)
        frames.append(workbook_df)

    if not frames:
        raise ValueError("No Excel workbooks were provided.")

    df = pd.concat(frames, ignore_index=True)
    return df.drop_duplicates().reset_index(drop=True)


def _build_synthetic_model_testing_data(seed: int = 42) -> pd.DataFrame:
    """Mock Diocese data for model tests before real workbooks are ready."""
    rng = np.random.default_rng(seed)
    parishes = [
        "St. John Paul II Parish, SAN PABLO",
        "Chair of St. Peter Parish, SAN PABLO",
        "Holy Family Parish, SAN PABLO",
        "San Isidro Labrador Parish, CALAMBA",
        "Sta. Rosa De Lima Parish, SANTA ROSA",
        "Our Lady of Guadalupe Parish, PAGSANJAN",
        "Immaculate Conception Parish, LOS BANOS",
        "Christ the King Parish, CABUYAO",
        "San Gabriel Archangel Parish, MAJAYJAY",
        "San Lorenzo Ruiz Parish, SAN PEDRO",
        "St. James the Apostle Parish, PAETE",
        "Mary Help of Christians Parish, CALAUAN",
    ]
    rows = []
    for parish_index, parish_name in enumerate(parishes):
        capacity = rng.uniform(0.72, 1.45)
        expense_ratio = rng.uniform(0.70, 0.98)
        baseline = rng.uniform(2_300_000, 6_700_000) * capacity
        for year in [2023, 2024, 2025]:
            growth = 1 + (year - 2023) * rng.uniform(0.025, 0.07)
            for month_num, month in enumerate(MONTH_ORDER, start=1):
                christmas_lift = 1.65 if month_num == 12 else 1.0
                holy_week_lift = 1.28 if month_num in [3, 4] else 1.0
                fiesta_lift = 1.18 if month_num == ((parish_index % 12) + 1) else 1.0
                collections_mass = max(0, baseline * growth * christmas_lift * holy_week_lift * fiesta_lift * rng.normal(0.72, 0.06))
                collections_other = max(0, baseline * growth * rng.normal(0.11, 0.02))
                collections_other_receipts = max(0, baseline * growth * rng.normal(0.08, 0.02))
                sacraments_arancel = max(0, baseline * growth * rng.normal(0.035, 0.008))
                sacraments_parish_share = max(0, baseline * growth * rng.normal(0.025, 0.006))
                sacraments_over_above = max(0, baseline * growth * rng.normal(0.018, 0.005))
                total_receipts = (
                    collections_mass
                    + collections_other
                    + collections_other_receipts
                    + sacraments_arancel
                    + sacraments_parish_share
                    + sacraments_over_above
                )
                expenses_pastoral = total_receipts * expense_ratio * rng.uniform(0.32, 0.44)
                expenses_parish = total_receipts * expense_ratio * rng.uniform(0.50, 0.62)
                total_expenses = expenses_pastoral + expenses_parish
                net_receipts = total_receipts - total_expenses
                progress = rng.uniform(35, 112)
                budget_vs_target = progress + rng.normal(0, 12)
                schedule_variance = rng.normal(8, 22)
                donor_count = max(12, int(rng.normal(65 + total_receipts / 160_000, 18)))
                project_signal = (
                    -4.4
                    + 0.035 * progress
                    + 0.018 * budget_vs_target
                    - 0.032 * max(schedule_variance, 0)
                    + 0.011 * donor_count
                    + 2.8 * max(net_receipts / total_receipts, -0.2)
                )
                project_success = int(rng.random() < (1 / (1 + np.exp(-project_signal))))
                net_margin = net_receipts / total_receipts if total_receipts else 0
                financial_state = "surplus" if net_margin > 0.12 else "stable" if net_margin > 0.03 else "deficit"
                parish_cluster = "Class A" if net_margin > 0.16 else "Class B" if net_margin > 0.08 else "Class C" if net_margin > 0 else "Class D"
                rows.append(
                    {
                        "parish_name": parish_name,
                        "year": year,
                        "month": month,
                        "month_num": month_num,
                        "sacraments_rate": rng.uniform(0.07, 0.22),
                        "sacraments_arancel": sacraments_arancel,
                        "sacraments_parish_share": sacraments_parish_share,
                        "sacraments_over_above": sacraments_over_above,
                        "collections_mass": collections_mass,
                        "collections_other": collections_other,
                        "collections_other_receipts": collections_other_receipts,
                        "total_receipts": total_receipts,
                        "expenses_pastoral": expenses_pastoral,
                        "expenses_parish": expenses_parish,
                        "total_expenses": total_expenses,
                        "net_receipts_deficit": net_receipts,
                        "mass_intentions_not_claimed": rng.uniform(5_000, 80_000),
                        "mass_intentions_claimed": rng.uniform(5_000, 110_000),
                        "special_collections": rng.uniform(20_000, 450_000),
                        "pastoral_parish_fund_total_net_receipts": net_receipts,
                        "budget_vs_target_pct": budget_vs_target,
                        "fund_raising_progress_pct": progress,
                        "schedule_variance_days": schedule_variance,
                        "donor_count": donor_count,
                        "project_success": project_success,
                        "parish_cluster": parish_cluster,
                        "financial_state": financial_state,
                    }
                )
    return pd.DataFrame(rows)


def _load_raw_workbook(workbook_path: str) -> pd.DataFrame:
    book = pd.ExcelFile(workbook_path)
    frames = []

    for sheet_name in book.sheet_names:
        match = _parse_month_sheet_name(sheet_name, workbook_path)
        if not match:
            continue

        raw = pd.read_excel(book, sheet_name=sheet_name, header=None)
        frames.append(_parse_month_sheet(raw, match["month"], match["year"]))

    if not frames:
        raise ValueError(f"No monthly sheets found in {workbook_path}")

    return pd.concat(frames, ignore_index=True)


def _parse_month_sheet_name(sheet_name: str, workbook_path: str) -> dict[str, int | str] | None:
    cleaned = sheet_name.strip()
    match = re.fullmatch(r"([A-Za-z]+)(?:\s+(\d{4}))?", cleaned)
    if not match or match.group(1) not in MONTH_ORDER:
        return None

    workbook_year = re.search(r"(20\d{2})", os.path.basename(workbook_path))
    year_text = match.group(2) or (workbook_year.group(1) if workbook_year else None)
    if year_text is None:
        return None

    return {"month": match.group(1), "year": int(year_text)}


def _parse_month_sheet(raw: pd.DataFrame, month: str, year: int) -> pd.DataFrame:
    parish_col = _detect_parish_column(raw)
    parsed = pd.DataFrame({
        "parish_name": raw.iloc[:, parish_col],
        "sacraments_rate": _col(raw, parish_col + 1),
        "sacraments_arancel": _col(raw, parish_col + 2),
        "sacraments_parish_share": _col(raw, parish_col + 3),
        "sacraments_over_above": _col(raw, parish_col + 4),
        "collections_mass": _col(raw, parish_col + 5),
        "collections_other": _col(raw, parish_col + 6),
        "collections_other_receipts": _col(raw, parish_col + 7),
        "total_receipts": _col(raw, parish_col + 8),
        "expenses_pastoral": _col(raw, parish_col + 10),
        "expenses_parish": _col(raw, parish_col + 11),
        "total_expenses": _col(raw, parish_col + 12),
        "net_receipts_deficit": _col(raw, parish_col + 13),
        "mass_intentions_not_claimed": _col(raw, parish_col + 15),
        "mass_intentions_claimed": _col(raw, parish_col + 16),
        "special_collections": _col(raw, parish_col + 17),
        "pastoral_parish_fund_total_net_receipts": _col(raw, parish_col + 18),
    })

    parsed["parish_name"] = parsed["parish_name"].astype(str).str.strip()
    parsed = parsed[_is_parish_row(parsed["parish_name"])].copy()
    parsed["month"] = month
    parsed["year"] = year
    parsed["month_num"] = MONTH_ORDER.index(month) + 1

    for col in parsed.columns.difference(["parish_name", "month"]):
        parsed[col] = _to_number(parsed[col])

    return parsed.reset_index(drop=True)


def _detect_parish_column(raw: pd.DataFrame) -> int:
    best_col = 0
    best_count = -1
    for col in raw.columns:
        count = _is_parish_row(raw.iloc[:, col].astype(str).str.strip()).sum()
        if count > best_count:
            best_col = col
            best_count = count
    return best_col


def _is_parish_row(names: pd.Series) -> pd.Series:
    upper = names.str.upper()
    invalid = (
        names.isna()
        | names.eq("")
        | upper.eq("NAN")
        | upper.str.contains("DISTRICT", na=False)
        | upper.str.contains("SUMMARY", na=False)
        | upper.str.contains("SACRAMENTS", na=False)
        | upper.str.contains("COLLECTIONS", na=False)
        | upper.str.contains("EXPENSES", na=False)
        | upper.str.contains("TOTAL", na=False)
        | upper.str.contains("RATE", na=False)
        | upper.str.contains("NET OF", na=False)
    )
    return ~invalid & names.str.contains(",", regex=False, na=False)


def _col(raw: pd.DataFrame, index: int) -> pd.Series:
    if index >= len(raw.columns):
        return pd.Series(np.nan, index=raw.index)
    return raw.iloc[:, index]


def _to_number(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return series

    cleaned = series.astype(str).str.strip()
    missing = cleaned.str.lower().isin({"nan", "none", ""})
    cleaned = (
        cleaned.mask(missing)
        .str.replace("%", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.replace(r"^\((.*)\)$", r"-\1", regex=True)
    )
    numeric = pd.to_numeric(cleaned, errors="coerce")
    if series.astype(str).str.contains("%", regex=False).any():
        numeric = numeric / 100
    return numeric


def print_metric_table(df: pd.DataFrame, percent_cols: Sequence[str] | None = None,
                       decimal_cols: dict[str, int] | None = None,
                       columns: Sequence[str] | None = None) -> None:
    display = df if columns is None else df[list(columns)]
    formatters = {}

    for col in percent_cols or []:
        if col in display.columns:
            formatters[col] = lambda value: "" if pd.isna(value) else f"{value:.2f}%"

    for col, decimals in (decimal_cols or {}).items():
        if col in display.columns:
            formatters[col] = lambda value, places=decimals: "" if pd.isna(value) else f"{value:.{places}f}"

    print(display.to_string(index=False, formatters=formatters))


def safe_pct_change(series: pd.Series, periods: int = 1, fill_value: float = 0.0) -> pd.Series:
    """Percentage change that treats zero denominators as missing, not infinity."""
    previous = series.shift(periods).replace(0, np.nan)
    return ((series - previous) / previous).replace([np.inf, -np.inf], np.nan).fillna(fill_value)


def wape(y_true, y_pred) -> float:
    """Weighted absolute percentage error, stable when individual actuals are zero."""
    y_true_arr = np.asarray(y_true, dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)
    denom = np.sum(np.abs(y_true_arr))
    if denom == 0:
        return 0.0 if np.sum(np.abs(y_pred_arr)) == 0 else 100.0
    return np.sum(np.abs(y_true_arr - y_pred_arr)) / denom * 100


def mpe(y_true, y_pred) -> float:
    """Mean percentage error. Positive means the model over-forecasts overall."""
    y_true_arr = np.asarray(y_true, dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)
    denom = np.sum(np.abs(y_true_arr))
    if denom == 0:
        return 0.0
    return np.sum(y_pred_arr - y_true_arr) / denom * 100


def forecast_evaluation_summary(y_true, y_pred, groups=None, kpi_threshold: float = 15.0) -> tuple[dict, pd.DataFrame]:
    """
    Primary forecast evaluation for model testing.

    Overall WAPE is the main model metric because the deployed dashboard uses
    diocese-wide forecasts. Per-parish WAPE is retained as a reliability check.
    """
    eval_df = pd.DataFrame({
        "actual": np.asarray(y_true, dtype=float),
        "forecast": np.asarray(y_pred, dtype=float),
    }).replace([np.inf, -np.inf], np.nan).dropna()

    if eval_df.empty:
        empty_group = pd.DataFrame(columns=["group", "n", "actual_total", "forecast_total", "WAPE", "MPE"])
        return {
            "overall_wape": 0.0,
            "overall_mpe": 0.0,
            "overall_mae": 0.0,
            "overall_rmse": 0.0,
            "median_group_wape": 0.0,
            "worst_group_wape": 0.0,
            "pct_groups_passing_kpi": 0.0,
            "kpi_threshold": kpi_threshold,
            "n_groups": 0,
            "n_observations": 0,
        }, empty_group

    if groups is not None:
        group_values = pd.Series(groups).reset_index(drop=True)
        eval_df["group"] = group_values.loc[eval_df.index].astype(str).values
    else:
        eval_df["group"] = "overall"

    overall_wape = wape(eval_df["actual"], eval_df["forecast"])
    overall_mpe = mpe(eval_df["actual"], eval_df["forecast"])
    overall_mae = float(np.mean(np.abs(eval_df["actual"] - eval_df["forecast"]))) if not eval_df.empty else 0.0
    overall_rmse = float(np.sqrt(np.mean((eval_df["actual"] - eval_df["forecast"]) ** 2))) if not eval_df.empty else 0.0

    per_group = pd.DataFrame([
        {
            "group": group,
            "n": len(group_df),
            "actual_total": group_df["actual"].sum(),
            "forecast_total": group_df["forecast"].sum(),
            "WAPE": wape(group_df["actual"], group_df["forecast"]),
            "MPE": mpe(group_df["actual"], group_df["forecast"]),
        }
        for group, group_df in eval_df.groupby("group")
    ])
    per_group = per_group.sort_values("WAPE", ascending=False).reset_index(drop=True)
    valid_group_wape = per_group["WAPE"].dropna()

    summary = {
        "overall_wape": overall_wape,
        "overall_mpe": overall_mpe,
        "overall_mae": overall_mae,
        "overall_rmse": overall_rmse,
        "median_group_wape": float(valid_group_wape.median()) if not valid_group_wape.empty else overall_wape,
        "worst_group_wape": float(valid_group_wape.max()) if not valid_group_wape.empty else overall_wape,
        "pct_groups_passing_kpi": float((valid_group_wape <= kpi_threshold).mean() * 100) if not valid_group_wape.empty else 0.0,
        "kpi_threshold": kpi_threshold,
        "n_groups": int(len(valid_group_wape)),
        "n_observations": int(len(eval_df)),
    }
    return summary, per_group


def print_forecast_evaluation(label: str, y_true, y_pred, groups=None, kpi_threshold: float = 15.0) -> tuple[dict, pd.DataFrame]:
    summary, per_group = forecast_evaluation_summary(y_true, y_pred, groups, kpi_threshold)
    print(f"\n{label} evaluation:")
    print(f"  Overall WAPE:          {summary['overall_wape']:.2f}%")
    print(f"  Overall Bias (MPE):    {summary['overall_mpe']:.2f}%")
    print(f"  Median parish WAPE:    {summary['median_group_wape']:.2f}%")
    print(f"  Worst parish WAPE:     {summary['worst_group_wape']:.2f}%")
    print(f"  Parishes <= {kpi_threshold:.0f}% WAPE: {summary['pct_groups_passing_kpi']:.1f}%")
    if not per_group.empty and per_group["group"].nunique() > 1:
        print("\n  Highest-error parishes:")
        print_metric_table(
            per_group.head(5).rename(columns={"group": "parish"}),
            percent_cols=["WAPE", "MPE"],
            columns=["parish", "n", "WAPE", "MPE"],
        )
    return summary, per_group


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
        .transform(safe_pct_change)
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
