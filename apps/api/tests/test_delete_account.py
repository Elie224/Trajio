"""DELETE /me and GET /me/deletion-preview, without a database."""

from collections.abc import Iterator
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.api.v1.endpoints import auth as auth_endpoints
from app.core.rate_limit import account_limiter, limiter
from app.main import app

URL = "/api/v1/auth/me"


class FakeSession:
    def __init__(self, counts: list[int] | None = None) -> None:
        self.counts = list(counts or [])
        self.commits = 0

    async def scalar(self, _statement):
        return self.counts.pop(0)

    async def commit(self) -> None:
        self.commits += 1


@pytest.fixture
def fake_session() -> Iterator[FakeSession]:
    session = FakeSession()
    user = SimpleNamespace(id=uuid4(), password_hash="hash")

    async def _session():
        yield session

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = _session
    limiter.reset()
    account_limiter.clear()
    yield session
    app.dependency_overrides.clear()
    limiter.reset()
    account_limiter.clear()


async def test_delete_me_requires_auth(client) -> None:
    response = await client.request("DELETE", URL, json={"password": "x"})
    assert response.status_code == 401


async def test_delete_me_rejects_missing_password(client, fake_session) -> None:
    response = await client.request("DELETE", URL, json={})
    assert response.status_code == 422


async def test_delete_me_rejects_non_json_body(client, fake_session) -> None:
    response = await client.request(
        "DELETE", URL, content="password=x", headers={"Content-Type": "text/plain"}
    )
    assert response.status_code == 422


async def test_delete_me_wrong_password_is_403_and_writes_nothing(
    client, fake_session, monkeypatch
) -> None:
    monkeypatch.setattr(auth_endpoints, "verify_password", lambda *_: False)
    response = await client.request("DELETE", URL, json={"password": "mauvais"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Mot de passe incorrect."
    assert fake_session.commits == 0


async def test_delete_me_is_rate_limited_on_sixth_call(client, fake_session, monkeypatch) -> None:
    monkeypatch.setattr(auth_endpoints, "verify_password", lambda *_: False)
    codes = [
        (await client.request("DELETE", URL, json={"password": "x"})).status_code for _ in range(6)
    ]
    assert codes == [403] * 5 + [429]


async def test_deletion_preview_requires_auth(client) -> None:
    response = await client.get(f"{URL}/deletion-preview")
    assert response.status_code == 401


async def test_deletion_preview_returns_counts(client, fake_session) -> None:
    fake_session.counts = [2, 3]
    response = await client.get(f"{URL}/deletion-preview")
    assert response.status_code == 200
    assert response.json() == {"trips": 2, "bookings": 3}


async def test_deletion_preview_limit_ignores_spoofed_forwarded_for(client, fake_session) -> None:
    fake_session.counts = [0, 0] * 5
    codes = [
        (
            await client.get(
                f"{URL}/deletion-preview", headers={"X-Forwarded-For": f"203.0.113.{i}"}
            )
        ).status_code
        for i in range(6)
    ]
    assert codes == [200] * 5 + [429]
