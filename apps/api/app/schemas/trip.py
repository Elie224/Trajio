"""Trip schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import TripStatus


class TripPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    driver_id: UUID
    vehicle_id: UUID
    origin_label: str
    destination_label: str
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    departure_time: datetime
    seats_total: int
    seats_available: int
    is_paid: bool
    price_per_seat_cents: int | None
    max_detour_ratio: float
    driver_preferences: str | None
    comments: str | None
    status: TripStatus
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TripCreateRequest(BaseModel):
    vehicle_id: UUID
    origin_label: str = Field(min_length=2, max_length=160)
    destination_label: str = Field(min_length=2, max_length=160)
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)
    departure_time: datetime
    seats_total: int = Field(ge=1, le=9)
    is_paid: bool = False
    price_per_seat_cents: int | None = Field(default=None, ge=0)
    max_detour_ratio: float = Field(default=0.30, ge=0, le=1)
    driver_preferences: str | None = Field(default=None, max_length=500)
    comments: str | None = Field(default=None, max_length=1000)

    @field_validator("origin_label", "destination_label")
    @classmethod
    def _strip_label(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _validate_price(self) -> TripCreateRequest:
        if self.is_paid and self.price_per_seat_cents is None:
            raise ValueError("Le prix par passager est requis pour un trajet payant.")
        if not self.is_paid and self.price_per_seat_cents is not None:
            raise ValueError("Le prix doit être vide pour un trajet gratuit.")
        return self


class TripUpdateRequest(BaseModel):
    origin_label: str | None = Field(default=None, min_length=2, max_length=160)
    destination_label: str | None = Field(default=None, min_length=2, max_length=160)
    origin_lat: float | None = Field(default=None, ge=-90, le=90)
    origin_lng: float | None = Field(default=None, ge=-180, le=180)
    destination_lat: float | None = Field(default=None, ge=-90, le=90)
    destination_lng: float | None = Field(default=None, ge=-180, le=180)
    departure_time: datetime | None = None
    seats_total: int | None = Field(default=None, ge=1, le=9)
    is_paid: bool | None = None
    price_per_seat_cents: int | None = Field(default=None, ge=0)
    max_detour_ratio: float | None = Field(default=None, ge=0, le=1)
    driver_preferences: str | None = Field(default=None, max_length=500)
    comments: str | None = Field(default=None, max_length=1000)

    @field_validator("origin_label", "destination_label")
    @classmethod
    def _strip_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()


class TripSearchResult(BaseModel):
    id: UUID
    driver_id: UUID
    driver_name: str
    vehicle_label: str
    origin_label: str
    destination_label: str
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    departure_time: datetime
    seats_available: int
    is_paid: bool
    price_per_seat_cents: int | None
    max_detour_ratio: float
    match_score: float
    match_reasons: list[str]
    match_breakdown: dict[str, float]


class TripSearchResponse(BaseModel):
    items: list[TripSearchResult]
    total: int
