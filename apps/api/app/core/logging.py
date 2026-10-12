"""Logging configuration for the API process."""

import logging
import sys

from app.core.config import settings

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def configure_logging() -> None:
    """Configure root logging once, at application startup."""
    level = logging.DEBUG if settings.DEBUG else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%dT%H:%M:%S%z"))

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)

    # Third-party loggers are noisy at DEBUG level.
    for noisy in ("uvicorn.access", "sqlalchemy.engine.Engine", "geoalchemy2"):
        logging.getLogger(noisy).setLevel(logging.INFO)
