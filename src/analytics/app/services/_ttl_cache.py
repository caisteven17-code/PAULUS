"""Short-TTL cache for expensive, frequently-duplicated computations.

Complements _singleflight.py: coalescing only dedupes requests that arrive
while a computation is already in flight — it does nothing for requests that
arrive moments *after* the previous one already finished (e.g. a second
dashboard tab loaded 10 seconds later). This adds a short-lived result cache
on top of coalescing, so those near-but-not-simultaneous requests can also
skip the underlying RDS round trip by reusing a still-fresh recent result.

Diocese-wide aggregates (parish clustering, the unscoped financial trend,
cluster forecasts) are built from periodic financial submissions, not
second-by-second data — a short cache window trades a small amount of
staleness for a large reduction in how often the expensive computation
actually runs.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.services import _singleflight

# Shared default for diocese-wide aggregate endpoints — long enough to
# absorb a burst of near-simultaneous requests, short enough that a real
# data change (a new/edited financial submission) shows up within about a
# minute and a half rather than feeling stuck.
DEFAULT_TTL_SECONDS = 90

_cache: dict[str, tuple[float, Any]] = {}


async def cached(key: str, ttl_seconds: float, factory: Callable[[], Awaitable[Any]]) -> Any:
    entry = _cache.get(key)
    if entry is not None and time.monotonic() - entry[0] < ttl_seconds:
        return entry[1]

    async def _compute_and_store() -> Any:
        # Re-check inside the coalesced computation: another caller may have
        # already refreshed the cache while this one waited for the
        # singleflight lock.
        entry = _cache.get(key)
        if entry is not None and time.monotonic() - entry[0] < ttl_seconds:
            return entry[1]
        result = await factory()
        _cache[key] = (time.monotonic(), result)
        return result

    return await _singleflight.coalesce(f"ttl_cache:{key}", _compute_and_store)
