"""Trip persistence models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TripStatus(StrEnum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    driver_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vehicle_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    origin_label: Mapped[str] = mapped_column(String(160), nullable=False)
    destination_label: Mapped[str] = mapped_column(String(160), nullable=False)
    origin_lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    origin_lng: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    destination_lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    destination_lng: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    departure_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seats_total: Mapped[int] = mapped_column(Integer, nullable=False)
    seats_available: Mapped[int] = mapped_column(Integer, nullable=False)
    is_paid: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    price_per_seat_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_detour_ratio: Mapped[float] = mapped_column(
        Numeric(4, 2), nullable=False, server_default="0.30"
    )
    driver_preferences: Mapped[str | None] = mapped_column(Text(), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[TripStatus] = mapped_column(
        Enum(
            TripStatus,
            name="trip_status",
            validate_strings=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=TripStatus.SCHEDULED,
        server_default=TripStatus.SCHEDULED.value,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    driver = relationship("User", back_populates="trips")
    vehicle = relationship("Vehicle", back_populates="trips")
    bookings = relationship("Booking", back_populates="trip", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("seats_total >= 1 AND seats_total <= 9", name="ck_trips_seats_total_range"),
        CheckConstraint(
            "seats_available >= 0 AND seats_available <= seats_total",
            name="ck_trips_seats_available_range",
        ),
        CheckConstraint(
            "origin_lat >= -90 AND origin_lat <= 90 "
            "AND destination_lat >= -90 AND destination_lat <= 90",
            name="ck_trips_latitude_range",
        ),
        CheckConstraint(
            "origin_lng >= -180 AND origin_lng <= 180 "
            "AND destination_lng >= -180 AND destination_lng <= 180",
            name="ck_trips_longitude_range",
        ),
        CheckConstraint(
            "(is_paid = false AND price_per_seat_cents IS NULL) OR "
            "(is_paid = true AND price_per_seat_cents IS NOT NULL AND price_per_seat_cents >= 0)",
            name="ck_trips_price_rule",
        ),
        CheckConstraint(
            "max_detour_ratio >= 0 AND max_detour_ratio <= 1",
            name="ck_trips_detour_ratio_range",
        ),
        Index("ix_trips_driver_departure", "driver_id", "departure_time"),
        Index("ix_trips_status_departure", "status", "departure_time"),
    )
