"""Live integration tests: run against a real uvicorn + local Postgres.

Enabled only when TRAJIO_LIVE_API is set (e.g. http://127.0.0.1:8100).
Uses dedicated throw-away accounts (@example.com) and dummy passwords.
"""

from __future__ import annotations

import itertools
import os
import uuid

import httpx
import psycopg
import pytest

BASE = os.environ.get("TRAJIO_LIVE_API")
pytestmark = pytest.mark.skipif(not BASE, reason="TRAJIO_LIVE_API not set")
_ip = itertools.count(1)
PASSWORD = "Dummy-Test-Pass-123!"


def next_ip() -> str:
    n = next(_ip) + int(uuid.uuid4().int % 50000)
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"


def new_client() -> httpx.Client:
    return httpx.Client(
        base_url=f"{BASE}/api/v1", timeout=30, headers={"X-Forwarded-For": next_ip()}
    )


def register_and_login(prefix: str = "u") -> tuple[httpx.Client, str]:
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    c = new_client()
    r = c.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "first_name": "Test", "last_name": "Auto"},
        headers={"X-Forwarded-For": next_ip()},
    )
    assert r.status_code == 201, r.text
    r = c.post(
        "/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"X-Forwarded-For": next_ip()},
    )
    assert r.status_code == 200, r.text
    return c, email


def mint_reset_token(db, email: str) -> str:
    from uuid import UUID

    from app.core.security import issue_purpose_token, password_fingerprint

    with db.cursor() as cur:
        cur.execute("select id::text, password_hash from users where email = %s", (email,))
        row = cur.fetchone()
    assert row is not None
    return issue_purpose_token(
        user_id=UUID(row[0]),
        purpose="reset_password",
        expires_minutes=30,
        extra={"pwd": password_fingerprint(row[1])},
    )


@pytest.fixture
def db():
    from app.core.config import settings

    url = settings.sync_database_url.replace("postgresql+psycopg://", "postgresql://")
    assert "@localhost" in url or "@127.0.0.1" in url, "DATABASE_URL must be local"
    with psycopg.connect(url, autocommit=True) as conn:
        yield conn
