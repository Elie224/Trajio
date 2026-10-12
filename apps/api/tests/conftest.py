"""Shared pytest fixtures."""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """In-process HTTP client bound to the ASGI app.

    ASGITransport never opens a real socket, so these tests run without
    starting uvicorn. The endpoints under test do not touch the database.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client
