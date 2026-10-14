"""Authentication and token helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

PASSWORD_HASHER = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return PASSWORD_HASHER.verify(password, hashed_password)


def issue_access_token(*, user_id: UUID, role: str) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "type": "access",
            "exp": expires_at,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def issue_purpose_token(*, user_id: UUID, purpose: str, expires_minutes: int) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    return jwt.encode(
        {
            "sub": str(user_id),
            "purpose": purpose,
            "type": "purpose",
            "exp": expires_at,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def issue_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
