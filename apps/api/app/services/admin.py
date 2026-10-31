"""Administration services: statistics, moderation and sanctions.

All the business rules of the administration dashboard live here. The
endpoints only translate HTTP into calls to this module.

Sanctions invalidate the sessions of the targeted account: every moderation
action bumps `users.token_version`, so access tokens issued before the
decision are rejected by `get_current_user`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Trip, TripStatus, User, UserRole, UserStatus
from app.models.trust import Report, ReportStatus, Review
from app.models.user import IdDocumentStatus
from app.schemas.admin import AdminStats

# Reports that still need an administrator decision.
OPEN_REPORT_STATUSES = (ReportStatus.OPEN, ReportStatus.REVIEWING)

# Allowed transitions of a report. A resolved or dismissed report is closed:
# re-opening it would silently revive a case an administrator already closed.
# The rule lives here, on the server: the front-end only hides the buttons
# that are not offered, which is a comfort and not a protection.
REPORT_STATUS_TRANSITIONS: dict[ReportStatus, frozenset[ReportStatus]] = {
    ReportStatus.OPEN: frozenset(
        {ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.DISMISSED}
    ),
    ReportStatus.REVIEWING: frozenset({ReportStatus.RESOLVED, ReportStatus.DISMISSED}),
    ReportStatus.RESOLVED: frozenset(),
    ReportStatus.DISMISSED: frozenset(),
}

# Escape character of the LIKE patterns. `%` and `_` are wildcards in SQL:
# left as they are, a search box holding a single `%` returns the whole
# directory and forces a full table scan.
LIKE_ESCAPE_CHAR = "\\"


def _escape_like(value: str) -> str:
    """Neutralise the SQL wildcards of a user supplied search term."""
    escaped = value.replace(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR * 2)
    escaped = escaped.replace("%", f"{LIKE_ESCAPE_CHAR}%")
    escaped = escaped.replace("_", f"{LIKE_ESCAPE_CHAR}_")
    return escaped


def _invalidate_sessions(user: User) -> None:
    """Force the target account to renew its sessions.

    Bumping `token_version` makes every access token issued before the
    sanction unusable (see api/deps.py).
    """
    user.token_version = (user.token_version or 0) + 1


async def bootstrap_admin(session: AsyncSession, email: str) -> User | None:
    """Promote an existing account to administrator.

    The dashboard is unreachable without an administrator account, and the
    role is never granted through the API itself: the promotion is an
    explicit, out-of-band operation. This function is the only entry point
    and it only ever promotes, it never demotes.

    Returns the promoted account, or None when the email is unknown.
    """
    normalized = email.strip().lower()
    if not normalized:
        return None

    user = await session.scalar(select(User).where(User.email == normalized))
    if user is None or user.deleted_at is not None:
        return None
    if user.role == UserRole.ADMIN:
        return user

    user.role = UserRole.ADMIN
    # The sessions opened before the promotion keep their old role in their
    # claims; revoking them forces a re-login with the new role.
    _invalidate_sessions(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_admin_stats(session: AsyncSession) -> AdminStats:
    """Aggregate counters for the dashboard tiles.

    The account counters exclude the soft-deleted accounts, exactly like the
    user list: the "Utilisateurs" tile and the `total` of `GET /admin/users`
    must come from the same set, otherwise the tile can show more accounts
    than the list it is supposed to summarise.
    """
    live_accounts = User.deleted_at.is_(None)
    users_total = await session.scalar(
        select(func.count()).select_from(User).where(live_accounts)
    )
    users_active = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(live_accounts, User.status == UserStatus.ACTIVE)
    )
    users_pending = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(live_accounts, User.status == UserStatus.PENDING)
    )
    drivers_total = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(live_accounts, User.role == UserRole.DRIVER)
    )
    trips_total = await session.scalar(select(func.count()).select_from(Trip))
    trips_scheduled = await session.scalar(
        select(func.count()).select_from(Trip).where(Trip.status == TripStatus.SCHEDULED)
    )
    bookings_total = await session.scalar(select(func.count()).select_from(Booking))
    bookings_pending = await session.scalar(
        select(func.count()).select_from(Booking).where(Booking.status == BookingStatus.PENDING)
    )
    open_reports = await session.scalar(
        select(func.count()).select_from(Report).where(Report.status.in_(OPEN_REPORT_STATUSES))
    )
    reviews_total = await session.scalar(select(func.count()).select_from(Review))
    average_rating = await session.scalar(select(func.avg(Review.rating)))

    return AdminStats(
        users_total=int(users_total or 0),
        users_active=int(users_active or 0),
        users_pending=int(users_pending or 0),
        drivers_total=int(drivers_total or 0),
        trips_total=int(trips_total or 0),
        trips_scheduled=int(trips_scheduled or 0),
        bookings_total=int(bookings_total or 0),
        bookings_pending=int(bookings_pending or 0),
        open_reports=int(open_reports or 0),
        reviews_total=int(reviews_total or 0),
        average_rating=round(float(average_rating), 2) if average_rating is not None else None,
    )


def build_user_filters(
    *,
    status: UserStatus | None,
    role: UserRole | None,
    query: str | None,
) -> list:
    """Filters shared by the user list and its total count.

    The search covers the email, the name and the phone number: an
    administrator often receives a complaint quoting a phone number. The
    search stays on the administration surface, behind the admin role and
    the read quota.
    """
    filters = [User.deleted_at.is_(None)]
    if status is not None:
        filters.append(User.status == status)
    if role is not None:
        filters.append(User.role == role)
    if query:
        needle = f"%{_escape_like(query.strip())}%"
        filters.append(
            or_(
                User.email.ilike(needle, escape=LIKE_ESCAPE_CHAR),
                User.first_name.ilike(needle, escape=LIKE_ESCAPE_CHAR),
                User.last_name.ilike(needle, escape=LIKE_ESCAPE_CHAR),
                User.phone.ilike(needle, escape=LIKE_ESCAPE_CHAR),
            )
        )
    return filters


async def list_users(
    session: AsyncSession,
    *,
    status: UserStatus | None,
    role: UserRole | None,
    query: str | None,
    limit: int,
    offset: int,
) -> tuple[list[User], int]:
    """Return one page of users and the total number of matching users."""
    filters = build_user_filters(status=status, role=role, query=query)
    total = await session.scalar(select(func.count()).select_from(User).where(*filters))
    items = (
        await session.scalars(
            select(User)
            .where(*filters)
            .order_by(User.created_at.desc(), User.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return list(items), int(total or 0)


async def list_reports(
    session: AsyncSession,
    *,
    status: ReportStatus | None,
    limit: int,
    offset: int,
) -> tuple[list[Report], int]:
    """Return one page of reports and the total number of matching reports."""
    filters = []
    if status is not None:
        filters.append(Report.status == status)
    total = await session.scalar(select(func.count()).select_from(Report).where(*filters))
    items = (
        await session.scalars(
            select(Report)
            .where(*filters)
            .order_by(Report.created_at.desc(), Report.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return list(items), int(total or 0)


async def get_user(session: AsyncSession, user_id: UUID) -> User | None:
    """Fetch a user, ignoring soft-deleted accounts."""
    return await session.scalar(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )


async def apply_user_status(
    session: AsyncSession,
    target: User,
    new_status: UserStatus,
    *,
    acting_admin: User,
) -> User:
    """Set the status of an account and revoke its sessions.

    The sessions are revoked on every change: an unban must not be usable
    with the token obtained before the ban, and a ban must cut access at once.
    """
    if target.id == acting_admin.id:
        raise ValueError("Un administrateur ne peut pas modifier son propre statut.")
    if target.role == UserRole.ADMIN:
        # A suspended administrator would lock the moderation queue out.
        raise ValueError("Un administrateur ne peut pas sanctionner un autre administrateur.")

    target.status = new_status
    _invalidate_sessions(target)
    await session.commit()
    await session.refresh(target)
    return target


async def apply_identity_decision(
    session: AsyncSession,
    target: User,
    decision: IdDocumentStatus,
    *,
    acting_admin: User,
) -> User:
    """Record the decision taken on the identity document of an account.

    The decision revokes the sessions of the target, like a sanction: a
    rejected identity must not leave the account usable with the tokens it
    held before the decision.
    """
    if target.id == acting_admin.id:
        raise ValueError("Un administrateur ne peut pas verifier sa propre identite.")
    if target.role == UserRole.ADMIN:
        # The identity gates the driver features and the trust of the
        # platform: it must not be decided on an administrator account.
        raise ValueError(
            "Un administrateur ne peut pas decider de l'identite d'un autre administrateur."
        )

    target.id_document_status = decision
    _invalidate_sessions(target)
    await session.commit()
    await session.refresh(target)
    return target


async def update_report_status(
    session: AsyncSession,
    report: Report,
    new_status: ReportStatus,
) -> Report:
    """Move a report to another moderation state.

    The transition must be allowed from the current state, otherwise a
    closed report could be re-opened by a direct call to the API.
    """
    allowed = REPORT_STATUS_TRANSITIONS.get(report.status, frozenset())
    if new_status not in allowed:
        raise ValueError(
            f"Transition de signalement invalide : {report.status.value} -> {new_status.value}."
        )

    report.status = new_status
    await session.commit()
    await session.refresh(report)
    return report
