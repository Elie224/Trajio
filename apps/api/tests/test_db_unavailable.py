"""Database outage: clean 503 and absolute .env paths."""

from collections.abc import Iterator
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.core import config
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

URL = "/api/v1/auth/me/deletion-preview"


def _boom(exc: Exception):
    class Session:
        async def scalar(self, *_):
            raise exc

        async def execute(self, *_):
            raise exc

    async def _session():
        yield Session()

    return _session


@pytest.fixture
def broken_db() -> Iterator[None]:
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
    limiter.reset()
    account_limiter.clear()
    yield
    app.dependency_overrides.clear()
    limiter.reset()
    account_limiter.clear()


@pytest.fixture
async def safe_client():
    # raise_app_exceptions=False: we assert on what a real client receives.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client


@pytest.mark.parametrize(
    "exc",
    [
        OperationalError("SELECT 1", {}, Exception("connection refused")),
        InterfaceError("SELECT 1", {}, Exception("connection is closed")),
        ConnectionRefusedError(10061, "refused"),
        DBAPIError("SELECT 1", {}, Exception("gone"), connection_invalidated=True),
    ],
)
async def test_database_down_returns_clean_503(safe_client, broken_db, exc) -> None:
    app.dependency_overrides[get_db_session] = _boom(exc)
    response = await safe_client.get(URL)
    assert response.status_code == 503
    assert response.json() == {"detail": "Service indisponible"}
    assert int(response.headers["Retry-After"]) > 0
    assert "Traceback" not in response.text
    assert "refused" not in response.text


async def test_other_dbapi_error_is_opaque_500(safe_client, broken_db) -> None:
    app.dependency_overrides[get_db_session] = _boom(
        DBAPIError("SELECT secret", {}, Exception("syntax error"))
    )
    response = await safe_client.get(URL)
    assert response.status_code == 500
    assert response.json() == {"detail": "Erreur interne"}
    assert "secret" not in response.text


def test_env_files_are_absolute_and_independent_of_cwd() -> None:
    root_env, api_env = config.ENV_FILES
    assert root_env.is_absolute() and api_env.is_absolute()
    assert (config.API_DIR / "app" / "core" / "config.py").is_file()
    assert root_env.parent == config.API_DIR.parent.parent
    assert (root_env.parent / "apps" / "api") == config.API_DIR
    assert config.Settings.model_config["env_file"] == config.ENV_FILES
