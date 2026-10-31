"""User reports and blocks."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user
from app.core.rate_limit import limiter
from app.models import Booking, Trip, User
from app.models.trust import Report, UserBlock
from app.schemas.auth import AuthMessage
from app.schemas.trust import (
    BlockCreateRequest,
    BlockListResponse,
    BlockPublic,
    ReportCreateRequest,
    ReportListResponse,
    ReportPublic,
)

router = APIRouter(prefix="/reports", tags=["reports"])
blocks_router = APIRouter(prefix="/blocks", tags=["blocks"])


@router.get("/mine", response_model=ReportListResponse)
async def list_my_reports(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ReportListResponse:
    items = (
        await session.scalars(
            select(Report).where(Report.reporter_id == user.id).order_by(Report.created_at.desc())
        )
    ).all()
    return ReportListResponse(
        items=[ReportPublic.model_validate(item) for item in items], total=len(items)
    )


@router.post("", response_model=ReportPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def create_report(
    request: Request,
    payload: ReportCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ReportPublic:
    if payload.reported_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous ne pouvez pas vous signaler vous-même.",
        )
    reported = await session.get(User, payload.reported_user_id)
    if reported is None or reported.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )

    if payload.booking_id is not None:
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
        parties = {trip.driver_id, booking.passenger_id}
        if user.id not in parties or payload.reported_user_id not in parties:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Réservation introuvable."
            )

    report = Report(
        reporter_id=user.id,
        reported_user_id=payload.reported_user_id,
        booking_id=payload.booking_id,
        reason=payload.reason,
        details=payload.details.strip() if payload.details else None,
    )
    session.add(report)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un signalement ouvert existe déjà pour ce motif.",
        ) from exc
    await session.refresh(report)
    return ReportPublic.model_validate(report)


@blocks_router.get("", response_model=BlockListResponse)
async def list_blocks(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> BlockListResponse:
    items = (
        await session.scalars(
            select(UserBlock)
            .where(UserBlock.blocker_id == user.id)
            .order_by(UserBlock.created_at.desc())
        )
    ).all()
    return BlockListResponse(
        items=[BlockPublic(user_id=item.blocked_id, created_at=item.created_at) for item in items],
        total=len(items),
    )


@blocks_router.post("", response_model=BlockPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def create_block(
    request: Request,
    payload: BlockCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> BlockPublic:
    if payload.user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous ne pouvez pas vous bloquer vous-même.",
        )
    target = await session.get(User, payload.user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )

    existing = await session.scalar(
        select(UserBlock).where(
            UserBlock.blocker_id == user.id, UserBlock.blocked_id == payload.user_id
        )
    )
    if existing is not None:
        return BlockPublic(user_id=existing.blocked_id, created_at=existing.created_at)

    block = UserBlock(blocker_id=user.id, blocked_id=payload.user_id)
    session.add(block)
    await session.commit()
    await session.refresh(block)
    return BlockPublic(user_id=block.blocked_id, created_at=block.created_at)


@blocks_router.delete("/{user_id}", response_model=AuthMessage)
async def delete_block(
    user_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    block = await session.scalar(
        select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == user_id)
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocage introuvable.")
    await session.delete(block)
    await session.commit()
    return AuthMessage(message="Blocage retiré.")
