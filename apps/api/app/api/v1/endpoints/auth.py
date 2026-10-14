"""Authentication and profile endpoints."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.config import settings
from app.core.rate_limit import account_limiter, limiter
from app.core.security import (
    decode_token,
    dummy_verify_password,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    issue_purpose_token,
    issue_refresh_token,
    password_fingerprint,
    verify_password,
)
from app.models import (
    Booking,
    BookingStatus,
    RefreshToken,
    Trip,
    TripStatus,
    User,
    UserStatus,
    Vehicle,
)
from app.schemas.auth import (
    AuthMessage,
    DeleteAccountRequest,
    DeletionPreview,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UserPublic,
    VerifyEmailRequest,
)
from app.schemas.booking import BookingPublic
from app.schemas.trip import TripPublic
from app.schemas.vehicle import VehiclePublic

audit_logger = logging.getLogger("trajio.audit")

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE_NAME = "trajio_access_token"
REFRESH_COOKIE_NAME = "trajio_refresh_token"
EMAIL_VERIFY_PURPOSE = "verify_email"
RESET_PASSWORD_PURPOSE = "reset_password"
ACTIVE_BOOKING_STATUSES = (BookingStatus.PENDING, BookingStatus.ACCEPTED)

GENERIC_REGISTER_MESSAGE = (
    "Si cette adresse peut être utilisée, votre compte est prêt. "
    "Consultez vos emails si une confirmation est demandée."
)
GENERIC_FORGOT_MESSAGE = "Si ce compte existe, un lien de réinitialisation a été envoyé."
INVALID_CREDENTIALS = "Email ou mot de passe invalide."
INVALID_TOKEN = "Jeton invalide ou expiré."


def _cookie_secure() -> bool:
    return not settings.is_development


def _is_email_verification_enforced() -> bool:
    return settings.is_production


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.delete_cookie(
            key=name, path="/", secure=_cookie_secure(), httponly=True, samesite="strict"
        )


async def _issue_session_tokens(
    session: AsyncSession,
    user: User,
) -> tuple[str, str]:
    access_token = issue_access_token(
        user_id=user.id, role=user.role.value, token_version=user.token_version or 0
    )
    refresh_token = issue_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return access_token, refresh_token


def _decode_purpose_token(token: str, purpose: str) -> tuple[dict[str, Any], UUID]:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN) from exc
    if payload.get("type") != "purpose" or payload.get("purpose") != purpose:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN)
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN)
    try:
        return payload, UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN) from exc


async def _revoke_refresh_tokens(session: AsyncSession, user_id: UUID, now: datetime) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def register(
    request: Request,
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RegisterResponse:
    account_limiter.hit("register", payload.email, limit=3, window_seconds=3600)
    enforced = _is_email_verification_enforced()
    # Always hash, so that response time does not reveal whether the email exists.
    password_hash = hash_password(payload.password)

    existing = await session.scalar(
        select(User.id).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if existing is None:
        now = datetime.now(UTC)
        session.add(
            User(
                email=payload.email,
                first_name=payload.first_name,
                last_name=payload.last_name,
                password_hash=password_hash,
                status=UserStatus.PENDING if enforced else UserStatus.ACTIVE,
                email_verified_at=None if enforced else now,
            )
        )
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
    # TODO(email): when mail sending exists, notify the owner of an existing
    # address instead of creating anything, without changing this response.
    return RegisterResponse(message=GENERIC_REGISTER_MESSAGE, verification_required=enforced)


@router.post("/verify-email", response_model=AuthMessage)
@limiter.limit("10/hour")
async def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AuthMessage:
    _, user_id = _decode_purpose_token(payload.token, EMAIL_VERIFY_PURPOSE)
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN)

    user.email_verified_at = datetime.now(UTC)
    if user.status == UserStatus.PENDING:
        user.status = UserStatus.ACTIVE
    await session.commit()
    return AuthMessage(message="Adresse email vérifiée.")


@router.post("/login", response_model=UserPublic)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> UserPublic:
    account_limiter.hit("login", payload.email, limit=5, window_seconds=900)
    user = await session.scalar(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if user is None:
        dummy_verify_password(payload.password)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    if user.status in {UserStatus.BANNED, UserStatus.SUSPENDED}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte non autorisé.")

    if user.email_verified_at is None:
        if _is_email_verification_enforced():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vérifiez votre adresse email avant de vous connecter.",
            )
        # Development only: email verification is not enforced.
        user.email_verified_at = datetime.now(UTC)
        if user.status == UserStatus.PENDING:
            user.status = UserStatus.ACTIVE

    user.last_login_at = datetime.now(UTC)
    access_token, refresh_token = await _issue_session_tokens(session, user)
    await session.commit()
    await session.refresh(user)
    _set_auth_cookies(response, access_token, refresh_token)
    account_limiter.reset("login", payload.email)
    return UserPublic.model_validate(user)


@router.post("/refresh", response_model=AuthMessage)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    refresh_token_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> AuthMessage:
    if refresh_token_cookie is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session absente.")

    token_hash = hash_refresh_token(refresh_token_cookie)
    token_row = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .with_for_update()
    )
    if token_row is None or token_row.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée.")

    user = await session.get(User, token_row.user_id)
    if user is None or user.deleted_at is not None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalide.")

    token_row.revoked_at = datetime.now(UTC)
    access_token, refresh_token = await _issue_session_tokens(session, user)
    await session.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return AuthMessage(message="Session renouvelée.")


@router.post("/logout", response_model=AuthMessage)
async def logout(
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    refresh_token_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> AuthMessage:
    if refresh_token_cookie:
        token_hash = hash_refresh_token(refresh_token_cookie)
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await session.commit()
    _clear_auth_cookies(response)
    return AuthMessage(message="Déconnexion effectuée.")


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: UpdateProfileRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> UserPublic:
    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if "phone" in payload.model_fields_set:
        user.phone = payload.phone

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Numéro de téléphone déjà utilisé."
        ) from exc

    await session.refresh(user)
    return UserPublic.model_validate(user)


@router.get("/me/export")
@limiter.limit("5/hour")
async def export_my_data(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """RGPD right of access and portability: every record tied to the account."""
    account_limiter.hit("export", str(user.id), limit=5, window_seconds=3600)
    vehicles = (await session.scalars(select(Vehicle).where(Vehicle.owner_id == user.id))).all()
    trips = (await session.scalars(select(Trip).where(Trip.driver_id == user.id))).all()
    bookings = (await session.scalars(select(Booking).where(Booking.passenger_id == user.id))).all()
    profile = UserPublic.model_validate(user).model_dump(mode="json")
    profile["last_login_at"] = user.last_login_at.isoformat() if user.last_login_at else None
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": profile,
        "vehicles": [VehiclePublic.model_validate(v).model_dump(mode="json") for v in vehicles],
        "trips": [TripPublic.model_validate(t).model_dump(mode="json") for t in trips],
        "bookings": [BookingPublic.model_validate(b).model_dump(mode="json") for b in bookings],
    }


@router.get("/me/deletion-preview", response_model=DeletionPreview)
@limiter.limit("5/hour")
async def deletion_preview(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DeletionPreview:
    """How many upcoming trips and active bookings DELETE /me would cancel."""
    account_limiter.hit("deletion-preview", str(user.id), limit=5, window_seconds=3600)
    trips = await session.scalar(
        select(func.count())
        .select_from(Trip)
        .where(Trip.driver_id == user.id, Trip.status == TripStatus.SCHEDULED)
    )
    bookings = await session.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.passenger_id == user.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
    )
    return DeletionPreview(trips=trips or 0, bookings=bookings or 0)


@router.delete("/me", response_model=AuthMessage)
@limiter.limit("5/hour")
async def delete_me(
    request: Request,
    response: Response,
    payload: DeleteAccountRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AuthMessage:
    """Close the account and anonymise personal data (RGPD right to erasure).

    Trips and bookings rows are kept, detached from any identity, because the
    other party of a trip keeps a legitimate interest in its history.
    """
    account_limiter.hit("delete", str(user.id), limit=5, window_seconds=3600)
    if not verify_password(payload.password, user.password_hash):
        audit_logger.warning("account_delete_denied user_id=%s", user.id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mot de passe incorrect.")

    now = datetime.now(UTC)

    # Bookings made as a passenger: cancel the active ones, give seats back.
    rows = await session.execute(
        select(Booking, Trip)
        .join(Trip, Trip.id == Booking.trip_id)
        .where(Booking.passenger_id == user.id)
        .with_for_update()
    )
    for booking, trip in rows.all():
        booking.message = None
        if booking.status in ACTIVE_BOOKING_STATUSES:
            booking.status = BookingStatus.CANCELLED
            booking.cancelled_at = now
            if trip.status == TripStatus.SCHEDULED:
                trip.seats_available = min(
                    trip.seats_total, trip.seats_available + booking.requested_seats
                )

    # Trips published as a driver: cancel the upcoming ones and their bookings.
    trips = (
        await session.scalars(
            select(Trip)
            .where(Trip.driver_id == user.id, Trip.status == TripStatus.SCHEDULED)
            .with_for_update()
        )
    ).all()
    for trip in trips:
        trip.status = TripStatus.CANCELLED
        trip.cancelled_at = now
    if trips:
        await session.execute(
            update(Booking)
            .where(
                Booking.trip_id.in_([trip.id for trip in trips]),
                Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            )
            .values(status=BookingStatus.CANCELLED, cancelled_at=now)
        )

    for vehicle in await session.scalars(select(Vehicle).where(Vehicle.owner_id == user.id)):
        vehicle.is_active = False
        vehicle.is_primary = False
        vehicle.color = None
        vehicle.plate = f"SUPPR-{vehicle.id.hex[:12]}".upper()

    user.email = f"supprime-{user.id.hex}@anonyme.invalid"
    user.first_name = "Utilisateur"
    user.last_name = "Supprimé"
    user.phone = None
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.password_changed_at = now
    user.token_version = (user.token_version or 0) + 1
    user.deleted_at = now
    user.status = UserStatus.SUSPENDED
    await _revoke_refresh_tokens(session, user.id, now)
    await session.commit()
    _clear_auth_cookies(response)
    audit_logger.info("account_deleted user_id=%s", user.id)
    return AuthMessage(message="Compte supprimé et données personnelles anonymisées.")


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    response_model_exclude_none=True,
)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> ForgotPasswordResponse:
    account_limiter.hit("forgot", payload.email, limit=3, window_seconds=3600)
    user = await session.scalar(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if user is None:
        return ForgotPasswordResponse(message=GENERIC_FORGOT_MESSAGE)

    token = issue_purpose_token(
        user_id=user.id,
        purpose=RESET_PASSWORD_PURPOSE,
        expires_minutes=30,
        extra={"pwd": password_fingerprint(user.password_hash)},
    )
    if not settings.is_development:
        # TODO(email): send the link by email.
        return ForgotPasswordResponse(message=GENERIC_FORGOT_MESSAGE)

    return ForgotPasswordResponse(message=GENERIC_FORGOT_MESSAGE, reset_token=token)


@router.post("/reset-password", response_model=AuthMessage)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AuthMessage:
    token_payload, user_id = _decode_purpose_token(payload.token, RESET_PASSWORD_PURPOSE)
    user = await session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN)

    # Single use: the fingerprint no longer matches once the password changed.
    if token_payload.get("pwd") != password_fingerprint(user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN)

    now = datetime.now(UTC)
    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = now
    user.token_version = (user.token_version or 0) + 1
    await _revoke_refresh_tokens(session, user.id, now)
    await session.commit()
    audit_logger.info("password_reset user_id=%s", user.id)
    return AuthMessage(message="Mot de passe réinitialisé. Reconnectez-vous.")
