"""Liveness endpoint contract."""

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "Trajio API"
    assert "version" in body
    assert "timestamp" in body


async def test_health_is_mounted_under_api_v1(client: AsyncClient) -> None:
    """The same contract is also exposed under the versioned prefix."""
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_readiness_degrades_instead_of_crashing(client: AsyncClient) -> None:
    """No database in the unit-test environment: must answer, never raise."""
    response = await client.get("/health/ready")

    assert response.status_code in (200, 503)
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert "database" in body


async def test_openapi_schema_is_generated(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    assert "/health" in response.json()["paths"]
