from datetime import UTC, date, datetime, time, timedelta

from app.matching import PassengerSearchInput, TripCandidateInput, score_trip_candidate


def _candidate(
    *,
    origin_lat: float = 48.9542,
    origin_lng: float = 2.3615,
    destination_lat: float = 48.8566,
    destination_lng: float = 2.3522,
    departure_time: datetime | None = None,
    seats_total: int = 4,
    seats_available: int = 3,
    max_detour_ratio: float = 0.30,
) -> TripCandidateInput:
    return TripCandidateInput(
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        destination_lat=destination_lat,
        destination_lng=destination_lng,
        departure_time=departure_time or (datetime.now(UTC) + timedelta(hours=2)),
        seats_total=seats_total,
        seats_available=seats_available,
        max_detour_ratio=max_detour_ratio,
    )


def test_score_trip_candidate_prefers_close_aligned_trip() -> None:
    request = PassengerSearchInput(
        passengers=1,
        date_filter=date.today(),
        earliest_time=time(8, 0),
        pickup_lat=48.9550,
        pickup_lng=2.3600,
        dropoff_lat=48.8570,
        dropoff_lng=2.3530,
    )
    candidate = _candidate(departure_time=datetime.combine(date.today(), time(8, 20), tzinfo=UTC))

    result = score_trip_candidate(request, candidate)

    assert result is not None
    assert result.score >= 0.80
    assert len(result.reasons) >= 3


def test_score_trip_candidate_rejects_opposite_direction() -> None:
    request = PassengerSearchInput(
        passengers=1,
        pickup_lat=48.8566,
        pickup_lng=2.3522,
        dropoff_lat=48.9542,
        dropoff_lng=2.3615,
    )
    candidate = _candidate(
        origin_lat=48.9542,
        origin_lng=2.3615,
        destination_lat=48.8566,
        destination_lng=2.3522,
    )

    result = score_trip_candidate(request, candidate)

    assert result is None


def test_score_trip_candidate_rejects_over_detour_ratio() -> None:
    request = PassengerSearchInput(
        passengers=1,
        pickup_lat=48.9542,
        pickup_lng=2.3615,
        dropoff_lat=48.5000,
        dropoff_lng=3.0000,
    )
    candidate = _candidate(max_detour_ratio=0.05)

    result = score_trip_candidate(request, candidate)

    assert result is None
