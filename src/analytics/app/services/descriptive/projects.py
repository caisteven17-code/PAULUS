"""
Descriptive: Projects Analysis
Queries diocese.projects and diocese.donations for completion and fundraising metrics.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.services.data_definitions import safe_div
from app.services.supabase_client import get_table

ALL_INSTITUTIONS = "all"


def _empty_response(institution_id: str, ts: str) -> dict[str, Any]:
    return {
        "data_sufficient": False,
        "institution_id": institution_id,
        "projects": [],
        "aggregates": {
            "total_raised": 0.0,
            "total_target": 0.0,
            "overall_completion_pct": 0.0,
            "fundraising_progress_pct": 0.0,
            "project_completion_pct": 0.0,
            "count": 0,
            "active_count": 0,
            "completed_count": 0,
        },
        "timestamp": ts,
    }


def _parish_institution_ids() -> list[str]:
    res = get_table("diocese", "institutions").select("id, institution_type").eq("institution_type", "parish").execute()
    return [row["id"] for row in (res.data or []) if row.get("id")]


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    institution_ids: list[str] | None = None
    if institution_id == ALL_INSTITUTIONS:
        institution_ids = _parish_institution_ids()
        if not institution_ids:
            return _empty_response(institution_id, ts)

    project_query = get_table("diocese", "projects").select(
        "id, name, target_amount, current_amount, status, start_date, end_date, institution_id"
    )
    project_query = (
        project_query.in_("institution_id", institution_ids)
        if institution_ids is not None
        else project_query.eq("institution_id", institution_id)
    )
    raw_projects = project_query.execute().data or []

    # Donations carry no institution reference — they scope through project_id.
    project_ids = [p["id"] for p in raw_projects if p.get("id")]
    donations = []
    if project_ids:
        donations = (
            get_table("diocese", "donations").select("project_id, amount").in_("project_id", project_ids).execute().data
            or []
        )

    donations_by_project: dict[str, float] = {}
    for donation in donations:
        project_id = donation.get("project_id")
        if project_id:
            donations_by_project[project_id] = donations_by_project.get(project_id, 0.0) + float(
                donation.get("amount") or 0
            )

    if not raw_projects:
        return _empty_response(institution_id, ts)

    projects = []
    total_raised = 0.0
    total_target = 0.0
    completed_count = 0
    active_count = 0

    for project in raw_projects:
        project_id = project.get("id", "")
        target = float(project.get("target_amount") or 0)
        current = float(project.get("current_amount") or 0)
        raised = max(current, donations_by_project.get(project_id, 0.0))

        status = project.get("status", "active")
        if status in ("completed", "done"):
            completed_count += 1
        else:
            active_count += 1

        projects.append(
            {
                "project_id": project_id,
                "name": project.get("name", ""),
                "completion_pct": round(safe_div(raised, target) * 100, 2) if target > 0 else 0.0,
                "raised": round(raised, 2),
                "target": round(target, 2),
                "status": status,
                "start_date": project.get("start_date"),
                "end_date": project.get("end_date"),
            }
        )

        total_raised += raised
        total_target += target

    fundraising_progress = round(safe_div(total_raised, total_target) * 100, 2) if total_target > 0 else 0.0
    project_completion = round(safe_div(completed_count, len(projects)) * 100, 2) if projects else 0.0

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "projects": projects,
        "aggregates": {
            "total_raised": round(total_raised, 2),
            "total_target": round(total_target, 2),
            "overall_completion_pct": fundraising_progress,
            "fundraising_progress_pct": fundraising_progress,
            "project_completion_pct": project_completion,
            "count": len(projects),
            "active_count": active_count,
            "completed_count": completed_count,
        },
        "timestamp": ts,
    }


async def get_projects(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
