"""In-flight request coalescing for expensive, frequently-duplicated async
calls. When N callers ask for the same (function, key) at the same time —
e.g. several browser tabs/components independently fetching the same
diocese-wide "All Years, All Parishes" trend on mount — only the first
actually runs the work; the rest await that same in-flight task and share
its result (or its exception) instead of each firing an independent,
expensive RDS query. Observed live: 3 concurrent identical financial-trend
requests each holding a warehouse connection for 39s+, collectively
exhausting the read pool.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

_in_flight: dict[str, asyncio.Task] = {}
_lock = asyncio.Lock()


async def coalesce(key: str, factory: Callable[[], Awaitable[Any]]) -> Any:
    async with _lock:
        task = _in_flight.get(key)
        if task is None:
            task = asyncio.create_task(factory())

            def _cleanup(_: asyncio.Task, k: str = key) -> None:
                if _in_flight.get(k) is task:
                    del _in_flight[k]

            task.add_done_callback(_cleanup)
            _in_flight[key] = task
    return await task
