"""Liveness and readiness probes.

GET /health is a pure liveness probe: it answers even when the database is
down, so an orchestrator can tell "process alive" from "dependency broken".
GET /health/ready is the readiness probe and does talk to PostgreSQL/PostGIS.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app import __version__
from app.core.config import settings
from app.db.session import async_session_scope

router = APIRouter()


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": __version__,
        "environment": settings.APP_ENV,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/health/ready", summary="Readiness probe, checks PostgreSQL and PostGIS")
async def readiness(response: Response) -> dict[str, object]:
    checks: dict[str, object] = {"status": "ok"}

    try:
        async with async_session_scope() as session:
            await session.execute(text("SELECT 1"))
            postgis = await session.execute(text("SELECT PostGIS_Version()"))
            checks["postgis_version"] = postgis.scalar_one()
        checks["database"] = "up"
    except Exception as exc:  # noqa: BLE001 - a probe must never leak internals
        checks["status"] = "degraded"
        checks["database"] = "down"
        checks["error"] = type(exc).__name__
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return checks
