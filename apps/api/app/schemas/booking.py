"""Booking schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import BookingStatus


class BookingCreateRequest(BaseModel):
    trip_id: UUID
    requested_seats: int = Field(default=1, ge=1, le=9)
    message: str | None = Field(default=None, max_length=500)


class BookingPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trip_id: UUID
    passenger_id: UUID
    requested_seats: int
    message: str | None
    status: BookingStatus
    responded_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BookingView(BookingPublic):
    trip_origin_label: str
    trip_destination_label: str
    trip_departure_time: datetime
    driver_id: UUID
    driver_name: str
    passenger_name: str


class BookingListResponse(BaseModel):
    items: list[BookingView]
    total: int
