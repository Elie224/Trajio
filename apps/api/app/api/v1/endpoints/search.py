"""Trip search endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.matching import PassengerSearchInput, TripCandidateInput, score_trip_candidate
from app.models import Trip, TripStatus, User, Vehicle
from app.schemas.trip import TripSearchResponse, TripSearchResult

router = APIRouter(prefix="/search", tags=["search"])

LIKE_ESCAPE_CHAR = "\\"


def escape_like(value: str) -> str:
    """Neutralise LIKE wildcards supplied by the user."""
    return (
        value.replace(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR * 2)
        .replace("%", LIKE_ESCAPE_CHAR + "%")
        .replace("_", LIKE_ESCAPE_CHAR + "_")
    )


def fuzz_coordinate(value: float, decimals: int | None = None) -> float:
    """Round a coordinate for public display (2 decimals ~ 1 km).

    Deterministic on purpose: random noise could be averaged out over
    repeated searches.
    """
    places = settings.SEARCH_COORDINATE_DECIMALS if decimals is None else decimals
    return round(float(value), places)


def public_driver_name(first_name: str, last_name: str) -> str:
    """First name and last-name initial only, e.g. "Marie D."."""
    initial = last_name.strip()[:1].upper()
    return f"{first_name.strip()} {initial}." if initial else first_name.strip()


@router.get("/trips", response_model=TripSearchResponse)
@limiter.limit("60/minute")
async def search_trips(
    request: Request,
    origin_query: str | None = Query(default=None, min_length=2, max_length=160),
    destination_query: str | None = Query(default=None, min_length=2, max_length=160),
    date_filter: date | None = Query(default=None, alias="date"),
    earliest_time: time | None = Query(default=None),
    pickup_lat: float | None = Query(default=None, ge=-90, le=90),
    pickup_lng: float | None = Query(default=None, ge=-180, le=180),
    dropoff_lat: float | None = Query(default=None, ge=-90, le=90),
    dropoff_lng: float | None = Query(default=None, ge=-180, le=180),
    passengers: int = Query(default=1, ge=1, le=9),
    max_price_cents: int | None = Query(default=None, ge=0),
    limit: int = Query(default=30, ge=1, le=50),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_active_user),
) -> TripSearchResponse:
    candidate_limit = min(max(limit * 4, 30), 200)
    query = (
        select(
            Trip.id,
            Trip.driver_id,
            User.first_name,
            User.last_name,
            Vehicle.brand,
            Vehicle.model,
            Trip.origin_label,
            Trip.destination_label,
            Trip.origin_lat,
            Trip.origin_lng,
            Trip.destination_lat,
            Trip.destination_lng,
            Trip.departure_time,
            Trip.seats_total,
            Trip.seats_available,
            Trip.is_paid,
            Trip.price_per_seat_cents,
            Trip.max_detour_ratio,
        )
        .join(User, User.id == Trip.driver_id)
        .join(Vehicle, Vehicle.id == Trip.vehicle_id)
        .where(
            Trip.status == TripStatus.SCHEDULED,
            Trip.seats_available >= passengers,
            Trip.departure_time >= datetime.now(UTC),
            Vehicle.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        .order_by(Trip.departure_time.asc())
        .limit(candidate_limit)
    )

    if origin_query:
        query = query.where(
            Trip.origin_label.ilike(
                f"%{escape_like(origin_query.strip())}%", escape=LIKE_ESCAPE_CHAR
            )
        )
    if destination_query:
        query = query.where(
            Trip.destination_label.ilike(
                f"%{escape_like(destination_query.strip())}%", escape=LIKE_ESCAPE_CHAR
            )
        )
    if date_filter:
        start = datetime.combine(date_filter, time.min, tzinfo=UTC)
        end = start + timedelta(days=1)
        query = query.where(Trip.departure_time >= start, Trip.departure_time < end)
    if earliest_time:
        query = query.where(func.cast(Trip.departure_time, time) >= earliest_time)
    if max_price_cents is not None:
        query = query.where(
            or_(
                Trip.is_paid.is_(False),
                Trip.price_per_seat_cents <= max_price_cents,
            )
        )

    rows = (await session.execute(query)).all()
    search_input = PassengerSearchInput(
        passengers=passengers,
        date_filter=date_filter,
        earliest_time=earliest_time,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
    )
    ranked_items: list[TripSearchResult] = []
    for row in rows:
        # Scoring uses exact positions server-side; only rounded ones leave the API.
        score = score_trip_candidate(
            search_input,
            TripCandidateInput(
                origin_lat=float(row.origin_lat),
                origin_lng=float(row.origin_lng),
                destination_lat=float(row.destination_lat),
                destination_lng=float(row.destination_lng),
                departure_time=row.departure_time,
                seats_total=row.seats_total,
                seats_available=row.seats_available,
                max_detour_ratio=float(row.max_detour_ratio),
            ),
        )
        if score is None:
            continue

        ranked_items.append(
            TripSearchResult(
                id=row.id,
                driver_id=row.driver_id,
                driver_name=public_driver_name(row.first_name, row.last_name),
                vehicle_label=f"{row.brand} {row.model}",
                origin_label=row.origin_label,
                destination_label=row.destination_label,
                origin_lat=fuzz_coordinate(row.origin_lat),
                origin_lng=fuzz_coordinate(row.origin_lng),
                destination_lat=fuzz_coordinate(row.destination_lat),
                destination_lng=fuzz_coordinate(row.destination_lng),
                departure_time=row.departure_time,
                seats_available=row.seats_available,
                is_paid=row.is_paid,
                price_per_seat_cents=row.price_per_seat_cents,
                max_detour_ratio=float(row.max_detour_ratio),
                match_score=score.score,
                match_reasons=score.reasons,
                match_breakdown={
                    "proximity": score.breakdown.proximity_score,
                    "detour": score.breakdown.detour_score,
                    "schedule": score.breakdown.schedule_score,
                    "direction": score.breakdown.direction_score,
                    "seats": score.breakdown.seats_score,
                },
            )
        )

    ranked_items.sort(key=lambda item: item.match_score, reverse=True)
    items = ranked_items[:limit]
    return TripSearchResponse(items=items, total=len(ranked_items))
