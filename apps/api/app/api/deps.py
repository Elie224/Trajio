"""Reusable API dependencies."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_session
from app.models import User, UserStatus


async def get_db_session(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[AsyncSession]:
    yield session


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    return authorization[len(prefix) :].strip() or None


async def get_current_user(
    session: AsyncSession = Depends(get_db_session),
    authorization: str | None = Header(default=None),
    access_token_cookie: str | None = Cookie(default=None, alias="trajio_access_token"),
) -> User:
    token = access_token_cookie or _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")

    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton invalide."
        ) from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton invalide.")

    user_id_raw = payload.get("sub")
    if not isinstance(user_id_raw, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton invalide.")

    try:
        user_id = UUID(user_id_raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton invalide."
        ) from exc

    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable.")

    if user.status in {UserStatus.BANNED, UserStatus.SUSPENDED}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ce compte ne peut pas accéder à cette ressource.",
        )

    return user


async def require_active_user(user: User = Depends(get_current_user)) -> User:
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte doit être actif pour cette action.",
        )
    return user
