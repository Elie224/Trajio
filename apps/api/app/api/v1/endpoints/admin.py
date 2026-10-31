"""Administration dashboard endpoints.

Every route here is gated by `require_admin`: an authenticated caller without
the admin role gets a 403, an anonymous one a 401. The controllers hold no
business logic, it lives in app/services/admin.py.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_admin
from app.core.rate_limit import limiter
from app.models import User, UserRole, UserStatus
from app.models.trust import Report, ReportStatus
from app.models.user import IdDocumentStatus
from app.schemas.admin import (
    ADMIN_PAGE_DEFAULT_LIMIT,
    ADMIN_PAGE_MAX_LIMIT,
    AdminIdentityUpdate,
    AdminReport,
    AdminReportListResponse,
    AdminReportStatusUpdate,
    AdminStats,
    AdminUser,
    AdminUserListResponse,
    AdminUserStatusUpdate,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])

# Statuses an administrator may set on an account.
SANCTION_STATUSES = {UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED}

# Throttling of the administration surface. It is a privileged surface: a
# stolen administrator token must not give an unlimited enumeration of the
# platform nor an unlimited way to sanction accounts. The limits are per IP,
# as the rest of the API.
ADMIN_READ_LIMIT = "120/minute"
ADMIN_WRITE_LIMIT = "60/minute"


@router.get("/stats", response_model=AdminStats)
@limiter.limit(ADMIN_READ_LIMIT)
async def read_stats(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(require_admin),
) -> AdminStats:
    """Aggregate counters for the dashboard tiles."""
    return await admin_service.get_admin_stats(session)


@router.get("/users", response_model=AdminUserListResponse)
@limiter.limit(ADMIN_READ_LIMIT)
async def list_users(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(require_admin),
    status_filter: UserStatus | None = Query(default=None, alias="status"),
    role_filter: UserRole | None = Query(default=None, alias="role"),
    query: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=ADMIN_PAGE_DEFAULT_LIMIT, ge=1, le=ADMIN_PAGE_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> AdminUserListResponse:
    """Search and page through the user accounts."""
    items, total = await admin_service.list_users(
        session,
        status=status_filter,
        role=role_filter,
        query=query,
        limit=limit,
        offset=offset,
    )
    return AdminUserListResponse(
        items=[AdminUser.model_validate(item) for item in items], total=total
    )


@router.get("/reports", response_model=AdminReportListResponse)
@limiter.limit(ADMIN_READ_LIMIT)
async def list_reports(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(require_admin),
    status_filter: ReportStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=ADMIN_PAGE_DEFAULT_LIMIT, ge=1, le=ADMIN_PAGE_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> AdminReportListResponse:
    """Page through the user reports, most recent first."""
    items, total = await admin_service.list_reports(
        session, status=status_filter, limit=limit, offset=offset
    )
    return AdminReportListResponse(
        items=[AdminReport.model_validate(item) for item in items], total=total
    )


@router.patch("/reports/{report_id}", response_model=AdminReport)
@limiter.limit(ADMIN_WRITE_LIMIT)
async def update_report(
    report_id: UUID,
    payload: AdminReportStatusUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(require_admin),
) -> AdminReport:
    """Move a report to another moderation state."""
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signalement introuvable."
        )
    updated = await admin_service.update_report_status(session, report, payload.status)
    return AdminReport.model_validate(updated)


@router.patch("/users/{user_id}/status", response_model=AdminUser)
@limiter.limit(ADMIN_WRITE_LIMIT)
async def update_user_status(
    user_id: UUID,
    payload: AdminUserStatusUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    admin: User = Depends(require_admin),
) -> AdminUser:
    """Suspend, ban or reinstate an account.

    The change revokes the sessions of the targeted account.
    """
    if payload.status not in SANCTION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Statut de compte invalide.",
        )

    target = await admin_service.get_user(session, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )

    try:
        updated = await admin_service.apply_user_status(
            session, target, payload.status, acting_admin=admin
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return AdminUser.model_validate(updated)


@router.patch("/users/{user_id}/identity", response_model=AdminUser)
@limiter.limit(ADMIN_WRITE_LIMIT)
async def update_user_identity(
    user_id: UUID,
    payload: AdminIdentityUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    admin: User = Depends(require_admin),
) -> AdminUser:
    """Verify or reject the identity document of a driver."""
    if payload.id_document_status == IdDocumentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Décision d'identité invalide.",
        )

    target = await admin_service.get_user(session, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable."
        )

    try:
        updated = await admin_service.apply_identity_decision(
            session, target, payload.id_document_status, acting_admin=admin
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Décision d'identité refusée.",
        ) from exc
    return AdminUser.model_validate(updated)
