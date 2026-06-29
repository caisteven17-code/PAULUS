"""
Dashboard-matched graph helpers for model testing.

The frontend dashboard uses white cards, subtle gray gridlines, church green,
gold accents, and compact uppercase labels. These helpers mirror that visual
language in static PNG/SVG files so model outputs can be reviewed before the
real Supabase data is ready.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


CHURCH_GREEN = "#1a472a"
GOLD = "#D4AF37"
GOLD_DARK = "#B5952F"
EMERALD = "#10b981"
SKY = "#0EA5E9"
ORANGE = "#F97316"
RED = "#EF4444"
INK = "#111827"
MUTED = "#6B7280"
LIGHT_MUTED = "#9CA3AF"
BORDER = "#E5E7EB"
GRID = "#F3F4F6"
CARD_BG = "#FFFFFF"
PAGE_BG = "#F9FAFB"

PALETTE = [CHURCH_GREEN, GOLD, EMERALD, SKY, ORANGE, RED, "#6366f1", "#8b5cf6"]


@dataclass(frozen=True)
class DashboardTheme:
    output_dir: str
    dpi: int = 160
    figure_width: float = 10.5
    figure_height: float = 5.4


def ensure_output_dir(output_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)


def set_dashboard_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": PAGE_BG,
            "axes.facecolor": CARD_BG,
            "axes.edgecolor": BORDER,
            "axes.labelcolor": MUTED,
            "axes.titlecolor": INK,
            "xtick.color": LIGHT_MUTED,
            "ytick.color": LIGHT_MUTED,
            "grid.color": GRID,
            "grid.linewidth": 1.0,
            "font.family": "DejaVu Sans",
            "font.size": 10,
            "axes.titlesize": 15,
            "axes.titleweight": "bold",
            "axes.labelsize": 10,
            "legend.fontsize": 9,
        }
    )


def _new_card_figure(theme: DashboardTheme, title: str, subtitle: str | None = None):
    set_dashboard_style()
    fig, ax = plt.subplots(figsize=(theme.figure_width, theme.figure_height), dpi=theme.dpi)
    fig.subplots_adjust(left=0.08, right=0.96, top=0.76, bottom=0.17)
    if subtitle:
        fig.text(
            0.08,
            0.935,
            subtitle.upper(),
            color=GOLD_DARK,
            fontsize=8,
            fontweight="bold",
            va="bottom",
        )
    fig.text(0.08, 0.885, title, color=INK, fontsize=15, fontweight="bold", va="bottom")
    return fig, ax


def _finish_card(fig, ax, output_path: str) -> None:
    ax.grid(True, axis="y")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(BORDER)
    ax.spines["bottom"].set_color(BORDER)
    fig.savefig(output_path, bbox_inches="tight", facecolor=fig.get_facecolor())
    svg_path = os.path.splitext(output_path)[0] + ".svg"
    fig.savefig(svg_path, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def peso_millions(value: float) -> str:
    return f"{value / 1_000_000:.1f}M"


def plot_forecast_comparison(
    frame: pd.DataFrame,
    output_dir: str,
    file_stem: str = "forecast_comparison",
) -> str:
    """Line chart that mirrors the Bishop dashboard forecast card."""
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    fig, ax = _new_card_figure(
        theme,
        "Financial Forecast Model Test",
        "Historical Actual vs ML Forecast",
    )

    x = np.arange(len(frame))
    ax.axvspan(-0.5, 7.5, color="#F0F9FF", alpha=0.55, zorder=0)
    ax.axvspan(7.5, 9.5, color="#FFF7ED", alpha=0.55, zorder=0)
    ax.axvspan(9.5, len(frame) - 0.5, color="#F0FDF4", alpha=0.55, zorder=0)
    ax.axvline(9, color=BORDER, linestyle="--", linewidth=1.5)

    ax.plot(
        x,
        frame["actual"],
        color=CHURCH_GREEN,
        linewidth=3.2,
        marker="o",
        markersize=5.5,
        markerfacecolor=CHURCH_GREEN,
        markeredgecolor="white",
        markeredgewidth=1.5,
        label="Historical (Actual)",
    )
    ax.plot(
        x,
        frame["forecast"],
        color=GOLD,
        linewidth=3.0,
        linestyle=(0, (5, 4)),
        marker="o",
        markersize=5.5,
        markerfacecolor=GOLD,
        markeredgecolor="white",
        markeredgewidth=1.5,
        label="Forecast (ML Model)",
    )
    ax.fill_between(x, frame["lower"], frame["upper"], color=GOLD, alpha=0.14, label="Confidence Range")

    ax.text(0.02, 0.91, "PAST (TRAIN)", transform=ax.transAxes, fontsize=8, color=SKY, fontweight="bold")
    ax.text(0.59, 0.91, "PRESENT (HOLDOUT)", transform=ax.transAxes, fontsize=8, color=ORANGE, fontweight="bold")
    ax.text(0.81, 0.91, "FUTURE (FORECAST)", transform=ax.transAxes, fontsize=8, color=EMERALD, fontweight="bold")

    ax.set_xticks(x)
    ax.set_xticklabels(frame["month"], rotation=20, ha="right")
    ax.yaxis.set_major_formatter(lambda value, _: peso_millions(value))
    ax.set_ylabel("Collections")
    ax.legend(loc="upper right", bbox_to_anchor=(1, 1.16), frameon=False, ncol=3)

    output_path = os.path.join(output_dir, f"{file_stem}.png")
    _finish_card(fig, ax, output_path)
    return output_path


def plot_model_leaderboard(metrics: pd.DataFrame, output_dir: str) -> str:
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    ordered = metrics.sort_values("wape", ascending=True).reset_index(drop=True)
    fig, ax = _new_card_figure(theme, "Champion Model Leaderboard", "Lower WAPE is better")

    colors = [CHURCH_GREEN if i == 0 else GOLD if i == 1 else "#D1D5DB" for i in range(len(ordered))]
    ax.barh(ordered["model"], ordered["wape"], color=colors, edgecolor="white", linewidth=1.5)
    ax.axvline(15, color=RED, linestyle="--", linewidth=1.4)
    ax.text(15.3, -0.45, "15% KPI", color=RED, fontsize=8, fontweight="bold")
    ax.invert_yaxis()
    ax.set_xlabel("WAPE (%)")
    for index, value in enumerate(ordered["wape"]):
        ax.text(value + 0.4, index, f"{value:.1f}%", va="center", color=MUTED, fontweight="bold", fontsize=9)

    output_path = os.path.join(output_dir, "model_leaderboard.png")
    _finish_card(fig, ax, output_path)
    return output_path


def plot_risk_probabilities(frame: pd.DataFrame, output_dir: str) -> str:
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    ordered = frame.sort_values("risk_probability", ascending=True).tail(10)
    fig, ax = _new_card_figure(theme, "Project Success Risk Test", "Logistic model probability output")

    colors = [RED if value >= 0.65 else ORANGE if value >= 0.45 else CHURCH_GREEN for value in ordered["risk_probability"]]
    ax.barh(ordered["project_name"], ordered["risk_probability"] * 100, color=colors, edgecolor="white", linewidth=1.3)
    ax.set_xlabel("Risk Probability (%)")
    ax.set_xlim(0, 100)
    for index, value in enumerate(ordered["risk_probability"] * 100):
        ax.text(value + 1.3, index, f"{value:.0f}%", va="center", color=MUTED, fontweight="bold", fontsize=9)

    output_path = os.path.join(output_dir, "project_risk_probabilities.png")
    _finish_card(fig, ax, output_path)
    return output_path


def plot_cluster_map(frame: pd.DataFrame, output_dir: str) -> str:
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    fig, ax = _new_card_figure(theme, "Parish Cluster Model Test", "Rule/KMeans segmentation preview")
    cluster_colors = {"Class A": CHURCH_GREEN, "Class B": GOLD, "Class C": ORANGE, "Class D": RED}

    for cluster, group in frame.groupby("cluster"):
        ax.scatter(
            group["annual_collections"],
            group["net_margin"],
            s=group["health_score"] * 4,
            color=cluster_colors.get(cluster, MUTED),
            alpha=0.78,
            edgecolor="white",
            linewidth=1.2,
            label=cluster,
        )
    ax.xaxis.set_major_formatter(lambda value, _: peso_millions(value))
    ax.yaxis.set_major_formatter(lambda value, _: f"{value:.0%}")
    ax.set_xlabel("Annual Collections")
    ax.set_ylabel("Net Margin")
    ax.legend(loc="upper right", frameon=False, title="Cluster")

    output_path = os.path.join(output_dir, "parish_cluster_map.png")
    _finish_card(fig, ax, output_path)
    return output_path


def plot_anomaly_timeline(frame: pd.DataFrame, output_dir: str) -> str:
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    fig, ax = _new_card_figure(theme, "Anomaly Detection Test", "Isolation Forest monthly flags")

    normal = frame[~frame["is_anomaly"]]
    anomalous = frame[frame["is_anomaly"]]
    x = np.arange(len(frame))
    ax.plot(x, frame["collections"], color=CHURCH_GREEN, linewidth=2.8, marker="o", markersize=4.8)
    ax.scatter(
        anomalous.index,
        anomalous["collections"],
        color=RED,
        s=110,
        edgecolor="white",
        linewidth=1.5,
        zorder=4,
        label="Flagged anomaly",
    )
    ax.scatter(normal.index, normal["collections"], color=CHURCH_GREEN, s=1, alpha=0)
    ax.set_xticks(x)
    ax.set_xticklabels(frame["month"], rotation=0)
    ax.yaxis.set_major_formatter(lambda value, _: peso_millions(value))
    ax.set_ylabel("Collections")
    ax.legend(loc="upper right", frameon=False)

    output_path = os.path.join(output_dir, "anomaly_timeline.png")
    _finish_card(fig, ax, output_path)
    return output_path


def plot_feature_importance(frame: pd.DataFrame, output_dir: str) -> str:
    theme = DashboardTheme(output_dir=output_dir)
    ensure_output_dir(output_dir)
    ordered = frame.sort_values("importance", ascending=True).tail(10)
    fig, ax = _new_card_figure(theme, "Driver Importance Test", "Model feature contribution")

    colors = [CHURCH_GREEN if index == len(ordered) - 1 else GOLD for index in range(len(ordered))]
    ax.barh(ordered["feature"], ordered["importance"], color=colors, edgecolor="white", linewidth=1.2)
    ax.set_xlabel("Relative Importance")
    for index, value in enumerate(ordered["importance"]):
        ax.text(value + 0.005, index, f"{value:.2f}", va="center", color=MUTED, fontweight="bold", fontsize=9)

    output_path = os.path.join(output_dir, "feature_importance.png")
    _finish_card(fig, ax, output_path)
    return output_path


def write_graph_manifest(paths: Iterable[str], output_dir: str) -> str:
    manifest_path = os.path.join(output_dir, "dashboard_graph_manifest.txt")
    with open(manifest_path, "w", encoding="utf-8") as manifest:
        manifest.write("Dashboard graph outputs\n")
        manifest.write("=======================\n\n")
        for path in paths:
            manifest.write(f"- {os.path.basename(path)}\n")
            manifest.write(f"- {os.path.splitext(os.path.basename(path))[0]}.svg\n")
    return manifest_path


def export_model_dashboard_preview(model_name: str, df: pd.DataFrame | None = None) -> str:
    """
    Export one dashboard-matched graph for an individual model script.

    The scripts in this folder can call this after training. If real data is not
    ready or the provided dataframe has sparse values, this uses a stable mock
    series so every model file can still produce a visual preview.
    """
    safe_name = model_name.lower().replace(" ", "_").replace("-", "_").replace("/", "_")
    output_dir = os.path.join(os.path.dirname(__file__), "outputs", "model_graphs")
    ensure_output_dir(output_dir)

    frame = _coerce_monthly_preview_frame(df)
    title = f"{model_name} Model Test"
    lower_name = model_name.lower()

    if any(token in lower_name for token in ["sarima", "sarimax", "prophet", "holt", "exponential", "bsts", "xgboost", "mlp"]):
        return _plot_individual_forecast(frame, output_dir, safe_name, title)
    if any(token in lower_name for token in ["isolation", "change point", "bocpd", "decomposition"]):
        return _plot_individual_anomaly(frame, output_dir, safe_name, title)
    if any(token in lower_name for token in ["segmentation", "markov", "logistic"]):
        return _plot_individual_classification(frame, output_dir, safe_name, title)
    if any(token in lower_name for token in ["milp", "envelopment", "agent"]):
        return _plot_individual_prescriptive(frame, output_dir, safe_name, title)
    if "shap" in lower_name or "linear regression" in lower_name:
        return _plot_individual_drivers(output_dir, safe_name, title)

    return _plot_individual_forecast(frame, output_dir, safe_name, title)


def _coerce_monthly_preview_frame(df: pd.DataFrame | None = None) -> pd.DataFrame:
    months = MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if df is not None and {"month_num", "total_receipts_final"}.issubset(df.columns):
        data = df.dropna(subset=["total_receipts_final"]).copy()
        if not data.empty:
            monthly = (
                data.groupby("month_num", as_index=False)["total_receipts_final"]
                .sum()
                .sort_values("month_num")
                .tail(12)
            )
            if len(monthly) >= 4:
                monthly["month"] = monthly["month_num"].map(lambda value: months[int(value) - 1] if 1 <= int(value) <= 12 else str(value))
                actual = monthly["total_receipts_final"].to_numpy(dtype=float)
                forecast = pd.Series(actual).rolling(2, min_periods=1).mean().shift(1).fillna(actual[0]).to_numpy()
                return pd.DataFrame(
                    {
                        "month": monthly["month"],
                        "actual": actual,
                        "forecast": forecast,
                        "lower": np.maximum(forecast * 0.9, 0),
                        "upper": forecast * 1.1,
                    }
                )

    actual = np.array([45.2, 38.6, 42.1, 68.4, 50.2, 41.8, 38.3, 40.1, 42.4, 44.7, 47.3, 88.6]) * 1_000_000
    forecast = np.array([44.8, 39.2, 43.0, 65.9, 51.1, 42.5, 39.8, 41.2, 43.6, 45.9, 49.5, 84.2]) * 1_000_000
    return pd.DataFrame(
        {
            "month": months,
            "actual": actual,
            "forecast": forecast,
            "lower": np.maximum(forecast * 0.88, 0),
            "upper": forecast * 1.12,
        }
    )


def _plot_individual_forecast(frame: pd.DataFrame, output_dir: str, safe_name: str, title: str) -> str:
    theme = DashboardTheme(output_dir=output_dir, figure_width=9.5, figure_height=4.8)
    fig, ax = _new_card_figure(theme, title, "Forecast preview")
    x = np.arange(len(frame))
    ax.plot(x, frame["actual"], color=CHURCH_GREEN, linewidth=3, marker="o", markeredgecolor="white", label="Actual")
    ax.plot(x, frame["forecast"], color=GOLD, linewidth=3, linestyle=(0, (5, 4)), marker="o", markeredgecolor="white", label="Model")
    ax.fill_between(x, frame["lower"], frame["upper"], color=GOLD, alpha=0.14, label="Range")
    ax.set_xticks(x)
    ax.set_xticklabels(frame["month"], rotation=20, ha="right")
    ax.yaxis.set_major_formatter(lambda value, _: peso_millions(value))
    ax.set_ylabel("Collections")
    ax.legend(loc="upper right", bbox_to_anchor=(1, 1.15), frameon=False, ncol=3)
    output_path = os.path.join(output_dir, f"{safe_name}.png")
    _finish_card(fig, ax, output_path)
    print(f"Dashboard graph -> {output_path}")
    return output_path


def _plot_individual_anomaly(frame: pd.DataFrame, output_dir: str, safe_name: str, title: str) -> str:
    theme = DashboardTheme(output_dir=output_dir, figure_width=9.5, figure_height=4.8)
    fig, ax = _new_card_figure(theme, title, "Anomaly/change signal preview")
    x = np.arange(len(frame))
    values = frame["actual"].to_numpy(dtype=float)
    threshold = values.mean() + values.std()
    anomaly_mask = values >= threshold
    ax.plot(x, values, color=CHURCH_GREEN, linewidth=3, marker="o", markeredgecolor="white")
    ax.scatter(x[anomaly_mask], values[anomaly_mask], color=RED, s=120, edgecolor="white", linewidth=1.4, label="Flag")
    ax.axhline(threshold, color=GOLD, linewidth=2, linestyle="--", label="Threshold")
    ax.set_xticks(x)
    ax.set_xticklabels(frame["month"], rotation=20, ha="right")
    ax.yaxis.set_major_formatter(lambda value, _: peso_millions(value))
    ax.set_ylabel("Collections")
    ax.legend(loc="upper right", bbox_to_anchor=(1, 1.15), frameon=False, ncol=2)
    output_path = os.path.join(output_dir, f"{safe_name}.png")
    _finish_card(fig, ax, output_path)
    print(f"Dashboard graph -> {output_path}")
    return output_path


def _plot_individual_classification(frame: pd.DataFrame, output_dir: str, safe_name: str, title: str) -> str:
    theme = DashboardTheme(output_dir=output_dir, figure_width=9.5, figure_height=4.8)
    fig, ax = _new_card_figure(theme, title, "Classification probability preview")
    labels = ["Class A", "Class B", "Class C", "Class D", "Success", "Risk"]
    values = np.array([82, 68, 49, 31, 74, 26])
    colors = [CHURCH_GREEN, GOLD, ORANGE, RED, EMERALD, "#D1D5DB"]
    ax.barh(labels, values, color=colors, edgecolor="white", linewidth=1.2)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Probability / Score")
    for index, value in enumerate(values):
        ax.text(value + 1.2, index, f"{value:.0f}%", va="center", color=MUTED, fontweight="bold", fontsize=9)
    output_path = os.path.join(output_dir, f"{safe_name}.png")
    _finish_card(fig, ax, output_path)
    print(f"Dashboard graph -> {output_path}")
    return output_path


def _plot_individual_prescriptive(frame: pd.DataFrame, output_dir: str, safe_name: str, title: str) -> str:
    theme = DashboardTheme(output_dir=output_dir, figure_width=9.5, figure_height=4.8)
    fig, ax = _new_card_figure(theme, title, "Prescriptive scenario preview")
    labels = ["Baseline", "Utility Control", "Fiesta Campaign", "Balanced Plan"]
    values = np.array([0, 8.5, 13.2, 17.6])
    ax.bar(labels, values, color=[LIGHT_MUTED, GOLD, EMERALD, CHURCH_GREEN], edgecolor="white", linewidth=1.2)
    ax.set_ylabel("Estimated Net Gain (%)")
    for index, value in enumerate(values):
        ax.text(index, value + 0.5, f"{value:.1f}%", ha="center", color=MUTED, fontweight="bold", fontsize=9)
    output_path = os.path.join(output_dir, f"{safe_name}.png")
    _finish_card(fig, ax, output_path)
    print(f"Dashboard graph -> {output_path}")
    return output_path


def _plot_individual_drivers(output_dir: str, safe_name: str, title: str) -> str:
    theme = DashboardTheme(output_dir=output_dir, figure_width=9.5, figure_height=4.8)
    fig, ax = _new_card_figure(theme, title, "Driver importance preview")
    labels = ["Prior collections", "Christmas season", "Holy Week", "Donor count", "Net margin", "Month trend"]
    values = np.array([0.31, 0.22, 0.18, 0.13, 0.10, 0.06])
    ax.barh(labels, values, color=[CHURCH_GREEN, GOLD, GOLD, EMERALD, ORANGE, "#D1D5DB"], edgecolor="white", linewidth=1.2)
    ax.set_xlabel("Relative Importance")
    for index, value in enumerate(values):
        ax.text(value + 0.01, index, f"{value:.2f}", va="center", color=MUTED, fontweight="bold", fontsize=9)
    output_path = os.path.join(output_dir, f"{safe_name}.png")
    _finish_card(fig, ax, output_path)
    print(f"Dashboard graph -> {output_path}")
    return output_path
