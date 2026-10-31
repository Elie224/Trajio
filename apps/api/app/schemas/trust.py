"""Contracts for conversations, reviews, reports and blocks."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.trust import ReportReason, ReportStatus


class ConversationOpenRequest(BaseModel):
    booking_id: UUID


class MessageCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class MessagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    created_at: datetime


class ConversationPeer(BaseModel):
    id: UUID
    first_name: str
    last_name: str


class ConversationSummary(BaseModel):
    id: UUID
    booking_id: UUID
    trip_id: UUID
    trip_origin_label: str
    trip_destination_label: str
    booking_status: str
    can_send: bool
    peer: ConversationPeer
    last_message: MessagePublic | None
    unread_count: int
    updated_at: datetime


class ConversationDetail(ConversationSummary):
    messages: list[MessagePublic]


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]
    total: int


class ReviewCreateRequest(BaseModel):
    booking_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class ReviewPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    booking_id: UUID
    trip_id: UUID
    author_id: UUID
    subject_id: UUID
    rating: int
    comment: str | None
    created_at: datetime


class ReviewListResponse(BaseModel):
    items: list[ReviewPublic]
    total: int
    average: float | None = None


class ReportCreateRequest(BaseModel):
    reported_user_id: UUID
    reason: ReportReason
    booking_id: UUID | None = None
    details: str | None = Field(default=None, max_length=2000)


class ReportPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: UUID
    reported_user_id: UUID
    booking_id: UUID | None
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: datetime


class ReportListResponse(BaseModel):
    items: list[ReportPublic]
    total: int


class BlockCreateRequest(BaseModel):
    user_id: UUID


class BlockPublic(BaseModel):
    user_id: UUID
    created_at: datetime


class BlockListResponse(BaseModel):
    items: list[BlockPublic]
    total: int
