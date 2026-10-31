"""Reviews, reports and mutual blocks."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.trip import Trip
    from app.models.user import User


class ReportReason(StrEnum):
    SAFETY = "safety"
    HARASSMENT = "harassment"
    NO_SHOW = "no_show"
    VEHICLE = "vehicle"
    PAYMENT = "payment"
    OTHER = "other"


class ReportStatus(StrEnum):
    OPEN = "open"
    REVIEWING = "reviewing"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    booking: Mapped[Booking] = relationship()
    trip: Mapped[Trip] = relationship()
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    subject: Mapped[User] = relationship(foreign_keys=[subject_id])

    __table_args__ = (
        UniqueConstraint("booking_id", "author_id", name="uq_reviews_booking_author"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_reviews_rating_range"),
        CheckConstraint("author_id <> subject_id", name="ck_reviews_no_self"),
        CheckConstraint(
            "comment IS NULL OR char_length(comment) <= 500",
            name="ck_reviews_comment_length",
        ),
        Index("ix_reviews_subject_id", "subject_id"),
        Index("ix_reviews_author_id", "author_id"),
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    reported_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[ReportReason] = mapped_column(
        Enum(
            ReportReason,
            name="report_reason",
            validate_strings=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    details: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(
            ReportStatus,
            name="report_status",
            validate_strings=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ReportStatus.OPEN,
        server_default=ReportStatus.OPEN.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    reported_user: Mapped[User] = relationship(foreign_keys=[reported_user_id])

    __table_args__ = (
        CheckConstraint("reporter_id <> reported_user_id", name="ck_reports_no_self"),
        CheckConstraint(
            "details IS NULL OR char_length(details) <= 2000",
            name="ck_reports_details_length",
        ),
        Index(
            "uq_reports_open_triplet",
            "reporter_id",
            "reported_user_id",
            "reason",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_reports_reporter_created", "reporter_id", "created_at"),
    )


class UserBlock(Base):
    __tablename__ = "user_blocks"

    blocker_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    blocked_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_no_self"),
        Index("ix_user_blocks_blocked_id", "blocked_id"),
    )
