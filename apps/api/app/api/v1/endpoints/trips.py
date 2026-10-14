"""Trip publication and management endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user
from app.models import Trip, TripStatus, User, Vehicle
from app.schemas.auth import AuthMessage
from app.schemas.trip import TripCreateRequest, TripPublic, TripUpdateRequest

router = APIRouter(prefix="/trips", tags=["trips"])


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


def _apply_trip_update(trip: Trip, payload: TripUpdateRequest) -> None:
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(trip, field_name, value)


@router.post("", response_model=TripPublic, status_code=status.HTTP_201_CREATED)
async def create_trip(
    payload: TripCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> TripPublic:
    vehicle = await _get_driver_vehicle(session, user, payload.vehicle_id)
    if payload.seats_total > vehicle.seats_total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le nombre de places dépasse la capacité du véhicule.",
        )

    now = datetime.now(UTC)
    if payload.departure_time <= now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de départ doit être dans le futur.",
        )

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
async def update_trip(
    trip_id: UUID,
    payload: TripUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> TripPublic:
    trip = await session.scalar(select(Trip).where(Trip.id == trip_id, Trip.driver_id == user.id))
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trajet introuvable.")
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seuls les trajets planifiés peuvent être modifiés.",
        )

    _apply_trip_update(trip, payload)
    if trip.seats_available > trip.seats_total:
        trip.seats_available = trip.seats_total
    if trip.is_paid is False:
        trip.price_per_seat_cents = None
    elif trip.price_per_seat_cents is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le prix est requis pour un trajet payant.",
        )

    await session.commit()
    await session.refresh(trip)
    return TripPublic.model_validate(trip)


@router.post("/{trip_id}/cancel", response_model=AuthMessage)
async def cancel_trip(
    trip_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    trip = await session.scalar(select(Trip).where(Trip.id == trip_id, Trip.driver_id == user.id))
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trajet introuvable.")
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce trajet n'est plus annulable.",
        )

    trip.status = TripStatus.CANCELLED
    trip.cancelled_at = datetime.now(UTC)
    await session.commit()
    return AuthMessage(message="Trajet annulé.")
