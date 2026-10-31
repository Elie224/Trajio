"""Contracts for the administration dashboard.

These schemas are the public surface of /api/v1/admin. The web client
(app/apps/web/src/lib/api.ts) types them in TypeScript: keep both in sync.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.trust import ReportReason, ReportStatus
from app.models.user import IdDocumentStatus, UserRole, UserStatus


class AdminStats(BaseModel):
    """Counters displayed as tiles on the dashboard."""

    users_total: int
    users_active: int
    users_pending: int
    drivers_total: int
    trips_total: int
    trips_scheduled: int
    bookings_total: int
    bookings_pending: int
    open_reports: int
    reviews_total: int
    # Null until at least one review exists.
    average_rating: float | None = None


class AdminUser(BaseModel):
    """A user as seen by an administrator."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    role: UserRole
    status: UserStatus
    email_verified_at: datetime | None
    phone_verified_at: datetime | None
    license_verified_at: datetime | None
    id_document_status: IdDocumentStatus
    created_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUser]
    total: int


class AdminReport(BaseModel):
    """A user report as seen by an administrator."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reporter_id: UUID
    reported_user_id: UUID
    booking_id: UUID | None
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: datetime
    updated_at: datetime


class AdminReportListResponse(BaseModel):
    items: list[AdminReport]
    total: int


class AdminUserStatusUpdate(BaseModel):
    """Sanction applied to a user account."""

    status: UserStatus


class AdminIdentityUpdate(BaseModel):
    """Decision on the identity document of a driver."""

    id_document_status: IdDocumentStatus


class AdminReportStatusUpdate(BaseModel):
    """Moderation decision on a report."""

    status: ReportStatus


# Pagination bounds shared by the list endpoints.
ADMIN_PAGE_MAX_LIMIT = 100
ADMIN_PAGE_DEFAULT_LIMIT = 20
