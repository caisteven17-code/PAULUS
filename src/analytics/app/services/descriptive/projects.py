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


def _fetch_and_process(institution_id: str) -> dict[str, Any]:
    ts = datetime.now(timezone.utc).isoformat()

    # ── Fetch projects ────────────────────────────────────────────────────────
    proj_res = (
        get_table("diocese", "projects")
        .select("id, name, target_amount, current_amount, status, start_date, end_date, institution_id")
        .eq("institution_id", institution_id)
        .execute()
    )
    raw_projects = proj_res.data or []

    # ── Fetch donations linked to institution ─────────────────────────────────
    don_res = (
        get_table("diocese", "donations")
        .select("project_id, amount, institution_id")
        .eq("institution_id", institution_id)
        .execute()
    )
    donations = don_res.data or []

    # Aggregate donations per project
    donations_by_project: dict[str, float] = {}
    for d in donations:
        pid = d.get("project_id")
        if pid:
            donations_by_project[pid] = donations_by_project.get(pid, 0.0) + float(d.get("amount") or 0)

    if not raw_projects:
        return {
            "data_sufficient": False,
            "institution_id": institution_id,
            "projects": [],
            "aggregates": {
                "total_raised": 0.0,
                "total_target": 0.0,
                "overall_completion_pct": 0.0,
                "count": 0,
                "active_count": 0,
                "completed_count": 0,
            },
            "timestamp": ts,
        }

    projects = []
    total_raised = 0.0
    total_target = 0.0
    completed_count = 0
    active_count = 0

    for p in raw_projects:
        pid = p.get("id", "")
        target = float(p.get("target_amount") or 0)
        current = float(p.get("current_amount") or 0)
        donation_sum = donations_by_project.get(pid, 0.0)
        raised = max(current, donation_sum)

        completion_pct = round(safe_div(raised, target) * 100, 2) if target > 0 else 0.0
        status = p.get("status", "active")
        if status in ("completed", "done"):
            completed_count += 1
        else:
            active_count += 1

        projects.append({
            "project_id": pid,
            "name": p.get("name", ""),
            "completion_pct": completion_pct,
            "raised": round(raised, 2),
            "target": round(target, 2),
            "status": status,
            "start_date": p.get("start_date"),
            "end_date": p.get("end_date"),
        })

        total_raised += raised
        total_target += target

    overall_completion = round(safe_div(total_raised, total_target) * 100, 2) if total_target > 0 else 0.0

    return {
        "data_sufficient": True,
        "institution_id": institution_id,
        "projects": projects,
        "aggregates": {
            "total_raised": round(total_raised, 2),
            "total_target": round(total_target, 2),
            "overall_completion_pct": overall_completion,
            "count": len(projects),
            "active_count": active_count,
            "completed_count": completed_count,
        },
        "timestamp": ts,
    }


async def get_projects(institution_id: str) -> dict[str, Any]:
    return await asyncio.to_thread(_fetch_and_process, institution_id)
