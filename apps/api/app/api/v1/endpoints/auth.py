"""Authentication and profile endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.config import settings
from app.core.security import (
    decode_token,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    issue_purpose_token,
    issue_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User, UserStatus
from app.schemas.auth import (
    AuthMessage,
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

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE_NAME = "trajio_access_token"
REFRESH_COOKIE_NAME = "trajio_refresh_token"
EMAIL_VERIFY_PURPOSE = "verify_email"
RESET_PASSWORD_PURPOSE = "reset_password"


def _cookie_secure() -> bool:
    return settings.is_production


def _is_email_verification_enforced() -> bool:
    return settings.is_production


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")


async def _issue_session_tokens(
    session: AsyncSession,
    user: User,
) -> tuple[str, str]:
    access_token = issue_access_token(user_id=user.id, role=user.role.value)
    refresh_token = issue_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return access_token, refresh_token


def _build_register_response(user: User) -> RegisterResponse:
    verification_required = _is_email_verification_enforced()

    return RegisterResponse(
        user=UserPublic.model_validate(user),
        verification_required=verification_required,
        verification_token=None,
    )


def _user_id_from_payload(payload: dict[str, object]) -> UUID:
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide.")
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide."
        ) from exc


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, session: AsyncSession = Depends(get_db_session)
) -> RegisterResponse:
    existing = await session.scalar(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cet email est déjà utilisé."
        )

    user = User(
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        password_hash=hash_password(payload.password),
        status=UserStatus.PENDING if _is_email_verification_enforced() else UserStatus.ACTIVE,
        email_verified_at=datetime.now(UTC) if not _is_email_verification_enforced() else None,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _build_register_response(user)


@router.post("/verify-email", response_model=AuthMessage)
async def verify_email(
    payload: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AuthMessage:
    try:
        token_payload = decode_token(payload.token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide."
        ) from exc

    if (
        token_payload.get("type") != "purpose"
        or token_payload.get("purpose") != EMAIL_VERIFY_PURPOSE
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide.")

    user_id = _user_id_from_payload(token_payload)
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable.")

    now = datetime.now(UTC)
    user.email_verified_at = now
    if user.status == UserStatus.PENDING:
        user.status = UserStatus.ACTIVE
    await session.commit()
    return AuthMessage(message="Adresse email vérifiée.")


@router.post("/login", response_model=UserPublic)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> UserPublic:
    user = await session.scalar(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe invalide.",
        )

    if user.status in {UserStatus.BANNED, UserStatus.SUSPENDED}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte non autorisé.")

    if user.email_verified_at is None:
        if _is_email_verification_enforced():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vérifiez votre adresse email avant de vous connecter.",
            )
        user.email_verified_at = datetime.now(UTC)
        if user.status == UserStatus.PENDING:
            user.status = UserStatus.ACTIVE

    user.last_login_at = datetime.now(UTC)
    user.status = UserStatus.ACTIVE
    access_token, refresh_token = await _issue_session_tokens(session, user)
    await session.commit()
    await session.refresh(user)
    _set_auth_cookies(response, access_token, refresh_token)
    return UserPublic.model_validate(user)


@router.post("/refresh", response_model=AuthMessage)
async def refresh(
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    refresh_token_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> AuthMessage:
    if refresh_token_cookie is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session absente.")

    token_hash = hash_refresh_token(refresh_token_cookie)
    token_row = await session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None)
        )
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


@router.delete("/me", response_model=AuthMessage)
async def delete_me(
    response: Response,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AuthMessage:
    now = datetime.now(UTC)
    user.deleted_at = now
    user.status = UserStatus.SUSPENDED
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.commit()
    _clear_auth_cookies(response)
    return AuthMessage(message="Compte supprimé.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> ForgotPasswordResponse:
    user = await session.scalar(
        select(User).where(User.email == payload.email, User.deleted_at.is_(None))
    )
    if user is None:
        return ForgotPasswordResponse(
            message="Si ce compte existe, un lien de réinitialisation a été envoyé."
        )

    token = issue_purpose_token(user_id=user.id, purpose=RESET_PASSWORD_PURPOSE, expires_minutes=30)
    if settings.is_production:
        return ForgotPasswordResponse(message="Un lien de réinitialisation a été envoyé.")

    return ForgotPasswordResponse(
        message="Token de réinitialisation généré pour l'environnement de développement.",
        reset_token=token,
    )


@router.post("/reset-password", response_model=AuthMessage)
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AuthMessage:
    try:
        token_payload = decode_token(payload.token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide."
        ) from exc

    if (
        token_payload.get("type") != "purpose"
        or token_payload.get("purpose") != RESET_PASSWORD_PURPOSE
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jeton invalide.")

    user = await session.get(User, _user_id_from_payload(token_payload))
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compte introuvable.")

    user.password_hash = hash_password(payload.new_password)
    now = datetime.now(UTC)
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.commit()
    return AuthMessage(message="Mot de passe réinitialisé.")
