"""FastAPI application factory and entrypoint for Trajio."""

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

from app import __version__
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.services.admin import bootstrap_admin
from app.services.purge import purge_stale_refresh_tokens

logger = logging.getLogger("app.startup")
db_logger = logging.getLogger("app.database")
admin_logger = logging.getLogger("app.admin")

SERVICE_UNAVAILABLE_DETAIL = "Service indisponible"
DB_RETRY_AFTER_SECONDS = 5

CORS_ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOWED_HEADERS = ["Content-Type", "Authorization", "Accept"]

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store",
}
# Kept off in development: Swagger UI loads its assets from a CDN.
PRODUCTION_SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown hooks.

    The schema is owned by Alembic, never by the application process: run
    "alembic upgrade head" rather than an implicit create_all at boot.
    """
    configure_logging()
    warn_about_insecure_defaults()
    if not settings.is_development:
        await purge_stale_refresh_tokens()
    await bootstrap_admin_account()
    yield


async def bootstrap_admin_account() -> None:
    """Promote the configured account to administrator, once, at startup.

    Without an administrator the dashboard is unreachable, and the role is
    never granted through the API. The promotion is idempotent and only ever
    promotes: it never demotes an existing administrator.
    """
    email = settings.ADMIN_BOOTSTRAP_EMAIL.strip()
    if not email or not settings.ADMIN_BOOTSTRAP_ENABLED:
        return

    from app.db.session import async_session_scope

    try:
        async with async_session_scope() as session:
            promoted = await bootstrap_admin(session, email)
    except Exception:
        admin_logger.exception("admin bootstrap skipped (database unavailable)")
        return

    if promoted is None:
        admin_logger.warning(
            "admin bootstrap skipped: no active account for %s", email
        )
    else:
        admin_logger.info("administrator account ready: %s", email)


def warn_about_insecure_defaults() -> None:
    """Log loudly in development; outside it, Settings already refuses to load."""
    if settings.secret_key_is_weak:
        logger.warning(
            "SECRET_KEY is weak or a known default. "
            "Generate a real value before deploying anywhere."
        )


async def security_headers_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if settings.is_production:
        for name, value in PRODUCTION_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
    return response


def _service_unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": SERVICE_UNAVAILABLE_DETAIL},
        headers={"Retry-After": str(DB_RETRY_AFTER_SECONDS)},
    )


async def database_unavailable_handler(request: Request, exc: Exception) -> JSONResponse:
    """Database unreachable: a clean 503, the details stay in the server logs."""
    db_logger.error(
        "Database unavailable on %s %s: %s",
        request.method,
        request.url.path,
        type(exc).__name__,
        exc_info=exc,
    )
    return _service_unavailable()


async def dbapi_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Other driver errors: 503 if the connection was lost, else an opaque 500."""
    if isinstance(exc, DBAPIError) and exc.connection_invalidated:
        return await database_unavailable_handler(request, exc)
    db_logger.error("Database error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne"})


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

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    for exc_class in (OperationalError, InterfaceError, ConnectionError):
        app.add_exception_handler(exc_class, database_unavailable_handler)
    app.add_exception_handler(DBAPIError, dbapi_error_handler)

    app.middleware("http")(security_headers_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=CORS_ALLOWED_METHODS,
        allow_headers=CORS_ALLOWED_HEADERS,
        expose_headers=["Retry-After"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)

    # The liveness probe stays at the root, outside the versioned API.
    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
