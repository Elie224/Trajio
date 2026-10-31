"""Regression: a request handler must not write files in the repository tree.

A leftover debug block used to append to `<repo>/debug-*.log` on every
`POST /auth/forgot-password` call. In production that wrote an unbounded file
into the deployment tree, on every request, and hid the fact behind a bare
`except Exception: pass`.

These tests pin the absence of that side effect: nothing in the repository root
is created, grown or modified when the endpoint is called.
"""

from types import SimpleNamespace

import pytest
from app.api.deps import get_db_session
from app.core.config import REPO_ROOT
from app.main import app
from httpx import AsyncClient


def _snapshot_repo_root() -> dict[str, int]:
    """Size of every file of the repository root, keyed by name.

    Comparing the sizes catches a file that already existed and was appended
    to, not only the files that appear from scratch.
    """
    return {
        path.name: path.stat().st_size
        for path in REPO_ROOT.iterdir()
        if path.is_file() and not path.name.endswith(".log")
    }


class _UnknownAccountSession:
    """A session where the address matches no account."""

    async def scalar(self, _statement):
        return None


class _KnownAccountSession:
    """A session where the address matches an existing account."""

    async def scalar(self, _statement):
        return SimpleNamespace(
            id="00000000-0000-0000-0000-000000000001",
            email="ada@example.com",
            password_hash="hash",
        )


@pytest.fixture
def fake_session(monkeypatch: pytest.MonkeyPatch):
    """Replaces the database session with a fake one, per test."""

    def _install(session_factory):
        async def _session():
            yield session_factory()

        monkeypatch.setitem(app.dependency_overrides, get_db_session, _session)

    return _install


@pytest.fixture
def no_log_in_repo_root():
    """Removes the leftover debug logs so their creation is observable.

    The bug appended to a file that may already exist: without this, a test
    that only compared file names would pass even with the bug in place.
    """
    for path in REPO_ROOT.glob("debug-*.log"):
        path.unlink()
    yield
    for path in REPO_ROOT.glob("debug-*.log"):
        path.unlink()


async def test_forgot_password_writes_no_file_in_the_repository(
    client: AsyncClient,
    fake_session,
    no_log_in_repo_root,
) -> None:
    """The endpoint must not create any file next to the sources."""
    fake_session(_UnknownAccountSession)
    before = _snapshot_repo_root()

    response = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "nobody@example.com"}
    )

    assert response.status_code == 200
    assert _snapshot_repo_root() == before, (
        "the request handler wrote a file in the repository root"
    )
    assert list(REPO_ROOT.glob("debug-*.log")) == [], (
        "the request handler created a debug log in the repository root"
    )


async def test_forgot_password_writes_no_file_when_the_account_exists(
    client: AsyncClient,
    fake_session,
    no_log_in_repo_root,
) -> None:
    """The side effect must be absent on the account-found path too.

    The debug block used to record whether the address matched an account, so
    it behaved differently depending on the branch taken.
    """
    fake_session(_KnownAccountSession)
    before = _snapshot_repo_root()

    response = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "ada@example.com"}
    )

    assert response.status_code == 200
    assert _snapshot_repo_root() == before, (
        "the request handler wrote a file in the repository root"
    )
    assert list(REPO_ROOT.glob("debug-*.log")) == [], (
        "the request handler created a debug log in the repository root"
    )
