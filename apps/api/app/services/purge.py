"""Periodic hygiene: drop expired or long-revoked refresh tokens."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.db.session import async_session_scope
from app.models import RefreshToken

logger = logging.getLogger("trajio.purge")


async def purge_stale_refresh_tokens() -> None:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=7)
    try:
        async with async_session_scope() as session:
            expired = await session.execute(
                delete(RefreshToken).where(RefreshToken.expires_at < now)
            )
            revoked = await session.execute(
                delete(RefreshToken).where(
                    RefreshToken.revoked_at.is_not(None),
                    RefreshToken.revoked_at < cutoff,
                )
            )
        logger.info(
            "purged refresh tokens expired=%s revoked=%s",
            expired.rowcount,
            revoked.rowcount,
        )
    except Exception:
        logger.exception("refresh token purge skipped (database unavailable)")
