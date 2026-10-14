"""Booking endpoints with transactional seat handling."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import get_db_session, require_active_user
from app.models import Booking, BookingStatus, Trip, TripStatus, User
from app.schemas.auth import AuthMessage
from app.schemas.booking import (
    BookingCreateRequest,
    BookingListResponse,
    BookingPublic,
    BookingView,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _to_booking_view(booking: Booking, trip: Trip, driver: User, passenger: User) -> BookingView:
    return BookingView(
        id=booking.id,
        trip_id=booking.trip_id,
        passenger_id=booking.passenger_id,
        requested_seats=booking.requested_seats,
        message=booking.message,
        status=booking.status,
        responded_at=booking.responded_at,
        cancelled_at=booking.cancelled_at,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        trip_origin_label=trip.origin_label,
        trip_destination_label=trip.destination_label,
        trip_departure_time=trip.departure_time,
        driver_id=driver.id,
        driver_name=f"{driver.first_name} {driver.last_name}",
        passenger_name=f"{passenger.first_name} {passenger.last_name}",
    )


async def _load_booking_for_passenger(
    session: AsyncSession, booking_id: UUID, passenger_id: UUID
) -> tuple[Booking, Trip]:
    row = await session.execute(
        select(Booking, Trip)
        .join(Trip, Trip.id == Booking.trip_id)
        .where(Booking.id == booking_id, Booking.passenger_id == passenger_id)
        .with_for_update()
    )
    result = row.first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Réservation introuvable.",
        )
    booking, trip = result
    return booking, trip


async def _load_booking_for_driver(
    session: AsyncSession, booking_id: UUID, driver_id: UUID
) -> tuple[Booking, Trip]:
    row = await session.execute(
        select(Booking, Trip)
        .join(Trip, Trip.id == Booking.trip_id)
        .where(Booking.id == booking_id, Trip.driver_id == driver_id)
        .with_for_update()
    )
    result = row.first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Réservation introuvable.",
        )
    booking, trip = result
    return booking, trip


@router.post("", response_model=BookingPublic, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> BookingPublic:
    trip = await session.scalar(
        select(Trip).where(Trip.id == payload.trip_id).with_for_update(of=Trip)
    )
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trajet introuvable.")
    if trip.driver_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous ne pouvez pas réserver votre propre trajet.",
        )
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce trajet n'accepte plus de réservations.",
        )
    if trip.departure_time <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce trajet est déjà en cours ou terminé.",
        )

    existing = await session.scalar(
        select(Booking).where(
            Booking.trip_id == trip.id,
            Booking.passenger_id == user.id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.ACCEPTED]),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une réservation active existe déjà pour ce trajet.",
        )

    if trip.seats_available < payload.requested_seats:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nombre de places insuffisant.",
        )

    trip.seats_available -= payload.requested_seats
    booking = Booking(
        trip_id=trip.id,
        passenger_id=user.id,
        requested_seats=payload.requested_seats,
        message=payload.message.strip() if payload.message else None,
    )
    session.add(booking)
    await session.commit()
    await session.refresh(booking)
    return BookingPublic.model_validate(booking)


@router.get("/mine", response_model=BookingListResponse)
async def list_my_bookings(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> BookingListResponse:
    driver_alias = aliased(User)
    passenger_alias = aliased(User)
    rows = await session.execute(
        select(Booking, Trip, driver_alias, passenger_alias)
        .join(Trip, Trip.id == Booking.trip_id)
        .join(driver_alias, driver_alias.id == Trip.driver_id)
        .join(passenger_alias, passenger_alias.id == Booking.passenger_id)
        .where(Booking.passenger_id == user.id)
        .order_by(Booking.created_at.desc())
    )

    items: list[BookingView] = []
    for booking, trip, driver, passenger in rows.all():
        items.append(_to_booking_view(booking, trip, driver, passenger))
    return BookingListResponse(items=items, total=len(items))


@router.get("/incoming", response_model=BookingListResponse)
async def list_incoming_bookings(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> BookingListResponse:
    passenger_alias = aliased(User)
    rows = await session.execute(
        select(Booking, Trip, passenger_alias)
        .join(Trip, Trip.id == Booking.trip_id)
        .join(passenger_alias, passenger_alias.id == Booking.passenger_id)
        .where(Trip.driver_id == user.id)
        .order_by(Booking.created_at.desc())
    )

    items: list[BookingView] = []
    for booking, trip, passenger in rows.all():
        items.append(_to_booking_view(booking, trip, user, passenger))
    return BookingListResponse(items=items, total=len(items))


@router.post("/{booking_id}/accept", response_model=AuthMessage)
async def accept_booking(
    booking_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    booking, _trip = await _load_booking_for_driver(session, booking_id, user.id)
    if booking.status != BookingStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette réservation n'est plus en attente.",
        )
    booking.status = BookingStatus.ACCEPTED
    booking.responded_at = datetime.now(UTC)
    await session.commit()
    return AuthMessage(message="Réservation acceptée.")


@router.post("/{booking_id}/decline", response_model=AuthMessage)
async def decline_booking(
    booking_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    booking, trip = await _load_booking_for_driver(session, booking_id, user.id)
    if booking.status != BookingStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette réservation n'est plus en attente.",
        )

    booking.status = BookingStatus.DECLINED
    booking.responded_at = datetime.now(UTC)
    trip.seats_available = min(trip.seats_total, trip.seats_available + booking.requested_seats)
    await session.commit()
    return AuthMessage(message="Réservation refusée.")


@router.post("/{booking_id}/cancel", response_model=AuthMessage)
async def cancel_booking(
    booking_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    booking, trip = await _load_booking_for_passenger(session, booking_id, user.id)
    if booking.status not in {BookingStatus.PENDING, BookingStatus.ACCEPTED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette réservation n'est plus annulable.",
        )
    if trip.status != TripStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce trajet n'est plus actif.",
        )

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.now(UTC)
    trip.seats_available = min(trip.seats_total, trip.seats_available + booking.requested_seats)
    await session.commit()
    return AuthMessage(message="Réservation annulée.")
