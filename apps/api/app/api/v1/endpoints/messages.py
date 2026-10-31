"""Booking-linked conversations."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_active_user
from app.core.rate_limit import limiter
from app.models import Booking, BookingStatus, Trip, User
from app.models.conversation import Conversation, ConversationParticipant, Message
from app.schemas.auth import AuthMessage
from app.schemas.trust import (
    ConversationDetail,
    ConversationListResponse,
    ConversationOpenRequest,
    ConversationPeer,
    ConversationSummary,
    MessageCreateRequest,
    MessagePublic,
)
from app.services.trust import MESSAGING_STATUSES, get_or_create_conversation, users_are_blocked

router = APIRouter(prefix="/messages", tags=["messages"])


def _peer_of(conversation: Conversation, trip: Trip, booking: Booking, user_id: UUID) -> UUID:
    return booking.passenger_id if trip.driver_id == user_id else trip.driver_id


def _can_send(booking: Booking) -> bool:
    return booking.status in MESSAGING_STATUSES


def _to_message(message: Message) -> MessagePublic:
    return MessagePublic.model_validate(message)


async def _unread_count(
    session: AsyncSession, conversation_id: UUID, last_read_at: datetime | None
) -> int:
    stmt = select(func.count()).select_from(Message).where(
        Message.conversation_id == conversation_id,
        Message.deleted_at.is_(None),
    )
    if last_read_at is not None:
        stmt = stmt.where(Message.created_at > last_read_at)
    return int(await session.scalar(stmt) or 0)


async def _last_message(session: AsyncSession, conversation_id: UUID) -> Message | None:
    return await session.scalar(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.deleted_at.is_(None))
        .order_by(Message.created_at.desc())
        .limit(1)
    )


async def _summary(
    session: AsyncSession,
    conversation: Conversation,
    trip: Trip,
    booking: Booking,
    peer: User,
    last_read_at: datetime | None,
) -> ConversationSummary:
    last = await _last_message(session, conversation.id)
    return ConversationSummary(
        id=conversation.id,
        booking_id=booking.id,
        trip_id=trip.id,
        trip_origin_label=trip.origin_label,
        trip_destination_label=trip.destination_label,
        booking_status=booking.status.value,
        can_send=_can_send(booking),
        peer=ConversationPeer(
            id=peer.id, first_name=peer.first_name, last_name=peer.last_name
        ),
        last_message=_to_message(last) if last else None,
        unread_count=await _unread_count(session, conversation.id, last_read_at),
        updated_at=conversation.updated_at,
    )


async def _load_participant_conversation(
    session: AsyncSession, conversation_id: UUID, user_id: UUID
) -> tuple[Conversation, ConversationParticipant, Trip, Booking]:
    row = await session.execute(
        select(Conversation, ConversationParticipant, Trip, Booking)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .join(Trip, Trip.id == Conversation.trip_id)
        .join(Booking, Booking.id == Conversation.booking_id)
        .where(
            Conversation.id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    result = row.first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation introuvable."
        )
    return result


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ConversationListResponse:
    rows = await session.execute(
        select(Conversation, ConversationParticipant, Trip, Booking)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .join(Trip, Trip.id == Conversation.trip_id)
        .join(Booking, Booking.id == Conversation.booking_id)
        .where(ConversationParticipant.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    )
    items: list[ConversationSummary] = []
    for conversation, participant, trip, booking in rows.all():
        peer_id = _peer_of(conversation, trip, booking, user.id)
        peer = await session.get(User, peer_id)
        if peer is None:
            continue
        items.append(
            await _summary(session, conversation, trip, booking, peer, participant.last_read_at)
        )
    return ConversationListResponse(items=items, total=len(items))


@router.post(
    "/conversations",
    response_model=ConversationDetail,
    status_code=status.HTTP_201_CREATED,
)
async def open_conversation(
    payload: ConversationOpenRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ConversationDetail:
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
    if booking.status not in {
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.CANCELLED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette réservation n'ouvre pas de conversation.",
        )

    conversation = await get_or_create_conversation(session, booking, trip)
    await session.commit()
    return await get_conversation(conversation.id, session, user)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> ConversationDetail:
    conversation, participant, trip, booking = await _load_participant_conversation(
        session, conversation_id, user.id
    )
    peer_id = _peer_of(conversation, trip, booking, user.id)
    peer = await session.get(User, peer_id)
    if peer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation introuvable."
        )

    messages = (
        await session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id, Message.deleted_at.is_(None))
            .order_by(Message.created_at.asc())
        )
    ).all()
    summary = await _summary(
        session, conversation, trip, booking, peer, participant.last_read_at
    )
    return ConversationDetail(**summary.model_dump(), messages=[_to_message(m) for m in messages])


@router.post("/conversations/{conversation_id}/messages", response_model=MessagePublic)
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    conversation_id: UUID,
    payload: MessageCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> MessagePublic:
    conversation, _participant, trip, booking = await _load_participant_conversation(
        session, conversation_id, user.id
    )
    if not _can_send(booking):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette conversation n'accepte plus de messages.",
        )
    peer_id = _peer_of(conversation, trip, booking, user.id)
    if await users_are_blocked(session, user.id, peer_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez plus échanger avec cette personne.",
        )

    body = payload.body.strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le message ne peut pas être vide.",
        )

    now = datetime.now(UTC)
    message = Message(conversation_id=conversation.id, sender_id=user.id, body=body)
    conversation.updated_at = now
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return _to_message(message)


@router.post("/conversations/{conversation_id}/read", response_model=AuthMessage)
async def mark_read(
    conversation_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_active_user),
) -> AuthMessage:
    _conversation, participant, _trip, _booking = await _load_participant_conversation(
        session, conversation_id, user.id
    )
    participant.last_read_at = datetime.now(UTC)
    await session.commit()
    return AuthMessage(message="Conversation marquée comme lue.")
