"""Application settings, loaded from environment variables and .env files.

Single source of truth for every runtime knob. Secrets are never hardcoded
here: they are resolved from the environment, with development-only defaults.
Outside development, weak or well-known secrets make the application refuse
to start.
"""

from functools import lru_cache
from typing import Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_ENVIRONMENTS = frozenset({"development", "dev", "local", "test"})
MIN_SECRET_KEY_LENGTH = 32
KNOWN_WEAK_SECRETS = frozenset(
    {
        "",
        "dev-insecure-secret-change-me",
        "change-me-in-production",
        "change-me",
        "changeme",
        "secret",
        "secret-key",
        "supersecret",
    }
)
WEAK_DB_PASSWORDS = frozenset(
    {"", "trajio", "postgres", "password", "admin", "root", "change-me", "changeme"}
)


class Settings(BaseSettings):
    """Runtime configuration for the Trajio API."""

    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -- Application ------------------------------------------------------
    PROJECT_NAME: str = "Trajio API"
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # -- Server -----------------------------------------------------------
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # -- Database ---------------------------------------------------------
    POSTGRES_USER: str = "trajio"
    # Development-only default: refused outside development.
    POSTGRES_PASSWORD: str = "trajio"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "trajio"
    # Full override. When empty, it is derived from the POSTGRES_* parts above.
    DATABASE_URL: str = ""
    SQL_ECHO: bool = False
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # -- Security ---------------------------------------------------------
    # Development-only default: refused outside development.
    SECRET_KEY: str = "dev-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # -- Rate limiting ----------------------------------------------------
    RATE_LIMIT_ENABLED: bool = True
    # "memory://" is per process; use e.g. "redis://..." with several workers.
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # -- CORS -------------------------------------------------------------
    # Comma-separated list, to stay friendly to plain .env files.
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # -- Geospatial defaults ---------------------------------------------
    DEFAULT_SEARCH_RADIUS_M: int = 5000
    MAX_SEARCH_RADIUS_M: int = 20000
    # Extra distance a driver accepts in order to serve a passenger.
    MAX_DETOUR_RATIO: float = 0.30
    MAX_DETOUR_MINUTES: int = 20
    # Decimals kept on coordinates exposed by the public search (2 ~ 1 km).
    SEARCH_COORDINATE_DECIMALS: int = 2

    # -- Derived values ---------------------------------------------------
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def async_database_url(self) -> str:
        """SQLAlchemy URL for the async driver used by the application."""
        if self.DATABASE_URL:
            return self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://").replace(
                "postgresql://", "postgresql+asyncpg://"
            )
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def sync_database_url(self) -> str:
        """SQLAlchemy URL for the sync driver (Alembic, maintenance scripts)."""
        if self.DATABASE_URL:
            return self.DATABASE_URL.replace("postgres://", "postgresql+psycopg://").replace(
                "postgresql+asyncpg://", "postgresql+psycopg://"
            )
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"production", "prod"}

    @property
    def is_development(self) -> bool:
        return self.APP_ENV.lower() in DEV_ENVIRONMENTS

    @property
    def secret_key_is_weak(self) -> bool:
        key = self.SECRET_KEY
        lowered = key.lower()
        return (
            len(key) < MIN_SECRET_KEY_LENGTH
            or lowered in KNOWN_WEAK_SECRETS
            or "change-me" in lowered
            or "changeme" in lowered
            or len(set(key)) < 10
        )

    @model_validator(mode="after")
    def _refuse_weak_secrets_outside_development(self) -> Self:
        if self.is_development:
            return self
        problems: list[str] = []
        if self.secret_key_is_weak:
            problems.append(
                f"SECRET_KEY est faible ou connue (au moins {MIN_SECRET_KEY_LENGTH} caracteres "
                "aleatoires requis)"
            )
        if not self.DATABASE_URL and self.POSTGRES_PASSWORD.lower() in WEAK_DB_PASSWORDS:
            problems.append("POSTGRES_PASSWORD est une valeur par defaut")
        if self.DEBUG:
            problems.append("DEBUG doit etre faux hors developpement")
        if problems:
            raise ValueError(
                f"Configuration refusee pour APP_ENV={self.APP_ENV!r} : " + " ; ".join(problems)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton, used as a FastAPI dependency."""
    return Settings()


settings = get_settings()
