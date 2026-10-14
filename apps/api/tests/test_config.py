"""Configuration and derived-URL contract."""

from app.core.config import Settings, get_settings


def test_settings_are_cached() -> None:
    assert get_settings() is get_settings()


def test_database_urls_are_derived_from_parts() -> None:
    settings = Settings(
        POSTGRES_USER="alice",
        POSTGRES_PASSWORD="s3cret",
        POSTGRES_HOST="db",
        POSTGRES_PORT=6543,
        POSTGRES_DB="trajio_test",
        DATABASE_URL="",
    )

    assert settings.async_database_url == "postgresql+asyncpg://alice:s3cret@db:6543/trajio_test"
    assert settings.sync_database_url == "postgresql+psycopg://alice:s3cret@db:6543/trajio_test"


def test_explicit_database_url_is_normalised_for_both_drivers() -> None:
    settings = Settings(DATABASE_URL="postgres://u:p@h:5432/d")

    assert settings.async_database_url.startswith("postgresql+asyncpg://")
    assert settings.sync_database_url.startswith("postgresql+psycopg://")


def test_cors_origins_are_parsed_from_a_comma_separated_list() -> None:
    settings = Settings(CORS_ORIGINS="http://localhost:3000, https://trajio.fr ,")

    assert settings.cors_origin_list == ["http://localhost:3000", "https://trajio.fr"]


def test_production_flag_drives_exposure_of_the_docs() -> None:
    strong = {
        "SECRET_KEY": "x9Fq2Lm7Rt4Vb8Nc1Zd6Hs3Pw5Jy0Ge-kA7uQ",
        "POSTGRES_PASSWORD": "Qm8-vT3z-Lp6-Wn2-Hx9",
    }
    assert Settings(APP_ENV="production", **strong).is_production is True
    assert Settings(APP_ENV="development").is_production is False
