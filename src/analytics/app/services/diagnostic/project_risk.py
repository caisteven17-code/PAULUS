"""
Diagnostic: Project Risk Diagnostic
Schedule/budget variance, SHAP on project features, change-point detection, LLM narrative.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.data_definitions import safe_div
from app.services.supabase_client import get_table


def _llm_narrative(stats: dict[str, Any]) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return _rule_based_narrative(stats)
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "You are a project portfolio analyst for a Catholic diocese. "
            "Write a concise 3-sentence risk narrative based ONLY on these aggregated statistics "
            "(no project names or institution identifiers):\n\n"
            f"- Total projects: {stats.get('total', 0)}\n"
            f"- At-risk projects: {stats.get('at_risk', 0)}\n"
            f"- Avg budget variance: {stats.get('avg_budget_variance', 0):.2%}\n"
            f"- Avg schedule variance (days): {stats.get('avg_schedule_variance', 0):.1f}\n"
            f"- Top risk driver: {stats.get('top_risk_driver', 'N/A')}\n"
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return _rule_based_narrative(stats)


def _rule_based_narrative(stats: dict[str, Any]) -> str:
    at_risk = stats.get("at_risk", 0)
    total = stats.get("total", 0)
    avg_bv = stats.get("avg_budget_variance", 0)
    top_driver = stats.get("top_risk_driver", "budget shortfall")

    pct_at_risk = safe_div(at_risk, total or 1) * 100
    return (
        f"{at_risk} of {total} projects ({pct_at_risk:.0f}%) are classified as at-risk. "
        f"The primary risk driver is '{top_driver}', with an average budget variance of {avg_bv:.1%}. "
        f"Prioritizing funding for the most underfunded projects and revising timelines "
        f"is recommended to improve portfolio completion rates."
    )


def _days_between(start_str: str | None, end_str: str | None) -> float:
    if not start_str or not end_str:
        return 0.0
    try:
        start = pd.Timestamp(start_str)
        end = pd.Timestamp(end_str)
        return max(0.0, float((end - start).days))
    except Exception:
        return 0.0


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    proj_res = (
        get_table("diocese", "projects")
        .select("id, name, target_amount, current_amount, status, start_date, end_date, institution_id")
        .eq("institution_id", institution_id)
        .execute()
    )
    raw_projects = proj_res.data or []

    don_res = (
        get_table("diocese", "donations")
        .select("project_id, amount, created_at")
        .eq("institution_id", institution_id)
        .order("created_at")
        .execute()
    )
    donations = don_res.data or []

    if not raw_projects:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "at_risk_projects": [],
            "root_causes": [],
            "kpis": {},
            "change_points": [],
            "narrative": "No project data available.",
            "timestamp": ts,
        }

    today = pd.Timestamp.now(tz="UTC").normalize()
    features_list: list[dict] = []
    projects_detail: list[dict] = []

    for p in raw_projects:
        pid = str(p.get("id", ""))
        target = float(p.get("target_amount") or 0)
        current = float(p.get("current_amount") or 0)
        start = p.get("start_date")
        end = p.get("end_date")

        total_days = _days_between(start, end)
        if start:
            try:
                elapsed_days = max(0.0, float((today - pd.Timestamp(start)).days))
            except Exception:
                elapsed_days = 0.0
        else:
            elapsed_days = 0.0

        completion_pct = safe_div(current, target) if target > 0 else 0.0
        time_elapsed_pct = safe_div(elapsed_days, total_days) if total_days > 0 else 0.0
        progress_gap = completion_pct - time_elapsed_pct

        budget_variance = safe_div(target - current, target) if target > 0 else 0.0

        # Schedule variance in days (negative = behind schedule)
        _expected_amount_by_now = target * time_elapsed_pct  # noqa: F841
        schedule_variance_days = float((completion_pct - time_elapsed_pct) * total_days) if total_days > 0 else 0.0

        is_at_risk = (budget_variance > 0.3) or (progress_gap < -0.15)

        features_list.append(
            {
                "project_id": pid,
                "budget_variance": budget_variance,
                "schedule_variance_days": schedule_variance_days,
                "progress_gap": progress_gap,
                "completion_pct": completion_pct,
                "time_elapsed_pct": time_elapsed_pct,
            }
        )

        projects_detail.append(
            {
                "project_id": pid,
                "name": p.get("name", ""),
                "is_at_risk": is_at_risk,
                "budget_variance": round(budget_variance, 4),
                "schedule_variance_days": round(schedule_variance_days, 1),
                "progress_gap": round(progress_gap, 4),
                "completion_pct": round(completion_pct * 100, 2),
            }
        )

    at_risk_projects = [p for p in projects_detail if p["is_at_risk"]]

    # SHAP on project features
    feature_names = ["budget_variance", "schedule_variance_days", "progress_gap", "completion_pct", "time_elapsed_pct"]
    X = np.array([[f[k] for k in feature_names] for f in features_list])
    # Target: is_at_risk as 0/1
    y = np.array([1.0 if p["is_at_risk"] else 0.0 for p in projects_detail])

    root_causes: list[str] = []
    shap_importances: dict[str, float] = {}
    top_risk_driver = "budget_variance"

    if len(X) >= 4:
        try:
            import shap
            from sklearn.linear_model import LogisticRegression

            lr = LogisticRegression(max_iter=500)
            lr.fit(X, y)
            explainer = shap.LinearExplainer(lr, X, feature_perturbation="correlation_dependent")
            shap_vals = explainer.shap_values(X)
            mean_abs = np.abs(shap_vals).mean(axis=0)
            shap_importances = {f: round(float(v), 4) for f, v in zip(feature_names, mean_abs)}
            top_risk_driver = feature_names[int(np.argmax(mean_abs))]
            # Top 2 root causes
            sorted_feats = sorted(shap_importances.items(), key=lambda x: -x[1])
            root_causes = [f[0] for f in sorted_feats[:2]]
        except Exception:
            root_causes = ["budget_variance", "progress_gap"]
            top_risk_driver = "budget_variance"

    # Change point detection on donation trajectory
    don_by_project: dict[str, list[float]] = {}
    for d in donations:
        pid = str(d.get("project_id", ""))
        if pid:
            don_by_project.setdefault(pid, []).append(float(d.get("amount") or 0))

    cp_list: list[str] = []
    for pid, amounts in don_by_project.items():
        if len(amounts) >= 6:
            try:
                import ruptures as rpt

                signal = np.array(amounts).reshape(-1, 1)
                model_rpt = rpt.Pelt(model="rbf").fit(signal)
                bps = model_rpt.predict(pen=10)
                if len(bps) > 1:
                    cp_list.append(f"project:{pid} at donation#{bps[0]}")
            except Exception:
                pass

    # Spearman correlation between budget_variance and completion
    corr_val = 0.0
    if len(features_list) >= 4:
        try:
            from scipy import stats as scipy_stats

            bv = [f["budget_variance"] for f in features_list]
            cp = [f["completion_pct"] for f in features_list]
            corr_val, _ = scipy_stats.spearmanr(bv, cp)
        except Exception:
            corr_val = 0.0

    avg_bv = float(np.mean([f["budget_variance"] for f in features_list])) if features_list else 0.0
    avg_sv = float(np.mean([f["schedule_variance_days"] for f in features_list])) if features_list else 0.0

    narrative = _llm_narrative(
        {
            "total": len(raw_projects),
            "at_risk": len(at_risk_projects),
            "avg_budget_variance": avg_bv,
            "avg_schedule_variance": avg_sv,
            "top_risk_driver": top_risk_driver,
        }
    )

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "at_risk_projects": at_risk_projects,
        "root_causes": root_causes if root_causes else ["budget_variance"],
        "kpis": {
            "total_projects": len(raw_projects),
            "at_risk_count": len(at_risk_projects),
            "avg_budget_variance": round(avg_bv, 4),
            "avg_schedule_variance_days": round(avg_sv, 2),
            "budget_completion_spearman": round(float(corr_val), 4),
        },
        "change_points": cp_list,
        "narrative": narrative,
        "timestamp": ts,
    }


async def get_project_risk_diagnostic(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
