"""Shared trust helpers: blocks and booking-linked conversations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Trip
from app.models.conversation import Conversation, ConversationParticipant
from app.models.trust import UserBlock

MESSAGING_STATUSES = {BookingStatus.PENDING, BookingStatus.ACCEPTED}


async def users_are_blocked(session: AsyncSession, user_a: UUID, user_b: UUID) -> bool:
    if user_a == user_b:
        return False
    row = await session.scalar(
        select(UserBlock).where(
            or_(
                (UserBlock.blocker_id == user_a) & (UserBlock.blocked_id == user_b),
                (UserBlock.blocker_id == user_b) & (UserBlock.blocked_id == user_a),
            )
        )
    )
    return row is not None


async def get_or_create_conversation(
    session: AsyncSession, booking: Booking, trip: Trip
) -> Conversation:
    existing = await session.scalar(
        select(Conversation).where(Conversation.booking_id == booking.id)
    )
    if existing is not None:
        return existing

    try:
        async with session.begin_nested():
            conversation = Conversation(trip_id=trip.id, booking_id=booking.id)
            session.add(conversation)
            await session.flush()
            session.add(
                ConversationParticipant(conversation_id=conversation.id, user_id=trip.driver_id)
            )
            session.add(
                ConversationParticipant(
                    conversation_id=conversation.id, user_id=booking.passenger_id
                )
            )
            await session.flush()
            return conversation
    except IntegrityError:
        existing = await session.scalar(
            select(Conversation).where(Conversation.booking_id == booking.id)
        )
        if existing is None:
            raise
        return existing
