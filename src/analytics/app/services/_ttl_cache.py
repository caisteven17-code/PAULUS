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

# For genuinely unbounded-by-year ("All Years") requests specifically — the
# single most expensive query shape (zero date filtering, full history every
# time). Full diocesan history barely changes minute to minute — new
# submissions only ever affect the current period — so a much longer window
# is safe here and meaningfully cuts how often the expensive computation
# actually runs.
UNSCOPED_TTL_SECONDS = 300

_cache: dict[str, tuple[float, Any]] = {}


async def cached(
    key: str,
    ttl_seconds: float,
    factory: Callable[[], Awaitable[Any]],
    should_cache: Callable[[Any], bool] = lambda _result: True,
) -> Any:
    """`should_cache` guards against freezing a transient failure into the
    cache: several callers deliberately catch an AWS read failure and return
    an honest "data_sufficient: false" result instead of raising (e.g. a
    scoped financial-trend request during RDS contention) — that's a
    perfectly good *response*, but it's the wrong thing to cache, since it
    represents "the query didn't work this time," not a stable real answer.
    Caching it anyway means everyone sees that same false "no data" for the
    full TTL window even after the underlying data/contention issue clears.
    Callers whose result shape distinguishes a real answer from a fallback
    (via a `data_sufficient` flag, typically) should pass a predicate here;
    the default caches unconditionally for callers where that risk doesn't
    apply.
    """
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
        if should_cache(result):
            _cache[key] = (time.monotonic(), result)
        return result

    return await _singleflight.coalesce(f"ttl_cache:{key}", _compute_and_store)
