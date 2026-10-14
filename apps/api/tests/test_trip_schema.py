"""Trip schema validation contract."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.schemas.trip import TripCreateRequest
from pydantic import ValidationError


def _base_payload() -> dict[str, object]:
    return {
        "vehicle_id": str(uuid4()),
        "origin_label": "Saint-Denis",
        "destination_label": "Paris Gare du Nord",
        "origin_lat": 48.9542,
        "origin_lng": 2.3615,
        "destination_lat": 48.8809,
        "destination_lng": 2.3553,
        "departure_time": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
        "seats_total": 3,
        "is_paid": False,
        "price_per_seat_cents": None,
        "max_detour_ratio": 0.3,
    }


def test_trip_create_requires_price_for_paid_trip() -> None:
    payload = _base_payload()
    payload["is_paid"] = True
    payload["price_per_seat_cents"] = None

    with pytest.raises(ValidationError):
        TripCreateRequest.model_validate(payload)


def test_trip_create_rejects_price_for_free_trip() -> None:
    payload = _base_payload()
    payload["is_paid"] = False
    payload["price_per_seat_cents"] = 900

    with pytest.raises(ValidationError):
        TripCreateRequest.model_validate(payload)


def test_trip_create_accepts_valid_paid_trip() -> None:
    payload = _base_payload()
    payload["is_paid"] = True
    payload["price_per_seat_cents"] = 900

    request = TripCreateRequest.model_validate(payload)
    assert request.price_per_seat_cents == 900
