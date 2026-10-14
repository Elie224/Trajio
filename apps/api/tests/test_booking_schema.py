from uuid import uuid4

import pytest
from app.schemas.booking import BookingCreateRequest
from pydantic import ValidationError


def test_booking_create_accepts_valid_payload() -> None:
    payload = BookingCreateRequest.model_validate(
        {
            "trip_id": str(uuid4()),
            "requested_seats": 2,
            "message": "Je peux être au point de rendez-vous à l'heure.",
        }
    )
    assert payload.requested_seats == 2


def test_booking_create_rejects_requested_seats_out_of_range() -> None:
    with pytest.raises(ValidationError):
        BookingCreateRequest.model_validate(
            {
                "trip_id": str(uuid4()),
                "requested_seats": 0,
            }
        )
