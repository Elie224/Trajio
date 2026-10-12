"""FastAPI application factory and entrypoint for Trajio."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging

logger = logging.getLogger("app.startup")

# Values that must never reach a deployed environment.
INSECURE_DEFAULTS = {"SECRET_KEY": "dev-insecure-secret-change-me"}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown hooks.

    The schema is owned by Alembic, never by the application process: run
    "alembic upgrade head" rather than an implicit create_all at boot.
    """
    configure_logging()
    warn_about_insecure_defaults()
    yield


def warn_about_insecure_defaults() -> None:
    """Log loudly, at boot, when a development-only value is still in use."""
    for name, insecure_value in INSECURE_DEFAULTS.items():
        if getattr(settings, name, None) != insecure_value:
            continue
        message = (
            f"{name} still holds its development default. "
            "Generate a real value before deploying anywhere."
        )
        (logger.error if settings.is_production else logger.warning)(message)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=__version__,
        description="Trajio - Covoiturage de proximite. Meme direction, partageons le trajet.",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # The liveness probe stays at the root, outside the versioned API.
    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
