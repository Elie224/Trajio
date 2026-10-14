"""Authentication request and response schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import password_policy_error
from app.models import UserRole, UserStatus


def _check_password_policy(value: str) -> str:
    error = password_policy_error(value)
    if error:
        raise ValueError(error)
    return value


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    first_name: str
    last_name: str
    phone: str | None
    role: UserRole
    status: UserStatus
    email_verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=256)

    @field_validator("first_name", "last_name")
    @classmethod
    def _trim_names(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Champ obligatoire.")
        return stripped

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return _check_password_policy(value)


class RegisterResponse(BaseModel):
    """Identical whether or not the email already exists (anti-enumeration)."""

    message: str
    verification_required: bool


class LoginRequest(BaseModel):
    email: EmailStr
    # No length policy here: accounts created under an older policy must still log in.
    password: str = Field(min_length=1, max_length=256)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=20, max_length=4096)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    new_password: str = Field(min_length=12, max_length=256)

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return _check_password_policy(value)


class AuthMessage(BaseModel):
    message: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class UpdateProfileRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9+ ().-]*$")

    @field_validator("first_name", "last_name")
    @classmethod
    def _strip_nullable(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Champ obligatoire.")
        return stripped

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
