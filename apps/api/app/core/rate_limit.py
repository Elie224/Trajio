"""Rate limiting: per client IP (slowapi) and per account (in-process window)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings

TOO_MANY_REQUESTS_MESSAGE = "Trop de tentatives. Reessayez plus tard."

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.RATE_LIMIT_ENABLED,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
)


def _seconds_until_reset(request: Request, exc: RateLimitExceeded) -> int:
    """Time left in the current window, falling back to the full window length."""
    try:
        current_limit, args = request.state.view_rate_limit
        reset_at, _ = limiter.limiter.get_window_stats(current_limit, *args)
        return max(1, int(reset_at - time.time()) + 1)
    except Exception:  # noqa: BLE001 - never fail the 429 itself
        try:
            return int(exc.limit.limit.get_expiry())
        except AttributeError:
            return 60


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = _seconds_until_reset(request, exc)
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": TOO_MANY_REQUESTS_MESSAGE},
        headers={"Retry-After": str(retry_after)},
    )


class AccountRateLimiter:
    """Sliding-window counter keyed by an account identifier (e.g. an email).

    In-process only: with several workers or hosts, back it with Redis.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _key(scope: str, identifier: str) -> str:
        return f"{scope}:{identifier.strip().lower()}"

    def hit(self, scope: str, identifier: str, *, limit: int, window_seconds: int) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        key = self._key(scope, identifier)
        now = time.monotonic()
        with self._lock:
            window = self._hits[key]
            while window and now - window[0] > window_seconds:
                window.popleft()
            if len(window) >= limit:
                retry_after = max(1, int(window_seconds - (now - window[0])) + 1)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=TOO_MANY_REQUESTS_MESSAGE,
                    headers={"Retry-After": str(retry_after)},
                )
            window.append(now)

    def reset(self, scope: str, identifier: str) -> None:
        with self._lock:
            self._hits.pop(self._key(scope, identifier), None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


account_limiter = AccountRateLimiter()
