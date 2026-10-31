"""Bilateral reviews after an accepted trip."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session, require_active_user
from app.core.rate_limit import limiter
from app.models import Booking, BookingStatus, Trip, User
from app.models.trust import Review
from app.schemas.trust import ReviewCreateRequest, ReviewListResponse, ReviewPublic

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/mine", response_model=ReviewListResponse)
async def list_my_reviews(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ReviewListResponse:
    items = (
        await session.scalars(
            select(Review).where(Review.author_id == user.id).order_by(Review.created_at.desc())
        )
    ).all()
    return ReviewListResponse(
        items=[ReviewPublic.model_validate(item) for item in items], total=len(items)
    )


@router.get("/users/{user_id}", response_model=ReviewListResponse)
async def list_user_reviews(
    user_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> ReviewListResponse:
    items = (
        await session.scalars(
            select(Review).where(Review.subject_id == user_id).order_by(Review.created_at.desc())
        )
    ).all()
    average = await session.scalar(
        select(func.avg(Review.rating)).where(Review.subject_id == user_id)
    )
    return ReviewListResponse(
        items=[ReviewPublic.model_validate(item) for item in items],
        total=len(items),
        average=float(average) if average is not None else None,
    )


@router.post("", response_model=ReviewPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def create_review(
    request: Request,
    payload: ReviewCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ReviewPublic:
    row = await session.execute(
        select(Booking, Trip)
        .join(Trip, Trip.id == Booking.trip_id)
        .where(Booking.id == payload.booking_id)
    )
    result = row.first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Réservation introuvable."
        )
    booking, trip = result

    if user.id not in {trip.driver_id, booking.passenger_id}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Réservation introuvable."
        )
    if booking.status != BookingStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seule une réservation acceptée peut être évaluée.",
        )
    if trip.departure_time > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous pourrez évaluer ce trajet après le départ.",
        )

    subject_id = booking.passenger_id if user.id == trip.driver_id else trip.driver_id
    comment = payload.comment.strip() if payload.comment else None
    review = Review(
        booking_id=booking.id,
        trip_id=trip.id,
        author_id=user.id,
        subject_id=subject_id,
        rating=payload.rating,
        comment=comment or None,
    )
    session.add(review)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous avez déjà évalué cette réservation.",
        ) from exc
    await session.refresh(review)
    return ReviewPublic.model_validate(review)
