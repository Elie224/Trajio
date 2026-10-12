"""Aggregate router for /api/v1.

Each business module registers its own sub-router here as it is implemented.
No other module should import endpoints directly.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router

api_router = APIRouter()
# No prefix here: health_router already declares its own "/health" paths.
api_router.include_router(health_router, tags=["health"])

# Registered as modules are implemented, see docs/roadmap.md.
# api_router.include_router(auth_router,       prefix="/auth",      tags=["auth"])
# api_router.include_router(users_router,      prefix="/users",     tags=["users"])
# api_router.include_router(vehicles_router,   prefix="/vehicles",  tags=["vehicles"])
# api_router.include_router(trips_router,      prefix="/trips",     tags=["trips"])
# api_router.include_router(search_router,     prefix="/search",    tags=["search"])
# api_router.include_router(bookings_router,   prefix="/bookings",  tags=["bookings"])
# api_router.include_router(messages_router,   prefix="/messages",  tags=["messages"])
# api_router.include_router(reviews_router,    prefix="/reviews",   tags=["reviews"])
# api_router.include_router(reports_router,    prefix="/reports",   tags=["reports"])
# api_router.include_router(admin_router,      prefix="/admin",     tags=["admin"])
