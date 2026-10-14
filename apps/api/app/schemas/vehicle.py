"""Vehicle schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VehiclePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    brand: str
    model: str
    color: str | None
    plate: str
    seats_total: int
    is_primary: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VehicleCreateRequest(BaseModel):
    brand: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=40)
    plate: str = Field(min_length=2, max_length=20)
    seats_total: int = Field(ge=2, le=9)
    is_primary: bool = False

    @field_validator("brand", "model", "plate")
    @classmethod
    def _trim_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Champ obligatoire.")
        return stripped

    @field_validator("color")
    @classmethod
    def _trim_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class VehicleUpdateRequest(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=40)
    plate: str | None = Field(default=None, min_length=2, max_length=20)
    seats_total: int | None = Field(default=None, ge=2, le=9)
    is_primary: bool | None = None
    is_active: bool | None = None

    @field_validator("brand", "model", "plate")
    @classmethod
    def _trim_required(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Champ obligatoire.")
        return stripped

    @field_validator("color")
    @classmethod
    def _trim_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
