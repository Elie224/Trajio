"""Security regressions: configuration, passwords, tokens, search exposure."""

import secrets
from datetime import UTC, datetime
from types import SimpleNamespace

import jwt
import pytest
from app.api.deps import require_verified_driver, require_verified_phone
from app.api.v1.endpoints.search import escape_like, fuzz_coordinate, public_driver_name
from app.core.config import Settings
from app.core.rate_limit import AccountRateLimiter
from app.core.security import (
    decode_token,
    issue_access_token,
    issue_purpose_token,
    password_fingerprint,
    password_policy_error,
)
from app.models import IdDocumentStatus
from app.schemas.auth import LoginRequest, RegisterRequest, RegisterResponse
from app.schemas.booking import BookingCreateRequest
from app.schemas.trip import TripUpdateRequest
from fastapi import HTTPException
from httpx import AsyncClient
from pydantic import ValidationError

STRONG_SECRET = secrets.token_urlsafe(48)
STRONG_DB_PASSWORD = secrets.token_urlsafe(24)


# -- Configuration ------------------------------------------------------------
@pytest.mark.parametrize(
    "secret", ["dev-insecure-secret-change-me", "change-me-in-production", "short", "a" * 64]
)
def test_weak_secret_key_is_refused_outside_development(secret: str) -> None:
    with pytest.raises(ValidationError):
        Settings(APP_ENV="production", SECRET_KEY=secret, POSTGRES_PASSWORD=STRONG_DB_PASSWORD)


def test_default_db_password_is_refused_outside_development() -> None:
    with pytest.raises(ValidationError):
        Settings(APP_ENV="staging", SECRET_KEY=STRONG_SECRET, POSTGRES_PASSWORD="trajio")


def test_debug_is_refused_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(
            APP_ENV="production",
            SECRET_KEY=STRONG_SECRET,
            POSTGRES_PASSWORD=STRONG_DB_PASSWORD,
            DEBUG=True,
        )


def test_strong_configuration_is_accepted_in_production() -> None:
    settings = Settings(
        APP_ENV="production",
        SECRET_KEY=STRONG_SECRET,
        POSTGRES_PASSWORD=STRONG_DB_PASSWORD,
        RATE_LIMIT_STORAGE_URI="redis://localhost:6379/0",
        ALLOWED_HOSTS="trajio.fr",
    )
    assert settings.secret_key_is_weak is False


def test_memory_rate_limit_is_refused_outside_development() -> None:
    with pytest.raises(ValidationError):
        Settings(
            APP_ENV="production",
            SECRET_KEY=STRONG_SECRET,
            POSTGRES_PASSWORD=STRONG_DB_PASSWORD,
            RATE_LIMIT_STORAGE_URI="memory://",
            ALLOWED_HOSTS="trajio.fr",
        )


def test_wildcard_hosts_are_refused_outside_development() -> None:
    with pytest.raises(ValidationError):
        Settings(
            APP_ENV="staging",
            SECRET_KEY=STRONG_SECRET,
            POSTGRES_PASSWORD=STRONG_DB_PASSWORD,
            RATE_LIMIT_STORAGE_URI="redis://localhost:6379/0",
            ALLOWED_HOSTS="*",
        )


def test_weak_secret_is_tolerated_but_flagged_in_development() -> None:
    settings = Settings(APP_ENV="development", SECRET_KEY="dev-insecure-secret-change-me")
    assert settings.secret_key_is_weak is True


def test_driver_and_phone_verification_block_when_required(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "REQUIRE_IDENTITY_VERIFICATION", True)
    unverified = SimpleNamespace(
        email_verified_at=None,
        phone_verified_at=None,
        license_verified_at=None,
        id_document_status=IdDocumentStatus.PENDING,
    )
    with pytest.raises(HTTPException) as blocked:
        require_verified_driver(unverified)
    assert blocked.value.status_code == 403
    with pytest.raises(HTTPException) as phone:
        require_verified_phone(unverified)
    assert phone.value.status_code == 403
    now = datetime.now(UTC)
    verified = SimpleNamespace(
        email_verified_at=now,
        phone_verified_at=now,
        license_verified_at=now,
        id_document_status=IdDocumentStatus.VERIFIED,
    )
    require_verified_driver(verified)
    require_verified_phone(verified)


# -- Passwords ----------------------------------------------------------------
@pytest.mark.parametrize("password", ["court", "Password1!", "azertyuiop123", "aaaaaaaaaaaaaa"])
def test_weak_passwords_are_rejected(password: str) -> None:
    assert password_policy_error(password) is not None
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@example.com", first_name="A", last_name="B", password=password)


def test_strong_password_is_accepted() -> None:
    assert password_policy_error("Velo-Rouge-sur-la-Loire") is None


def test_login_does_not_apply_the_creation_policy() -> None:
    LoginRequest(email="a@example.com", password="ancien8c")


def test_register_response_does_not_disclose_the_account() -> None:
    assert set(RegisterResponse.model_fields) == {"message", "verification_required"}


# -- Tokens -------------------------------------------------------------------
def test_access_token_carries_issued_at() -> None:
    from uuid import uuid4

    payload = decode_token(issue_access_token(user_id=uuid4(), role="passenger"))
    assert isinstance(payload["iat"], int)


def test_reset_token_is_bound_to_the_current_password() -> None:
    from uuid import uuid4

    token = issue_purpose_token(
        user_id=uuid4(),
        purpose="reset_password",
        expires_minutes=5,
        extra={"pwd": password_fingerprint("old-hash")},
    )
    claims = jwt.decode(token, options={"verify_signature": False})
    assert claims["pwd"] == password_fingerprint("old-hash")
    assert claims["pwd"] != password_fingerprint("new-hash")


# -- Rate limiting --------------------------------------------------------------
def test_account_rate_limiter_blocks_after_the_limit() -> None:
    limiter = AccountRateLimiter()
    for _ in range(3):
        limiter.hit("login", "User@Example.com", limit=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc_info:
        limiter.hit("login", "user@example.com ", limit=3, window_seconds=60)
    assert exc_info.value.status_code == 429


# -- Search exposure ------------------------------------------------------------
def test_like_wildcards_are_escaped() -> None:
    assert escape_like("50%_a\\b") == "50\\%\\_a\\\\b"


def test_coordinates_are_rounded_for_display() -> None:
    assert fuzz_coordinate(48.856613, 2) == 48.86


def test_public_driver_name_keeps_only_the_initial() -> None:
    assert public_driver_name("Marie", "Dupont") == "Marie D."
    assert public_driver_name("Marie", " ") == "Marie"


async def test_search_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/v1/search/trips")
    assert response.status_code == 401


async def test_data_export_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me/export")
    assert response.status_code == 401


async def test_forged_token_is_rejected(client: AsyncClient) -> None:
    from uuid import uuid4

    forged = jwt.encode(
        {"sub": str(uuid4()), "type": "access", "role": "admin"},
        "attacker-guess-" * 4,
        algorithm="HS256",
    )
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


# -- HTTP hardening -----------------------------------------------------------
async def test_security_headers_are_set(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "Referrer-Policy" in response.headers


async def test_cors_does_not_reflect_arbitrary_origins(client: AsyncClient) -> None:
    response = await client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers.get("access-control-allow-origin") != "https://evil.example"


# -- Free text bounds ---------------------------------------------------------
def test_free_text_fields_are_bounded() -> None:
    from uuid import uuid4

    with pytest.raises(ValidationError):
        BookingCreateRequest(trip_id=uuid4(), message="x" * 501)
    with pytest.raises(ValidationError):
        TripUpdateRequest(comments="x" * 1001)
