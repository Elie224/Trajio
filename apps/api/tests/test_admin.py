"""Administration dashboard: access control, moderation and pagination.

The tests run without a database: the session is faked, the behaviour under
test is the one of the controller and of the service layer.
"""

import inspect
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from app.models import IdDocumentStatus, UserRole, UserStatus
from app.models.trust import ReportStatus

ADMIN_ROUTES = [
    ("GET", "/api/v1/admin/stats"),
    ("GET", "/api/v1/admin/users"),
    ("GET", "/api/v1/admin/reports"),
    ("PATCH", "/api/v1/admin/reports/00000000-0000-0000-0000-000000000001"),
    ("PATCH", "/api/v1/admin/users/00000000-0000-0000-0000-000000000002/status"),
    ("PATCH", "/api/v1/admin/users/00000000-0000-0000-0000-000000000003/identity"),
]


class FakeScalarResult:
    """Mimics SQLAlchemy's ScalarResult: it is awaitable and iterable."""

    def __init__(self, rows: list) -> None:
        self.rows = list(rows)

    def all(self) -> list:
        return self.rows

    def __iter__(self):
        return iter(self.rows)

    def __len__(self) -> int:
        return len(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None


class FakeSession:
    """Minimal async session: counts, scalars and the written rows."""

    def __init__(self) -> None:
        self.scalar_results: list = []
        self.scalars_results: list = []
        self.committed = 0
        self.refreshed = 0
        # Called with the statement; returns the result or None to fall back.
        self.scalar_hook = None

    async def scalar(self, _statement):
        if self.scalar_hook is not None:
            hooked = self.scalar_hook(_statement)
            if inspect.isawaitable(hooked):
                hooked = await hooked
            if hooked is not None:
                return hooked
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    async def scalars(self, _statement):
        if self.scalars_results:
            return FakeScalarResult(self.scalars_results.pop(0))
        return FakeScalarResult([])

    async def execute(self, _statement):
        class _Result:
            def first(self):
                return None

            def all(self):
                return []

        return _Result()

    async def get(self, _model, _pk):
        return None

    def add(self, _obj) -> None:
        return None

    async def commit(self) -> None:
        self.committed += 1

    async def refresh(self, _obj) -> None:
        self.refreshed += 1

    async def rollback(self) -> None:
        return None


def _user(role: UserRole = UserRole.ADMIN, **overrides):
    defaults = {
        "id": uuid4(),
        "role": role,
        "status": UserStatus.ACTIVE,
        "deleted_at": None,
        "password_changed_at": None,
        "token_version": 0,
        "email": "admin@example.com",
        "first_name": "Ada",
        "last_name": "Admin",
        "phone": None,
        "email_verified_at": None,
        "phone_verified_at": None,
        "license_verified_at": None,
        "id_document_status": IdDocumentStatus.VERIFIED,
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        "updated_at": datetime(2026, 1, 1, tzinfo=UTC),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _user_lookup(row):
    """Hook returning `row` for the user lookup, None for the count query."""

    def hook(statement) -> object:
        if "users" in str(statement):
            return row
        return None

    return hook


@pytest.fixture
def session() -> FakeSession:
    fake = FakeSession()

    async def _session():
        yield fake

    app.dependency_overrides[get_db_session] = _session
    limiter.reset()
    account_limiter.clear()
    yield fake
    app.dependency_overrides.clear()
    limiter.reset()
    account_limiter.clear()


@pytest.fixture
def admin() -> SimpleNamespace:
    user = _user()
    app.dependency_overrides[get_current_user] = lambda: user
    return user


# --- Access control --------------------------------------------------------


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
async def test_admin_routes_require_authentication(client, session, method, path) -> None:
    response = await client.request(method, path, json={})
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
async def test_admin_routes_reject_non_admin(client, session, method, path) -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(UserRole.DRIVER)
    try:
        response = await client.request(method, path, json={})
        assert response.status_code == 403
        assert response.json()["detail"] == "Accès réservé aux administrateurs."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
async def test_admin_routes_reject_suspended_admin(client, session, method, path) -> None:
    """A suspended or banned administrator loses access to the dashboard.

    The check lives in `get_current_user`, so the real dependency is used here
    with a suspended account resolved from the database.
    """
    from app.core.security import issue_access_token

    user = _user(UserRole.ADMIN, status=UserStatus.SUSPENDED)
    token = issue_access_token(user_id=user.id, role="admin", token_version=0)

    class Session:
        async def get(self, *_args):
            return user

        async def scalar(self, *_args):
            return 0

    async def _session():
        yield Session()

    app.dependency_overrides[get_db_session] = _session
    try:
        response = await client.request(
            method, path, json={}, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


async def test_admin_role_is_read_from_the_database_not_the_token(client, session) -> None:
    """A token claiming an admin role does not grant access on its own."""
    from app.core.security import issue_access_token

    user = _user(UserRole.PASSENGER)
    token = issue_access_token(user_id=user.id, role="admin", token_version=0)

    class Session:
        async def get(self, *_args):
            return user

        async def scalar(self, *_args):
            return 0

    async def _session():
        yield Session()

    app.dependency_overrides[get_db_session] = _session
    try:
        response = await client.get(
            "/api/v1/admin/stats", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- Statistics ------------------------------------------------------------


async def test_stats_returns_the_dashboard_counters(client, session, admin) -> None:
    session.scalar_results = [10, 4, 2, 3, 20, 12, 30, 5, 2, 40, 4.5]
    response = await client.get("/api/v1/admin/stats")
    assert response.status_code == 200
    assert response.json() == {
        "users_total": 10,
        "users_active": 4,
        "users_pending": 2,
        "drivers_total": 3,
        "trips_total": 20,
        "trips_scheduled": 12,
        "bookings_total": 30,
        "bookings_pending": 5,
        "open_reports": 2,
        "reviews_total": 40,
        "average_rating": 4.5,
    }


async def test_stats_average_rating_is_null_without_reviews(client, session, admin) -> None:
    session.scalar_results = [0] * 10 + [None]
    response = await client.get("/api/v1/admin/stats")
    assert response.status_code == 200
    assert response.json()["average_rating"] is None


async def test_stats_counts_are_integers_not_null(client, session, admin) -> None:
    session.scalar_results = [None] * 10 + [None]
    response = await client.get("/api/v1/admin/stats")
    body = response.json()
    assert response.status_code == 200
    for key, value in body.items():
        if key != "average_rating":
            assert value == 0, key
    assert body["average_rating"] is None


async def test_stats_exclude_the_soft_deleted_accounts(client, session, admin) -> None:
    """The tile and the user list must count the same accounts.

    A soft-deleted account is invisible in the list: counting it in the
    tile would make the "Utilisateurs" tile larger than the total of the
    list it summarises.
    """
    statements: list[str] = []

    async def _scalar(statement):
        statements.append(str(statement))
        return 1

    session.scalar_hook = _scalar
    response = await client.get("/api/v1/admin/stats")
    assert response.status_code == 200

    account_counters = statements[:4]
    assert len(account_counters) == 4
    for statement in account_counters:
        assert "deleted_at IS NULL" in statement, statement


async def test_stats_and_users_list_count_the_same_accounts(client, session, admin) -> None:
    """The `users_total` tile equals the `total` of the unfiltered list."""
    captured: list[str] = []

    async def _scalar(statement):
        captured.append(str(statement))
        # The four account counters of the stats, then the total of the list.
        return 7

    session.scalar_hook = _scalar
    stats = await client.get("/api/v1/admin/stats")
    assert stats.status_code == 200
    assert stats.json()["users_total"] == 7

    session.scalars_results = [[]]
    users = await client.get("/api/v1/admin/users")
    assert users.status_code == 200
    assert users.json()["total"] == 7

    # Both queries filter the deleted accounts.
    assert "deleted_at IS NULL" in captured[0]
    # The user list total comes after the eleven counters of the stats.
    assert "deleted_at IS NULL" in captured[11]


# --- Users list ------------------------------------------------------------


async def test_users_list_returns_items_and_total(client, session, admin) -> None:
    session.scalar_results = [42]
    session.scalars_results = [
        [_user(UserRole.DRIVER, email="driver@example.com")]
    ]
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 42
    assert len(body["items"]) == 1
    assert body["items"][0]["email"] == "driver@example.com"


async def test_users_list_accepts_the_dashboard_filters(client, session, admin) -> None:
    session.scalar_results = [1]
    session.scalars_results = [[]]
    response = await client.get(
        "/api/v1/admin/users",
        params={"status": "suspended", "role": "driver", "query": "ana", "limit": 10, "offset": 20},
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": -1},
        {"limit": 1000},
        {"offset": -1},
        {"status": "unknown"},
        {"role": "root"},
    ],
)
async def test_users_list_rejects_out_of_range_parameters(client, session, admin, params) -> None:
    response = await client.get("/api/v1/admin/users", params=params)
    assert response.status_code == 422


async def test_users_list_never_exposes_the_password_hash(client, session, admin) -> None:
    session.scalar_results = [1]
    session.scalars_results = [[_user()]]
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 200
    assert "password_hash" not in response.text
    assert "token_version" not in response.text


# --- Reports list ----------------------------------------------------------


async def test_reports_list_returns_items_and_total(client, session, admin) -> None:
    session.scalar_results = [3]
    session.scalars_results = [[]]
    response = await client.get("/api/v1/admin/reports", params={"status": "open"})
    assert response.status_code == 200
    assert response.json()["total"] == 3


async def test_reports_list_rejects_an_unknown_status(client, session, admin) -> None:
    response = await client.get("/api/v1/admin/reports", params={"status": "closed"})
    assert response.status_code == 422


# --- Moderation of a report ------------------------------------------------


async def test_report_status_update_writes_the_new_status(client, session, admin) -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    report = SimpleNamespace(
        id=uuid4(),
        reporter_id=uuid4(),
        reported_user_id=uuid4(),
        booking_id=None,
        reason="safety",
        details="detail",
        status=ReportStatus.OPEN,
        created_at=now,
        updated_at=now,
    )

    async def _get(_model, _pk):
        return report

    session.get = _get
    response = await client.patch(
        f"/api/v1/admin/reports/{report.id}", json={"status": "resolved"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert session.committed == 1


async def test_report_status_update_on_a_missing_report_is_404(client, session, admin) -> None:
    response = await client.patch(
        "/api/v1/admin/reports/00000000-0000-0000-0000-000000000009", json={"status": "resolved"}
    )
    assert response.status_code == 404
    assert session.committed == 0


async def test_report_status_update_rejects_an_invalid_status(client, session, admin) -> None:
    response = await client.patch(
        "/api/v1/admin/reports/00000000-0000-0000-0000-00000000000a",
        json={"status": "archived"},
    )
    assert response.status_code == 422


def _report(status: ReportStatus):
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return SimpleNamespace(
        id=uuid4(),
        reporter_id=uuid4(),
        reported_user_id=uuid4(),
        booking_id=None,
        reason="safety",
        details="detail",
        status=status,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (ReportStatus.OPEN, ReportStatus.REVIEWING),
        (ReportStatus.OPEN, ReportStatus.RESOLVED),
        (ReportStatus.OPEN, ReportStatus.DISMISSED),
        (ReportStatus.REVIEWING, ReportStatus.RESOLVED),
        (ReportStatus.REVIEWING, ReportStatus.DISMISSED),
    ],
)
async def test_report_status_update_accepts_the_allowed_transitions(
    client, session, admin, current, target
) -> None:
    report = _report(current)

    async def _get(_model, _pk):
        return report

    session.get = _get
    response = await client.patch(
        f"/api/v1/admin/reports/{report.id}", json={"status": target.value}
    )
    assert response.status_code == 200
    assert response.json()["status"] == target.value
    assert session.committed == 1


@pytest.mark.parametrize(
    ("current", "target"),
    [
        # A closed report must not be re-opened.
        (ReportStatus.RESOLVED, ReportStatus.OPEN),
        (ReportStatus.DISMISSED, ReportStatus.OPEN),
        (ReportStatus.RESOLVED, ReportStatus.REVIEWING),
        (ReportStatus.DISMISSED, ReportStatus.REVIEWING),
        # A closed report is terminal.
        (ReportStatus.RESOLVED, ReportStatus.RESOLVED),
        (ReportStatus.DISMISSED, ReportStatus.DISMISSED),
        (ReportStatus.RESOLVED, ReportStatus.DISMISSED),
        # The review step cannot be skipped backwards.
        (ReportStatus.REVIEWING, ReportStatus.OPEN),
    ],
)
async def test_report_status_update_rejects_the_forbidden_transitions(
    client, session, admin, current, target
) -> None:
    """The transition rule is on the server, not only in the front-end."""
    report = _report(current)

    async def _get(_model, _pk):
        return report

    session.get = _get
    response = await client.patch(
        f"/api/v1/admin/reports/{report.id}", json={"status": target.value}
    )
    assert response.status_code == 409
    # The status of the report is left untouched.
    assert report.status == current
    assert session.committed == 0


async def test_report_transition_rule_matches_the_dashboard_actions() -> None:
    """The server allows exactly what the dashboard offers."""
    from app.services.admin import REPORT_STATUS_TRANSITIONS

    # The front-end offers, for an open report: reviewing, resolved, dismissed.
    assert REPORT_STATUS_TRANSITIONS[ReportStatus.OPEN] == frozenset(
        {ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.DISMISSED}
    )
    # For a report under review: resolved, dismissed.
    assert REPORT_STATUS_TRANSITIONS[ReportStatus.REVIEWING] == frozenset(
        {ReportStatus.RESOLVED, ReportStatus.DISMISSED}
    )
    # A closed report offers nothing.
    assert REPORT_STATUS_TRANSITIONS[ReportStatus.RESOLVED] == frozenset()
    assert REPORT_STATUS_TRANSITIONS[ReportStatus.DISMISSED] == frozenset()


# --- Sanctions -------------------------------------------------------------


async def test_user_status_update_bans_and_revokes_sessions(client, session, admin) -> None:
    target = _user(UserRole.DRIVER, token_version=4)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "banned"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "banned"
    # The sanction revokes the sessions of the target account.
    assert target.token_version == 5
    assert session.committed == 1


async def test_user_status_update_on_a_missing_user_is_404(client, session, admin) -> None:
    response = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-00000000000b/status",
        json={"status": "suspended"},
    )
    assert response.status_code == 404
    assert session.committed == 0


async def test_user_status_update_rejects_the_pending_status(client, session, admin) -> None:
    """`pending` is not a sanction: an administrator cannot push a user back there."""
    target = _user()
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "pending"}
    )
    assert response.status_code == 422
    assert session.committed == 0


async def test_admin_cannot_sanction_another_admin(client, session, admin) -> None:
    """A suspended administrator would lock the moderation queue out."""
    other_admin = _user(UserRole.ADMIN)
    session.scalar_hook = _user_lookup(other_admin)
    response = await client.patch(
        f"/api/v1/admin/users/{other_admin.id}/status", json={"status": "suspended"}
    )
    assert response.status_code == 409
    assert session.committed == 0


async def test_admin_cannot_change_their_own_status(client, session, admin) -> None:
    session.scalar_hook = _user_lookup(admin)
    response = await client.patch(
        f"/api/v1/admin/users/{admin.id}/status", json={"status": "banned"}
    )
    assert response.status_code == 409
    assert session.committed == 0


async def test_admin_cannot_verify_their_own_identity(client, session, admin) -> None:
    session.scalar_hook = _user_lookup(admin)
    response = await client.patch(
        f"/api/v1/admin/users/{admin.id}/identity",
        json={"id_document_status": "verified"},
    )
    assert response.status_code == 409
    assert session.committed == 0


async def test_identity_decision_is_recorded(client, session, admin) -> None:
    target = _user(UserRole.DRIVER, id_document_status=IdDocumentStatus.PENDING)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity", json={"id_document_status": "verified"}
    )
    assert response.status_code == 200
    assert response.json()["id_document_status"] == "verified"
    assert session.committed == 1


async def test_identity_decision_rejects_the_pending_status(client, session, admin) -> None:
    target = _user(UserRole.DRIVER)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity", json={"id_document_status": "pending"}
    )
    assert response.status_code == 422
    assert session.committed == 0


async def test_identity_decision_on_a_missing_user_is_404(client, session, admin) -> None:
    response = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-00000000000c/identity",
        json={"id_document_status": "rejected"},
    )
    assert response.status_code == 404
    assert session.committed == 0


# --- Session invalidation --------------------------------------------------


async def test_sanction_revokes_the_tokens_of_the_target(client, session, admin) -> None:
    """After a ban, the access token of the target no longer works."""
    from app.core.security import issue_access_token

    target = _user(UserRole.DRIVER, token_version=0)
    session.scalar_hook = _user_lookup(target)
    banned = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "banned"}
    )
    assert banned.status_code == 200
    assert target.token_version == 1

    stale_token = issue_access_token(user_id=target.id, role="driver", token_version=0)

    class Session:
        async def get(self, *_args):
            return target

        async def scalar(self, *_args):
            return 0

    async def _session():
        yield Session()

    # The real `get_current_user` must run here: it is the one that checks
    # the token version against the account.
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _session
    try:
        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {stale_token}"}
        )
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


# --- Bootstrap of the administrator account --------------------------------


async def test_bootstrap_promotes_the_account_to_admin() -> None:
    from app.services import admin as admin_service

    target = _user(UserRole.PASSENGER, email="root@example.com", token_version=0)

    class Session:
        def __init__(self) -> None:
            self.committed = 0

        async def scalar(self, _statement):
            return target

        async def commit(self) -> None:
            self.committed += 1

        async def refresh(self, _obj) -> None:
            return None

    session = Session()
    promoted = await admin_service.bootstrap_admin(session, "root@example.com")

    assert promoted is target
    assert target.role == UserRole.ADMIN
    # The sessions opened before the promotion are revoked.
    assert target.token_version == 1
    assert session.committed == 1


async def test_bootstrap_is_case_insensitive() -> None:
    from app.services import admin as admin_service

    target = _user(UserRole.PASSENGER, email="root@example.com")

    class Session:
        async def scalar(self, _statement):
            return target

        async def commit(self) -> None:
            return None

        async def refresh(self, _obj) -> None:
            return None

    promoted = await admin_service.bootstrap_admin(Session(), "  ROOT@Example.COM ")
    assert promoted is not None
    assert target.role == UserRole.ADMIN


async def test_bootstrap_on_an_unknown_account_does_nothing() -> None:
    from app.services import admin as admin_service

    class Session:
        def __init__(self) -> None:
            self.committed = 0

        async def scalar(self, _statement):
            return None

        async def commit(self) -> None:
            self.committed += 1

    session = Session()
    promoted = await admin_service.bootstrap_admin(session, "ghost@example.com")
    assert promoted is None
    assert session.committed == 0


async def test_bootstrap_on_an_already_admin_account_is_a_no_op() -> None:
    from app.services import admin as admin_service

    target = _user(UserRole.ADMIN, token_version=3)

    class Session:
        def __init__(self) -> None:
            self.committed = 0

        async def scalar(self, _statement):
            return target

        async def commit(self) -> None:
            self.committed += 1

    session = Session()
    promoted = await admin_service.bootstrap_admin(session, "admin@example.com")
    assert promoted is target
    # No write, and the sessions stay valid.
    assert session.committed == 0
    assert target.token_version == 3


async def test_bootstrap_with_an_empty_email_does_nothing() -> None:
    from app.services import admin as admin_service

    class Session:
        async def scalar(self, _statement):
            raise AssertionError("the database must not be queried")

    assert await admin_service.bootstrap_admin(Session(), "   ") is None


async def test_bootstrap_is_skipped_when_no_email_is_configured(monkeypatch) -> None:
    from app.core.config import settings
    from app.main import bootstrap_admin_account

    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_EMAIL", "")
    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_ENABLED", True)
    # No database call happens: the function returns before opening a session.
    await bootstrap_admin_account()


async def test_bootstrap_is_skipped_when_disabled(monkeypatch) -> None:
    from app.core.config import settings
    from app.main import bootstrap_admin_account

    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_EMAIL", "root@example.com")
    monkeypatch.setattr(settings, "ADMIN_BOOTSTRAP_ENABLED", False)
    await bootstrap_admin_account()
