"""Deterministic trip matching scoring.

The scorer is intentionally pure-Python and side-effect free so it can be unit
tested independently from SQL and HTTP layers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from math import acos, cos, radians, sin
from typing import Final

EARTH_RADIUS_M: Final[float] = 6_371_000.0
DEFAULT_RADIUS_M: Final[float] = 20_000.0
IDEAL_DETOUR_RATIO: Final[float] = 0.10
TIME_TOLERANCE_MINUTES: Final[int] = 90
IDEAL_SPAN: Final[float] = 0.75


@dataclass(frozen=True)
class MatchWeights:
    proximity: float = 0.25
    detour: float = 0.30
    schedule: float = 0.20
    direction: float = 0.15
    seats: float = 0.10

    @property
    def total(self) -> float:
        return self.proximity + self.detour + self.schedule + self.direction + self.seats


@dataclass(frozen=True)
class PassengerSearchInput:
    passengers: int
    date_filter: date | None = None
    earliest_time: time | None = None
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None

    @property
    def has_precise_route(self) -> bool:
        return (
            self.pickup_lat is not None
            and self.pickup_lng is not None
            and self.dropoff_lat is not None
            and self.dropoff_lng is not None
        )


@dataclass(frozen=True)
class TripCandidateInput:
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    departure_time: datetime
    seats_total: int
    seats_available: int
    max_detour_ratio: float


@dataclass(frozen=True)
class MatchBreakdown:
    proximity_score: float
    detour_score: float
    schedule_score: float
    direction_score: float
    seats_score: float


@dataclass(frozen=True)
class MatchResult:
    score: float
    reasons: list[str]
    breakdown: MatchBreakdown


def _clamp01(value: float) -> float:
    if value <= 0:
        return 0.0
    if value >= 1:
        return 1.0
    return value


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lng2 - lng1)
    term = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * acos(max(-1.0, min(1.0, 1 - 2 * term)))


def _dot_direction(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
    lat3: float,
    lng3: float,
    lat4: float,
    lng4: float,
) -> float:
    ax = lng2 - lng1
    ay = lat2 - lat1
    bx = lng4 - lng3
    by = lat4 - lat3
    norm_a = (ax**2 + ay**2) ** 0.5
    norm_b = (bx**2 + by**2) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return max(-1.0, min(1.0, (ax * bx + ay * by) / (norm_a * norm_b)))


def _score_schedule(
    search_input: PassengerSearchInput,
    candidate: TripCandidateInput,
) -> float:
    if search_input.date_filter is None and search_input.earliest_time is None:
        return 1.0

    departure = _as_utc(candidate.departure_time)
    if search_input.date_filter and departure.date() != search_input.date_filter:
        return 0.0

    if search_input.earliest_time is None:
        return 1.0

    earliest_at = datetime.combine(
        search_input.date_filter or departure.date(),
        search_input.earliest_time,
        tzinfo=UTC,
    )
    delta_minutes = (departure - earliest_at).total_seconds() / 60.0
    if delta_minutes < 0:
        return 0.0
    return _clamp01(1 - (delta_minutes / TIME_TOLERANCE_MINUTES))


def _score_seats(passengers: int, candidate: TripCandidateInput) -> float:
    numerator = candidate.seats_available - passengers + 1
    denominator = max(candidate.seats_total, 1)
    return _clamp01(numerator / denominator)


def _score_geo(
    search_input: PassengerSearchInput,
    candidate: TripCandidateInput,
    radius_m: float,
) -> tuple[float, float, float]:
    if not search_input.has_precise_route:
        return 0.7, 0.7, 0.7

    assert search_input.pickup_lat is not None
    assert search_input.pickup_lng is not None
    assert search_input.dropoff_lat is not None
    assert search_input.dropoff_lng is not None

    pickup_offset = _haversine_m(
        search_input.pickup_lat,
        search_input.pickup_lng,
        candidate.origin_lat,
        candidate.origin_lng,
    )
    dropoff_offset = _haversine_m(
        search_input.dropoff_lat,
        search_input.dropoff_lng,
        candidate.destination_lat,
        candidate.destination_lng,
    )
    proximity_score = _clamp01(1 - (max(pickup_offset, dropoff_offset) / radius_m))

    direct_distance = _haversine_m(
        candidate.origin_lat,
        candidate.origin_lng,
        candidate.destination_lat,
        candidate.destination_lng,
    )
    requested_distance = _haversine_m(
        search_input.pickup_lat,
        search_input.pickup_lng,
        search_input.dropoff_lat,
        search_input.dropoff_lng,
    )
    additional_distance = max(0.0, requested_distance - direct_distance)
    detour_ratio = additional_distance / max(direct_distance, 1.0)
    allowed_detour = max(candidate.max_detour_ratio, IDEAL_DETOUR_RATIO)
    detour_score = _clamp01(1 - (detour_ratio / allowed_detour))

    direction_cos = _dot_direction(
        candidate.origin_lat,
        candidate.origin_lng,
        candidate.destination_lat,
        candidate.destination_lng,
        search_input.pickup_lat,
        search_input.pickup_lng,
        search_input.dropoff_lat,
        search_input.dropoff_lng,
    )
    direction_score = _clamp01((direction_cos + 1) / 2)

    return proximity_score, detour_score, direction_score


def _top_reasons(breakdown: MatchBreakdown, score: float) -> list[str]:
    labels = [
        ("Proximité du rendez-vous", breakdown.proximity_score),
        ("Faible détour estimé", breakdown.detour_score),
        ("Compatibilité horaire", breakdown.schedule_score),
        ("Direction cohérente", breakdown.direction_score),
        ("Places disponibles", breakdown.seats_score),
    ]
    labels.sort(key=lambda pair: pair[1], reverse=True)
    reasons = [f"{label} ({int(value * 100)}%)" for label, value in labels[:3]]
    reasons.append(f"Score global {score:.2f}/1.00")
    return reasons


def score_trip_candidate(
    search_input: PassengerSearchInput,
    candidate: TripCandidateInput,
    *,
    weights: MatchWeights | None = None,
    radius_m: float = DEFAULT_RADIUS_M,
) -> MatchResult | None:
    scoring_weights = weights or MatchWeights()
    proximity_score, detour_score, direction_score = _score_geo(search_input, candidate, radius_m)
    schedule_score = _score_schedule(search_input, candidate)
    seats_score = _score_seats(search_input.passengers, candidate)

    if seats_score <= 0 or schedule_score <= 0:
        return None
    if search_input.has_precise_route and (
        proximity_score <= 0 or detour_score <= 0 or direction_score <= 0
    ):
        return None

    raw_score = (
        proximity_score * scoring_weights.proximity
        + detour_score * scoring_weights.detour
        + schedule_score * scoring_weights.schedule
        + direction_score * scoring_weights.direction
        + seats_score * scoring_weights.seats
    )
    score = raw_score / scoring_weights.total
    breakdown = MatchBreakdown(
        proximity_score=round(proximity_score, 4),
        detour_score=round(detour_score, 4),
        schedule_score=round(schedule_score, 4),
        direction_score=round(direction_score, 4),
        seats_score=round(seats_score, 4),
    )

    return MatchResult(
        score=round(_clamp01(score), 4),
        reasons=_top_reasons(breakdown, score),
        breakdown=breakdown,
    )
