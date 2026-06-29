"""
Run dashboard-style model tests on synthetic Diocese financial data.

This script is intentionally separate from the production analytics path. It is
for testing model choices and graph design before the actual financial records,
project labels, and Supabase data are complete.

Run from this folder:
    python run_dashboard_model_tests.py

Outputs:
    outputs/dashboard_graphs/*.png
    outputs/dashboard_graphs/*.svg
    outputs/dashboard_graphs/model_test_summary.csv
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import GradientBoostingRegressor, IsolationForest, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import balanced_accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from dashboard_graphs import (
    plot_anomaly_timeline,
    plot_cluster_map,
    plot_feature_importance,
    plot_forecast_comparison,
    plot_model_leaderboard,
    plot_risk_probabilities,
    write_graph_manifest,
)
from utils import MONTH_ORDER, forecast_evaluation_summary, safe_pct_change


BASE_DIR = os.path.dirname(__file__)
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "dashboard_graphs")
RANDOM_SEED = 42


@dataclass(frozen=True)
class ModelResult:
    model: str
    wape: float
    holdout_score: float
    median_parish_wape: float
    worst_parish_wape: float
    pct_parishes_passing_kpi: float


def build_synthetic_financial_data(seed: int = RANDOM_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    parishes = [
        "St. John Paul II Parish",
        "Chair of St. Peter Parish",
        "Holy Family Parish",
        "San Isidro Labrador Parish",
        "Sta. Rosa De Lima Parish",
        "Our Lady of Guadalupe Parish",
        "Immaculate Conception Parish",
        "Christ the King Parish",
        "San Gabriel Archangel Parish",
        "San Lorenzo Ruiz Parish",
        "St. James the Apostle Parish",
        "Mary Help of Christians Parish",
    ]
    rows = []
    for parish_index, parish_name in enumerate(parishes):
        capacity = rng.uniform(0.72, 1.45)
        expense_ratio = rng.uniform(0.70, 0.98)
        baseline = rng.uniform(2_300_000, 6_700_000) * capacity
        for year in [2023, 2024, 2025, 2026]:
            growth = 1 + (year - 2023) * rng.uniform(0.025, 0.07)
            for month_num, month in enumerate(MONTH_ORDER, start=1):
                christmas_lift = 1.65 if month_num == 12 else 1.0
                holy_week_lift = 1.28 if month_num in [3, 4] else 1.0
                fiesta_lift = 1.18 if month_num == ((parish_index % 12) + 1) else 1.0
                seasonality = christmas_lift * holy_week_lift * fiesta_lift
                noise = rng.normal(1.0, 0.08)
                collections = max(0, baseline * growth * seasonality * noise)
                expenses = collections * expense_ratio * rng.normal(1.0, 0.06)
                rows.append(
                    {
                        "parish_name": parish_name,
                        "parish_id": parish_index,
                        "year": year,
                        "month": month,
                        "month_num": month_num,
                        "collections": collections,
                        "expenses": expenses,
                        "net_balance": collections - expenses,
                        "sacraments_rate": rng.uniform(0.07, 0.22),
                        "liturgical_major_days": 5 + (3 if month_num in [3, 4, 12] else 0),
                        "donor_count": int(rng.normal(185 * capacity, 26)),
                    }
                )

    df = pd.DataFrame(rows).sort_values(["parish_id", "year", "month_num"]).reset_index(drop=True)
    df["month_sin"] = np.sin(2 * np.pi * df["month_num"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month_num"] / 12)
    df["collections_lag1"] = df.groupby("parish_id")["collections"].shift(1)
    df["collections_lag2"] = df.groupby("parish_id")["collections"].shift(2)
    df["collections_roll3"] = (
        df.groupby("parish_id")["collections"].transform(lambda values: values.shift(1).rolling(3, min_periods=1).mean())
    )
    df["collections_mom_growth"] = df.groupby("parish_id")["collections"].transform(safe_pct_change).clip(-2, 2)
    df["net_margin"] = df["net_balance"] / df["collections"].replace(0, np.nan)
    df["annual_collections"] = df.groupby(["parish_name", "year"])["collections"].transform("sum")
    df["health_score"] = (55 + (df["net_margin"].clip(-0.2, 0.35) + 0.2) * 95).clip(35, 100)
    return df.fillna(0)


def build_synthetic_project_data(financial: pd.DataFrame, seed: int = RANDOM_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed + 7)
    base = financial.groupby("parish_name", as_index=False).agg(
        parish_mean_collections=("collections", "mean"),
        net_margin=("net_margin", "mean"),
    )
    projects = []
    for _, row in base.iterrows():
        for project_index in range(6):
            progress = rng.uniform(35, 112)
            schedule_variance = rng.normal(8, 22)
            budget_vs_target = progress + rng.normal(0, 12)
            donor_count = max(12, int(rng.normal(65 + row["parish_mean_collections"] / 160_000, 18)))
            signal = (
                -4.4
                + 0.035 * progress
                + 0.018 * budget_vs_target
                - 0.032 * max(schedule_variance, 0)
                + 0.011 * donor_count
                + 2.8 * max(row["net_margin"], -0.2)
            )
            success_probability = 1 / (1 + np.exp(-signal))
            project_success = int(rng.random() < success_probability)
            projects.append(
                {
                    "project_name": f"{row['parish_name'].replace(' Parish', '')} Project {project_index + 1}",
                    "parish_name": row["parish_name"],
                    "budget_vs_target_pct": budget_vs_target,
                    "fund_raising_progress_pct": progress,
                    "schedule_variance_days": schedule_variance,
                    "donor_count": donor_count,
                    "parish_mean_collections": row["parish_mean_collections"],
                    "project_success": project_success,
                }
            )
    return pd.DataFrame(projects)


def train_forecast_models(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    features = [
        "parish_id",
        "year",
        "month_num",
        "month_sin",
        "month_cos",
        "collections_lag1",
        "collections_lag2",
        "collections_roll3",
        "collections_mom_growth",
        "sacraments_rate",
        "liturgical_major_days",
        "donor_count",
    ]
    train = df[df["year"] < 2026].copy()
    holdout = df[df["year"] == 2026].copy()
    x_train = train[features]
    y_train = train["collections"]
    x_holdout = holdout[features]
    y_holdout = holdout["collections"]

    candidates = {
        "Linear Regression": LinearRegression(),
        "Random Forest": RandomForestRegressor(n_estimators=220, min_samples_leaf=4, random_state=RANDOM_SEED),
        "Gradient Boosting": GradientBoostingRegressor(random_state=RANDOM_SEED),
    }
    results: list[ModelResult] = []
    predictions: dict[str, np.ndarray] = {}
    fitted_models = {}
    for name, model in candidates.items():
        model.fit(x_train, y_train)
        pred = np.maximum(model.predict(x_holdout), 0)
        predictions[name] = pred
        fitted_models[name] = model
        summary, _ = forecast_evaluation_summary(y_holdout, pred, groups=holdout["parish_name"])
        score = summary["overall_wape"]
        results.append(ModelResult(
            model=name,
            wape=score,
            holdout_score=100 - score,
            median_parish_wape=summary["median_group_wape"],
            worst_parish_wape=summary["worst_group_wape"],
            pct_parishes_passing_kpi=summary["pct_groups_passing_kpi"],
        ))

    metrics = pd.DataFrame([result.__dict__ for result in results]).sort_values("wape")
    champion_name = metrics.iloc[0]["model"]
    champion_pred = predictions[champion_name]

    diocese_holdout = holdout[["month", "month_num", "collections"]].copy()
    diocese_holdout["forecast"] = champion_pred
    chart_frame = (
        diocese_holdout.groupby(["month_num", "month"], as_index=False)
        .agg(actual=("collections", "sum"), forecast=("forecast", "sum"))
        .sort_values("month_num")
    )
    uncertainty = np.maximum(np.abs(chart_frame["actual"] - chart_frame["forecast"]), chart_frame["forecast"] * 0.08)
    chart_frame["lower"] = (chart_frame["forecast"] - uncertainty).clip(lower=0)
    chart_frame["upper"] = chart_frame["forecast"] + uncertainty

    champion_model = fitted_models[champion_name]
    if hasattr(champion_model, "feature_importances_"):
        importance = pd.DataFrame({"feature": features, "importance": champion_model.feature_importances_})
    else:
        coef = np.abs(getattr(champion_model, "coef_", np.zeros(len(features))))
        importance = pd.DataFrame({"feature": features, "importance": coef / max(coef.sum(), 1)})
    return metrics, chart_frame, importance


def train_project_risk_model(projects: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, float]]:
    features = [
        "budget_vs_target_pct",
        "fund_raising_progress_pct",
        "schedule_variance_days",
        "donor_count",
        "parish_mean_collections",
    ]
    x = projects[features]
    y = projects["project_success"]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.35, stratify=y, random_state=RANDOM_SEED)
    model = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=RANDOM_SEED)),
        ]
    )
    model.fit(x_train, y_train)
    predicted = model.predict(x_test)
    metrics = {
        "f1": f1_score(y_test, predicted),
        "balanced_accuracy": balanced_accuracy_score(y_test, predicted),
    }
    scored = projects.copy()
    scored["success_probability"] = model.predict_proba(x)[:, 1]
    scored["risk_probability"] = 1 - scored["success_probability"]
    return scored, metrics


def build_cluster_frame(df: pd.DataFrame) -> pd.DataFrame:
    parish = (
        df[df["year"] == 2026]
        .groupby("parish_name", as_index=False)
        .agg(
            annual_collections=("collections", "sum"),
            net_margin=("net_margin", "mean"),
            health_score=("health_score", "mean"),
        )
    )
    x = parish[["annual_collections", "net_margin", "health_score"]]
    labels = KMeans(n_clusters=4, random_state=RANDOM_SEED, n_init=10).fit_predict(StandardScaler().fit_transform(x))
    parish["cluster_index"] = labels
    order = parish.groupby("cluster_index")["health_score"].mean().sort_values(ascending=False).index
    class_map = {cluster: f"Class {letter}" for cluster, letter in zip(order, ["A", "B", "C", "D"])}
    parish["cluster"] = parish["cluster_index"].map(class_map)
    return parish


def build_anomaly_frame(df: pd.DataFrame) -> pd.DataFrame:
    parish_name = "Holy Family Parish"
    frame = df[(df["parish_name"] == parish_name) & (df["year"] == 2026)].copy().reset_index(drop=True)
    detector = IsolationForest(contamination=0.17, random_state=RANDOM_SEED)
    frame["is_anomaly"] = detector.fit_predict(frame[["collections", "expenses", "net_margin"]]) == -1
    return frame


def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    financial = build_synthetic_financial_data()
    projects = build_synthetic_project_data(financial)

    forecast_metrics, forecast_chart, importance = train_forecast_models(financial)
    risk_scores, risk_metrics = train_project_risk_model(projects)
    cluster_frame = build_cluster_frame(financial)
    anomaly_frame = build_anomaly_frame(financial)

    paths = [
        plot_forecast_comparison(forecast_chart, OUTPUT_DIR),
        plot_model_leaderboard(forecast_metrics, OUTPUT_DIR),
        plot_feature_importance(importance, OUTPUT_DIR),
        plot_risk_probabilities(risk_scores, OUTPUT_DIR),
        plot_cluster_map(cluster_frame, OUTPUT_DIR),
        plot_anomaly_timeline(anomaly_frame, OUTPUT_DIR),
    ]
    manifest = write_graph_manifest(paths, OUTPUT_DIR)

    summary = forecast_metrics.copy()
    summary["project_risk_f1"] = risk_metrics["f1"]
    summary["project_risk_balanced_accuracy"] = risk_metrics["balanced_accuracy"]
    summary.to_csv(os.path.join(OUTPUT_DIR, "model_test_summary.csv"), index=False)
    financial.to_csv(os.path.join(OUTPUT_DIR, "synthetic_financial_testing_data.csv"), index=False)
    projects.to_csv(os.path.join(OUTPUT_DIR, "synthetic_project_testing_data.csv"), index=False)

    print("Dashboard model testing complete.")
    print(f"Graphs:   {OUTPUT_DIR}")
    print(f"Manifest: {manifest}")
    print("\nForecast model leaderboard:")
    print(forecast_metrics.to_string(index=False, formatters={
        "wape": "{:.2f}".format,
        "holdout_score": "{:.2f}".format,
        "median_parish_wape": "{:.2f}".format,
        "worst_parish_wape": "{:.2f}".format,
        "pct_parishes_passing_kpi": "{:.1f}".format,
    }))
    print("\nProject risk model:")
    print(f"  F1:                {risk_metrics['f1']:.3f}")
    print(f"  Balanced accuracy: {risk_metrics['balanced_accuracy']:.3f}")


if __name__ == "__main__":
    main()
