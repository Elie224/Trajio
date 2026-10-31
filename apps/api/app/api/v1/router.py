"""Aggregate router for /api/v1.

Each business module registers its own sub-router here as it is implemented.
No other module should import endpoints directly.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.bookings import router as bookings_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.messages import router as messages_router
from app.api.v1.endpoints.reports import blocks_router
from app.api.v1.endpoints.reports import router as reports_router
from app.api.v1.endpoints.reviews import router as reviews_router
from app.api.v1.endpoints.search import router as search_router
from app.api.v1.endpoints.trips import router as trips_router
from app.api.v1.endpoints.vehicles import router as vehicles_router

api_router = APIRouter()
# No prefix here: health_router already declares its own "/health" paths.
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router)
api_router.include_router(vehicles_router)
api_router.include_router(trips_router)
api_router.include_router(search_router)
api_router.include_router(bookings_router)
api_router.include_router(messages_router)
api_router.include_router(reviews_router)
api_router.include_router(reports_router)
api_router.include_router(blocks_router)

# Remaining modules, see docs/roadmap.md.
# api_router.include_router(admin_router,      prefix="/admin",     tags=["admin"])
