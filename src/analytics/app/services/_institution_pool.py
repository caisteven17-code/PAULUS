"""
Parallel institution processor — shared utility for diocese-wide analytics.

Usage:
    from app.services._institution_pool import run_parallel

    def _worker(inst: dict) -> dict | None:
        ...  # query Supabase, compute, return result or None

    results = run_parallel(_worker, institutions)

Every institution is processed in its own thread simultaneously.
Supabase (httpx-backed, thread-safe) releases the GIL on network I/O,
so threads get real concurrency without blocking each other.
One institution failing never cancels the rest.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Cap threads so we don't exhaust Supabase's connection pool on large dioceses
_DEFAULT_MAX_WORKERS = 20


def run_parallel(
    worker: Callable[[dict], Optional[Any]],
    institutions: list[dict],
    max_workers: int = _DEFAULT_MAX_WORKERS,
) -> list[Any]:
    """
    Run `worker(inst)` for every institution concurrently.
    Returns all non-None results (completion order, not input order).
    Per-institution exceptions are logged and skipped.
    """
    if not institutions:
        return []

    n = min(max_workers, len(institutions))
    results: list[Any] = []

    with ThreadPoolExecutor(max_workers=n) as pool:
        future_to_inst = {pool.submit(worker, inst): inst for inst in institutions}
        for future in as_completed(future_to_inst):
            inst = future_to_inst[future]
            try:
                result = future.result()
                if result is not None:
                    results.append(result)
            except Exception as exc:
                logger.warning(
                    "Institution %s failed in parallel worker: %s",
                    inst.get("id", "unknown"),
                    exc,
                )

    return results
