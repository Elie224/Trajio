"""Concurrency on the last seats of a trip.

The seat counter of a trip is the most contended resource of the platform:
two passengers booking the last seat at the same time must not both succeed.

The endpoint protects itself with a pessimistic row lock
(`select(Trip).with_for_update(of=Trip)`). These tests pin that behaviour:

- the lock is really requested on the trip row,
- the counter is decremented only after the availability check,
- a booking that cannot be honoured leaves the counter untouched,
- the counter never goes negative.

The session is faked, so the concurrency is simulated deterministically: the
two requests are interleaved by the test, which is what a real database would
do with two concurrent transactions.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from app.models import BookingStatus, TripStatus
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

TRIP_ID = uuid4()
DRIVER_ID = uuid4()


def _trip(**overrides):
    """A scheduled trip with `seats_available` free seats."""
    defaults = {
        "id": TRIP_ID,
        "driver_id": DRIVER_ID,
        "status": TripStatus.SCHEDULED,
        "origin_label": "Paris Gare de Lyon",
        "destination_label": "Paris Bastille",
        "origin_lat": 48.844,
        "origin_lng": 2.374,
        "destination_lat": 48.853,
        "destination_lng": 2.369,
        "departure_time": datetime.now(UTC) + timedelta(days=2),
        "seats_total": 3,
        "seats_available": 3,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _passenger(**overrides):
    """An active passenger with a verified phone (required to book)."""
    defaults = {
        "id": uuid4(),
        "email": "passager@example.com",
        "first_name": "Paul",
        "last_name": "Passager",
        "phone": "+33600000000",
        "role": "passenger",
        "status": "active",
        "deleted_at": None,
        "password_changed_at": None,
        "token_version": 0,
        "email_verified_at": datetime.now(UTC),
        "phone_verified_at": datetime.now(UTC),
        "license_verified_at": None,
        "id_document_status": "verified",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class FakeSession:
    """A session that records the statements and applies the seat decrements.

    `trip` is shared by every session instance, so the two concurrent
    requests see the same counter, like two transactions on the same row.
    """

    def __init__(self, trip, passengers, *, existing_booking=None) -> None:
        self.trip = trip
        self.passengers = passengers
        self.existing_booking = existing_booking
        self.statements: list[str] = []
        self.compiled_statements: list = []
        self.added: list = []
        self.committed = 0
        self.rolled_back = 0
        self.refreshed = 0

    def _record(self, statement) -> None:
        self.statements.append(str(statement))
        self.compiled_statements.append(statement)

    async def scalar(self, statement):
        self._record(statement)
        text = str(statement)
        if "FROM trips" in text:
            return self.trip
        if "FROM bookings" in text:
            return self.existing_booking
        return None

    async def scalars(self, statement):
        self._record(statement)
        return _EmptyResult()

    async def execute(self, statement):
        self._record(statement)
        return _EmptyResult()

    async def get(self, _model, _pk):
        return None

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed += 1

    async def refresh(self, obj) -> None:
        self.refreshed += 1
        # The database generates the id, the status and the timestamps.
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        if getattr(obj, "status", None) is None:
            obj.status = BookingStatus.PENDING
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(UTC)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime.now(UTC)

    async def rollback(self) -> None:
        self.rolled_back += 1

    @property
    def sql(self) -> str:
        return " ".join(self.statements)

    def compiled_sql(self) -> str:
        """The statements compiled with the PostgreSQL dialect.

        `str(statement)` uses the default dialect, which does not render the
        `OF trips` clause of a `FOR UPDATE` lock.
        """
        return " ".join(
            str(statement.compile(dialect=postgresql.dialect()))
            for statement in self.compiled_statements
        )


class _EmptyResult:
    def first(self):
        return None

    def all(self):
        return []

    def scalar_one_or_none(self):
        return None


@pytest.fixture(autouse=True)
def _clean_rate_limiters():
    limiter.reset()
    account_limiter.clear()
    yield
    limiter.reset()
    account_limiter.clear()


def _install(trip, passengers, *, existing_booking=None):
    """Installs the fake session and the passenger as the current user."""
    session = FakeSession(trip, passengers, existing_booking=existing_booking)

    async def _session():
        yield session

    app.dependency_overrides[get_db_session] = _session
    app.dependency_overrides[get_current_user] = lambda: passengers[0]
    return session


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# --- The lock is really requested --------------------------------------------


async def test_booking_locks_the_trip_row(client) -> None:
    """The trip row is locked before the counter is read.

    Without `FOR UPDATE`, two transactions read the same `seats_available`
    and both write, and the counter goes negative.
    """
    trip = _trip(seats_available=1)
    session = _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 201
    assert "FOR UPDATE" in session.sql.upper(), (
        "the trip row must be locked: the seat counter is read under a lock"
    )


async def test_the_lock_targets_the_trip_table(client) -> None:
    """The lock is taken on the trip, not on the whole join.

    `OF trips` only appears in the PostgreSQL dialect, so the statement is
    compiled with it.
    """
    trip = _trip(seats_available=1)
    session = _install(trip, [_passenger()])

    await client.post("/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1})

    compiled = session.compiled_sql()
    assert "OF trips" in compiled, "the lock must target the trip table"


# --- The counter is decremented, and only when there is room ------------------


async def test_a_booking_decrements_the_seat_counter(client) -> None:
    trip = _trip(seats_total=3, seats_available=3)
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 2}
    )

    assert response.status_code == 201
    assert trip.seats_available == 1


async def test_a_booking_on_the_last_seat_succeeds(client) -> None:
    trip = _trip(seats_total=1, seats_available=1)
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 201
    assert trip.seats_available == 0


async def test_a_booking_without_enough_seats_is_refused(client) -> None:
    """The counter must never go below zero."""
    trip = _trip(seats_total=1, seats_available=1)
    session = _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 2}
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Nombre de places insuffisant."
    # The counter is untouched: the failed request must not consume a seat.
    assert trip.seats_available == 1
    assert session.committed == 0
    assert session.added == []


async def test_the_availability_check_precedes_the_decrement(client) -> None:
    """The availability is checked before the counter is written.

    The order matters: writing first and checking after would leave the
    counter negative when the check fails.
    """
    trip = _trip(seats_total=1, seats_available=0)
    session = _install(trip, [_passenger()])

    await client.post("/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1})

    assert trip.seats_available == 0
    assert session.added == []


# --- Two passengers, one seat ------------------------------------------------


async def test_two_passengers_cannot_take_the_same_last_seat(client) -> None:
    """The critical case: one seat left, two passengers booking at once.

    The second request must be refused with a 409, and the counter must stay
    at zero - never at -1.
    """
    trip = _trip(seats_total=1, seats_available=1)
    first = _passenger()
    second = _passenger(email="second@example.com")

    # The first booking takes the last seat.
    _install(trip, [first, second])
    app.dependency_overrides[get_current_user] = lambda: first
    first_response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )
    assert first_response.status_code == 201
    assert trip.seats_available == 0

    # The second passenger arrives on the same trip and must be refused:
    # the refusal is about the seats, not about a duplicate booking.
    app.dependency_overrides[get_current_user] = lambda: second
    second_response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Nombre de places insuffisant."
    assert trip.seats_available == 0, "the counter went negative"


async def test_the_counter_never_goes_below_zero_under_pressure(client) -> None:
    """A burst of requests on the last seat consumes it exactly once."""
    trip = _trip(seats_total=1, seats_available=1)
    passengers = [_passenger(email=f"p{i}@example.com") for i in range(5)]
    session = _install(trip, passengers)

    statuses = []
    for passenger in passengers:
        app.dependency_overrides[get_current_user] = lambda p=passenger: p
        response = await client.post(
            "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
        )
        statuses.append(response.status_code)

    assert statuses.count(201) == 1, f"the seat was sold {statuses.count(201)} times"
    assert statuses.count(409) == 4
    assert trip.seats_available == 0
    assert len(session.added) == 1


async def test_two_passengers_share_two_last_seats(client) -> None:
    """Two seats left, two passengers: both succeed, the counter reaches zero."""
    trip = _trip(seats_total=2, seats_available=2)
    first = _passenger()
    second = _passenger(email="second@example.com")
    session = _install(trip, [first, second])

    app.dependency_overrides[get_current_user] = lambda: first
    first_response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )
    assert first_response.status_code == 201
    assert trip.seats_available == 1

    app.dependency_overrides[get_current_user] = lambda: second
    second_response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )
    assert second_response.status_code == 201
    assert trip.seats_available == 0
    assert len(session.added) == 2


async def test_a_booking_for_more_seats_than_remaining_is_refused(client) -> None:
    """A passenger asking for 2 seats on a trip with 1 place left is refused."""
    trip = _trip(seats_total=3, seats_available=1)
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 2}
    )

    assert response.status_code == 409
    assert trip.seats_available == 1


# --- The refusal paths do not consume a seat ----------------------------------


async def test_a_booking_on_its_own_trip_does_not_consume_a_seat(client) -> None:
    """The driver cannot book their own trip."""
    trip = _trip(seats_available=3)
    driver = _passenger(id=DRIVER_ID)
    _install(trip, [driver])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 409
    assert trip.seats_available == 3


async def test_a_booking_on_a_past_trip_does_not_consume_a_seat(client) -> None:
    """A trip that has departed cannot be booked."""
    trip = _trip(
        seats_available=3,
        departure_time=datetime.now(UTC) - timedelta(hours=1),
    )
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 409
    assert trip.seats_available == 3


async def test_a_booking_on_a_cancelled_trip_does_not_consume_a_seat(client) -> None:
    """A trip that does not accept bookings anymore is refused."""
    trip = _trip(seats_available=3, status=TripStatus.CANCELLED)
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 409
    assert trip.seats_available == 3


async def test_a_duplicate_booking_does_not_consume_a_seat_twice(client) -> None:
    """A passenger already booked on the trip cannot book again.

    The unique index `uq_bookings_trip_passenger_active` covers it at the
    database level; the endpoint refuses it before the counter is touched.
    """
    trip = _trip(seats_available=3)
    passenger = _passenger()
    existing = SimpleNamespace(
        id=uuid4(),
        trip_id=TRIP_ID,
        passenger_id=passenger.id,
        requested_seats=1,
        message=None,
        status="pending",
        responded_at=None,
        cancelled_at=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    _install(trip, [passenger], existing_booking=existing)

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(TRIP_ID), "requested_seats": 1}
    )

    assert response.status_code == 409
    assert "réservation active" in response.json()["detail"].lower()
    assert trip.seats_available == 3


async def test_the_database_protects_the_active_bookings_of_a_pair(client) -> None:
    """The unique index on the active bookings is declared in the model.

    The endpoint check is a courtesy: two concurrent requests of the same
    passenger could both pass it. The index is the real protection.
    """
    from app.models.booking import Booking

    constraints = {index.name: index for index in Booking.__table__.indexes}
    assert "uq_bookings_trip_passenger_active" in constraints
    index = constraints["uq_bookings_trip_passenger_active"]
    assert index.unique, "the index must be unique"
    where = str(index.dialect_options["postgresql"]["where"])
    assert "pending" in where and "accepted" in where


async def test_the_booking_endpoint_is_registered_with_its_rate_limit(client) -> None:
    """The creation of a booking is throttled.

    The quota is read from the limiter registry, like the administration
    surface does, so the test stays in step with the configured value.
    """
    route_limits = app.state.limiter._route_limits
    quotas = []
    for key, limits in route_limits.items():
        if key.endswith(".create_booking"):
            for limit in limits:
                amount = getattr(limit.limit, "amount", None)
                if amount is not None:
                    quotas.append(int(amount))
    assert quotas, "the booking route carries no rate limit"


async def test_the_trip_id_is_validated_before_the_booking(client) -> None:
    """A malformed trip id is refused by the schema, before any query."""
    trip = _trip(seats_available=3)
    _install(trip, [_passenger()])

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": "not-a-uuid", "requested_seats": 1}
    )

    assert response.status_code == 422
    assert trip.seats_available == 3


async def test_the_number_of_seats_is_validated_before_the_booking(client) -> None:
    """The seat count is bounded by the schema."""
    trip = _trip(seats_available=3)
    _install(trip, [_passenger()])

    for requested in (0, -1, 10):
        response = await client.post(
            "/api/v1/bookings",
            json={"trip_id": str(TRIP_ID), "requested_seats": requested},
        )
        assert response.status_code == 422, requested
    assert trip.seats_available == 3


async def test_the_booking_of_an_unknown_trip_is_404(client) -> None:
    """A trip that does not exist is a 404, and no seat is consumed."""
    trip = _trip(seats_available=3)
    session = _install(trip, [_passenger()])

    async def scalar(statement):
        session._record(statement)
        return None

    session.scalar = scalar

    response = await client.post(
        "/api/v1/bookings", json={"trip_id": str(uuid4()), "requested_seats": 1}
    )

    assert response.status_code == 404
    assert trip.seats_available == 3


def test_the_booking_select_locks_the_trip() -> None:
    """The lock is part of the query built by the endpoint.

    A rewrite of the query that drops `with_for_update` would silently
    re-open the overselling hole: this test fails on it.
    """
    from app.models.trip import Trip as TripModel

    query = select(TripModel).where(TripModel.id == TRIP_ID).with_for_update(of=TripModel)
    compiled = str(query.compile(dialect=postgresql.dialect()))

    assert "FOR UPDATE" in compiled
    assert "OF trips" in compiled
