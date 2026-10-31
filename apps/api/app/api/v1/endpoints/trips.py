"""Trip publication and management endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user, require_verified_driver
from app.core.rate_limit import account_limiter, limiter
from app.models import Booking, BookingStatus, Trip, TripStatus, User, Vehicle
from app.schemas.auth import AuthMessage
from app.schemas.trip import TripCreateRequest, TripPublic, TripUpdateRequest

router = APIRouter(prefix="/trips", tags=["trips"])

# Columns that are NOT NULL in the database: an explicit null is a client error.
NON_NULLABLE_UPDATE_FIELDS = frozenset(
    {
        "origin_label",
        "destination_label",
        "origin_lat",
        "origin_lng",
        "destination_lat",
        "destination_lng",
        "departure_time",
        "seats_total",
        "is_paid",
        "max_detour_ratio",
    }
)


async def _get_driver_vehicle(session: AsyncSession, user: User, vehicle_id: UUID) -> Vehicle:
    vehicle = await session.scalar(
        select(Vehicle).where(
            Vehicle.id == vehicle_id,
            Vehicle.owner_id == user.id,
            Vehicle.is_active.is_(True),
        )
    )
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule introuvable ou inactif.",
        )
    return vehicle


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _ensure_future(departure_time: datetime) -> None:
    if departure_time.tzinfo is None:
        raise _unprocessable("La date de départ doit préciser son fuseau horaire.")
    if departure_time <= datetime.now(UTC):
        raise _unprocessable("La date de départ doit être dans le futur.")


@router.post("", response_model=TripPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def create_trip(
    request: Request,
    payload: TripCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> TripPublic:
    account_limiter.hit("create-trip", str(user.id), limit=10, window_seconds=3600)
    require_verified_driver(user)
    vehicle = await _get_driver_vehicle(session, user, payload.vehicle_id)
    if payload.seats_total > vehicle.seats_total:
        raise _unprocessable("Le nombre de places dépasse la capacité du véhicule.")
    _ensure_future(payload.departure_time)

    trip = Trip(
        driver_id=user.id,
        vehicle_id=payload.vehicle_id,
        origin_label=payload.origin_label,
        destination_label=payload.destination_label,
        origin_lat=payload.origin_lat,
        origin_lng=payload.origin_lng,
        destination_lat=payload.destination_lat,
        destination_lng=payload.destination_lng,
        departure_time=payload.departure_time,
        seats_total=payload.seats_total,
        seats_available=payload.seats_total,
        is_paid=payload.is_paid,
        price_per_seat_cents=payload.price_per_seat_cents,
        max_detour_ratio=payload.max_detour_ratio,
        driver_preferences=payload.driver_preferences,
        comments=payload.comments,
    )
    session.add(trip)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Impossible de publier ce trajet pour le moment.",
        ) from exc

    await session.refresh(trip)
    return TripPublic.model_validate(trip)


@router.get("/mine", response_model=list[TripPublic])
async def list_my_trips(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> list[TripPublic]:
    rows = await session.scalars(
        select(Trip).where(Trip.driver_id == user.id).order_by(Trip.departure_time.desc())
    )
    return [TripPublic.model_validate(trip) for trip in rows]


@router.patch("/{trip_id}", response_model=TripPublic)
@limiter.limit("60/hour")
async def update_trip(
    request: Request,
    trip_id: UUID,
    payload: TripUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> TripPublic:
    # Row lock: concurrent bookings must wait until the seat count is settled.
    trip = await session.scalar(
        select(Trip).where(Trip.id == trip_id, Trip.driver_id == user.id).with_for_update()
    )
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trajet introuvable.")
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seuls les trajets planifiés peuvent être modifiés.",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field_name in NON_NULLABLE_UPDATE_FIELDS:
        if field_name in updates and updates[field_name] is None:
            raise _unprocessable(f"Le champ {field_name} ne peut pas être vide.")

    booked_seats = trip.seats_total - trip.seats_available
    if "seats_total" in updates:
        new_total = updates["seats_total"]
        vehicle = await session.scalar(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
        if vehicle is None or new_total > vehicle.seats_total:
            raise _unprocessable("Le nombre de places dépasse la capacité du véhicule.")
        if new_total < booked_seats:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Impossible de descendre sous le nombre de places déjà réservées.",
            )
    if "departure_time" in updates:
        _ensure_future(updates["departure_time"])

    for field_name, value in updates.items():
        setattr(trip, field_name, value)
    trip.seats_available = trip.seats_total - booked_seats

    if trip.is_paid is False:
        trip.price_per_seat_cents = None
    elif trip.price_per_seat_cents is None:
        raise _unprocessable("Le prix est requis pour un trajet payant.")

    await session.commit()
    await session.refresh(trip)
    return TripPublic.model_validate(trip)


@router.post("/{trip_id}/cancel", response_model=AuthMessage)
@limiter.limit("30/hour")
async def cancel_trip(
    request: Request,
    trip_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    trip = await session.scalar(
        select(Trip).where(Trip.id == trip_id, Trip.driver_id == user.id).with_for_update()
    )
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trajet introuvable.")
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce trajet n'est plus annulable.",
        )

    now = datetime.now(UTC)
    trip.status = TripStatus.CANCELLED
    trip.cancelled_at = now
    # Cascade: pending and accepted bookings of this trip are cancelled too.
    await session.execute(
        update(Booking)
        .where(
            Booking.trip_id == trip.id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.ACCEPTED]),
        )
        .values(status=BookingStatus.CANCELLED, cancelled_at=now)
    )
    await session.commit()
    return AuthMessage(message="Trajet annulé, réservations associées annulées.")
