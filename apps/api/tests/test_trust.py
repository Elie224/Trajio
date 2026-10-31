"""Auth and visibility rules for messaging, reviews, reports and blocks."""

from uuid import uuid4

from app.api.deps import get_current_user, get_db_session
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from app.models import UserStatus


class EmptySession:
    async def scalar(self, _statement):
        return None

    async def execute(self, _statement):
        class _Result:
            def first(self):
                return None

            def all(self):
                return []

            def scalars(self):
                return self

        return _Result()

    async def get(self, *_args):
        return None

    def add(self, _obj) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def refresh(self, _obj) -> None:
        return None

    async def delete(self, _obj) -> None:
        return None


def _override(user) -> None:
    session = EmptySession()

    async def _session():
        yield session

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = _session
    limiter.reset()
    account_limiter.clear()


def _clear() -> None:
    app.dependency_overrides.clear()
    limiter.reset()
    account_limiter.clear()


def _user():
    return type(
        "User",
        (),
        {
            "id": uuid4(),
            "status": UserStatus.ACTIVE,
            "deleted_at": None,
            "password_changed_at": None,
            "token_version": 0,
        },
    )()


async def test_conversations_require_auth(client) -> None:
    response = await client.get("/api/v1/messages/conversations")
    assert response.status_code == 401


async def test_open_conversation_requires_auth(client) -> None:
    response = await client.post(
        "/api/v1/messages/conversations", json={"booking_id": str(uuid4())}
    )
    assert response.status_code == 401


async def test_unknown_conversation_is_404_not_403(client) -> None:
    _override(_user())
    try:
        response = await client.get(f"/api/v1/messages/conversations/{uuid4()}")
        assert response.status_code == 404
        assert response.json()["detail"] == "Conversation introuvable."
    finally:
        _clear()


async def test_stranger_cannot_send_message(client) -> None:
    _override(_user())
    try:
        response = await client.post(
            f"/api/v1/messages/conversations/{uuid4()}/messages",
            json={"body": "Bonjour"},
        )
        assert response.status_code == 404
    finally:
        _clear()


async def test_empty_message_is_422(client) -> None:
    _override(_user())
    try:
        response = await client.post(
            f"/api/v1/messages/conversations/{uuid4()}/messages",
            json={"body": ""},
        )
        assert response.status_code == 422
    finally:
        _clear()


async def test_reviews_require_auth(client) -> None:
    response = await client.post(
        "/api/v1/reviews", json={"booking_id": str(uuid4()), "rating": 5}
    )
    assert response.status_code == 401


async def test_review_unknown_booking_is_404(client) -> None:
    _override(_user())
    try:
        response = await client.post(
            "/api/v1/reviews", json={"booking_id": str(uuid4()), "rating": 5}
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Réservation introuvable."
    finally:
        _clear()


async def test_reports_require_auth(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        json={"reported_user_id": str(uuid4()), "reason": "harassment"},
    )
    assert response.status_code == 401


async def test_cannot_report_self(client) -> None:
    user = _user()
    _override(user)
    try:
        response = await client.post(
            "/api/v1/reports",
            json={"reported_user_id": str(user.id), "reason": "other"},
        )
        assert response.status_code == 409
    finally:
        _clear()


async def test_blocks_require_auth(client) -> None:
    response = await client.get("/api/v1/blocks")
    assert response.status_code == 401


async def test_cannot_block_self(client) -> None:
    user = _user()
    _override(user)
    try:
        response = await client.post("/api/v1/blocks", json={"user_id": str(user.id)})
        assert response.status_code == 409
    finally:
        _clear()
