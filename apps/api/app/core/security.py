"""Authentication, password policy and token helpers."""

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
MIN_PASSWORD_LENGTH = 12

# Most frequent passwords of 12+ characters (FR/EN leaks). Compared lowercased.
COMMON_PASSWORDS = frozenset(
    {
        "123456789012",
        "1234567890123",
        "123456789abc",
        "1q2w3e4r5t6y",
        "000000000000",
        "111111111111",
        "abcdefghijkl",
        "password1234",
        "password123!",
        "password12345",
        "passwordpassword",
        "motdepasse12",
        "motdepasse123",
        "motdepasse1234",
        "azertyuiop12",
        "azertyuiop123",
        "azertyuiopqs",
        "azerty123456",
        "azertyazerty",
        "qwertyuiop12",
        "qwertyuiop123",
        "qwerty123456",
        "qwertyqwerty",
        "iloveyou1234",
        "jetaime12345",
        "welcome12345",
        "football1234",
        "soleil123456",
        "bonjour12345",
        "marseille123",
        "marseille13",
        "doudou123456",
        "chouchou1234",
        "loulou123456",
        "admin1234567",
        "administrator",
        "letmein12345",
        "changeme1234",
        "trajio123456",
        "trajiotrajio",
        "covoiturage1",
        "covoiturage123",
    }
)


def password_policy_error(password: str) -> str | None:
    """Return a user-facing error message, or None when the password is acceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caracteres."
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS or len(set(lowered)) < 5 or "123456789" in lowered:
        return "Ce mot de passe est trop courant ou trop simple."
    return None


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return PASSWORD_HASHER.verify(password, hashed_password)


_DUMMY_HASH: str | None = None


def dummy_verify_password(password: str) -> None:
    """Spend the same time as a real check, so unknown emails are not detectable."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = PASSWORD_HASHER.hash(secrets.token_urlsafe(24))
    PASSWORD_HASHER.verify(password, _DUMMY_HASH)


def password_fingerprint(password_hash: str) -> str:
    """Short digest of the stored hash: changes as soon as the password changes.

    Embedded in reset tokens so that a token stops working once used.
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:32]


def issue_access_token(*, user_id: UUID, role: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def issue_purpose_token(
    *,
    user_id: UUID,
    purpose: str,
    expires_minutes: int,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "purpose": purpose,
        "type": "purpose",
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    if extra:
        claims.update(extra)
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def issue_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
