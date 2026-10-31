"""Security audit of the administration dashboard: attacks, not features.

Each test reproduces an attack and asserts that the surface resists it. The
tests are written from the attacker's point of view: they try to reach the
moderation surface without the admin role, to escalate privileges, to abuse
the search filters, or to keep a session alive after a sanction.

The session is faked, the behaviour under test is the one of the controller
and of the service layer. No database is needed.
"""

import re
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from app.models import IdDocumentStatus, UserRole, UserStatus
from app.models.trust import ReportStatus

# Every route of the administration surface, with the body it expects.
ADMIN_ROUTES = [
    ("GET", "/api/v1/admin/stats", None),
    ("GET", "/api/v1/admin/users", None),
    ("GET", "/api/v1/admin/reports", None),
    (
        "PATCH",
        "/api/v1/admin/reports/00000000-0000-0000-0000-000000000001",
        {"status": "resolved"},
    ),
    (
        "PATCH",
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000002/status",
        {"status": "banned"},
    ),
    (
        "PATCH",
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000003/identity",
        {"id_document_status": "verified"},
    ),
]


class FakeSession:
    """Minimal async session: counts, scalars and the written rows."""

    def __init__(self) -> None:
        self.scalar_results: list = []
        self.scalars_results: list = []
        self.committed = 0
        self.refreshed = 0
        self.scalar_hook = None
        # Every statement the service layer sent, to inspect the built SQL.
        self.statements: list[str] = []

    async def scalar(self, statement):
        self.statements.append(str(statement))
        if self.scalar_hook is not None:
            hooked = self.scalar_hook(statement)
            if hooked is not None:
                return hooked
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    async def scalars(self, statement):
        self.statements.append(str(statement))
        if self.scalars_results:
            return FakeScalarResult(self.scalars_results.pop(0))
        return FakeScalarResult([])

    async def execute(self, statement):
        self.statements.append(str(statement))
        return _EmptyResult()

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


class FakeScalarResult:
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


class _EmptyResult:
    def first(self):
        return None

    def all(self):
        return []


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
    """Hook returning `row` for the user lookup, None for the count query.

    The lookup is the only statement that selects from `users` and carries
    the id of the target; the count query aggregates the same table without
    filtering on the id.
    """

    def hook(statement) -> object:
        text = str(statement)
        if "FROM users" in text and "WHERE" in text:
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


def _real_session_dependency(user):
    """A session resolving one user, for the routes that must use the real auth."""

    class Session:
        async def get(self, *_args):
            return user

        async def scalar(self, *_args):
            return 0

    async def _session():
        yield Session()

    return _session


# --- Attack 1: reading the surface without the admin role --------------------


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_anonymous_caller_is_rejected(client, session, method, path, body) -> None:
    """No token at all: the surface must answer 401, never data."""
    response = await client.request(method, path, json=body)
    assert response.status_code == 401


@pytest.mark.parametrize("role", [UserRole.PASSENGER, UserRole.DRIVER])
@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_non_admin_caller_is_rejected(
    client, session, method, path, body, role
) -> None:
    """A regular account must not read or change anything."""
    app.dependency_overrides[get_current_user] = lambda: _user(role)
    try:
        response = await client.request(method, path, json=body)
        assert response.status_code == 403
        # No moderation data leaks through the error path.
        assert "email" not in response.text
        assert "password" not in response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_forged_admin_claim_is_rejected(client, session, method, path, body) -> None:
    """A token whose `role` claim says admin does not grant admin.

    The role must be read from the database, never from the token.
    """
    from app.core.security import issue_access_token

    user = _user(UserRole.PASSENGER)
    token = issue_access_token(user_id=user.id, role="admin", token_version=0)

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(user)
    try:
        response = await client.request(
            method, path, json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("status", [UserStatus.SUSPENDED, UserStatus.BANNED])
@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_suspended_admin_loses_the_dashboard(
    client, session, method, path, body, status
) -> None:
    """A suspended or banned administrator must not keep the moderation queue."""
    from app.core.security import issue_access_token

    user = _user(UserRole.ADMIN, status=status)
    token = issue_access_token(user_id=user.id, role="admin", token_version=0)

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(user)
    try:
        response = await client.request(
            method, path, json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_expired_token_is_rejected(client, session, method, path, body) -> None:
    """An expired access token must not open the dashboard."""
    import jwt
    from app.core.config import settings

    user = _user(UserRole.ADMIN)
    expired = jwt.encode(
        {
            "sub": str(user.id),
            "role": "admin",
            "type": "access",
            "ver": 0,
            "iat": 1_600_000_000,
            "exp": 1_600_000_600,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(user)
    try:
        response = await client.request(
            method, path, json=body, headers={"Authorization": f"Bearer {expired}"}
        )
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_refresh_token_cannot_open_the_dashboard(
    client, session, method, path, body
) -> None:
    """A refresh token is not an access token: it must not authenticate."""
    from app.core.security import issue_purpose_token

    user = _user(UserRole.ADMIN)
    token = issue_purpose_token(
        user_id=user.id, purpose="reset_password", expires_minutes=30
    )

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(user)
    try:
        response = await client.request(
            method, path, json=body, headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


# --- Attack 2: privilege escalation inside the moderation surface -----------


async def test_attack_admin_cannot_sanction_another_admin(client, session, admin) -> None:
    """The moderation queue must not be lockable by its own administrators."""
    other_admin = _user(UserRole.ADMIN)
    session.scalar_hook = _user_lookup(other_admin)
    response = await client.patch(
        f"/api/v1/admin/users/{other_admin.id}/status", json={"status": "banned"}
    )
    assert response.status_code == 409
    assert session.committed == 0
    assert other_admin.status == UserStatus.ACTIVE


async def test_attack_admin_cannot_suspend_themselves(client, session, admin) -> None:
    """No self-destruction: an administrator cannot lock their own account."""
    session.scalar_hook = _user_lookup(admin)
    response = await client.patch(
        f"/api/v1/admin/users/{admin.id}/status", json={"status": "banned"}
    )
    assert response.status_code == 409
    assert session.committed == 0
    assert admin.status == UserStatus.ACTIVE


async def test_attack_admin_cannot_change_their_own_identity(client, session, admin) -> None:
    """An administrator cannot validate their own identity document."""
    session.scalar_hook = _user_lookup(admin)
    response = await client.patch(
        f"/api/v1/admin/users/{admin.id}/identity",
        json={"id_document_status": "verified"},
    )
    assert response.status_code == 409
    assert session.committed == 0


async def test_attack_admin_cannot_set_the_identity_of_another_admin(
    client, session, admin
) -> None:
    """The identity decision must not touch an administrator account.

    Identity verification gates the driver features; letting an administrator
    validate an administrator account would let a compromised administrator
    re-enable a suspended colleague's access to the platform.
    """
    other_admin = _user(UserRole.ADMIN, id_document_status=IdDocumentStatus.PENDING)
    session.scalar_hook = _user_lookup(other_admin)
    response = await client.patch(
        f"/api/v1/admin/users/{other_admin.id}/identity",
        json={"id_document_status": "verified"},
    )
    assert response.status_code == 409
    assert session.committed == 0
    assert other_admin.id_document_status == IdDocumentStatus.PENDING


async def test_attack_identity_decision_revokes_the_sessions_of_the_target(
    client, session, admin
) -> None:
    """A moderation decision must invalidate the tokens of the target.

    Without it, an account banned while holding a token keeps its access
    until the token expires.
    """
    target = _user(UserRole.DRIVER, token_version=2)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity",
        json={"id_document_status": "rejected"},
    )
    assert response.status_code == 200
    assert target.token_version == 3


async def test_attack_unban_also_revokes_the_sessions(client, session, admin) -> None:
    """Reinstating an account must not keep the token obtained before the ban."""
    target = _user(UserRole.DRIVER, status=UserStatus.SUSPENDED, token_version=7)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "active"}
    )
    assert response.status_code == 200
    assert target.token_version == 8


# --- Attack 3: the session of a sanctioned account must die -----------------


async def test_attack_stale_token_is_refused_after_a_sanction(client, session, admin) -> None:
    """The token held before the ban must stop working immediately."""
    from app.core.security import issue_access_token

    target = _user(UserRole.DRIVER, token_version=0)
    session.scalar_hook = _user_lookup(target)
    banned = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "banned"}
    )
    assert banned.status_code == 200

    stale_token = issue_access_token(user_id=target.id, role="driver", token_version=0)

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(target)
    try:
        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {stale_token}"}
        )
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


async def test_attack_token_of_a_demoted_admin_is_refused(client, session, admin) -> None:
    """A token issued before a role change must not keep the admin access.

    Two independent protections must hold: the revoked session (token version
    mismatch, 401) and the role read from the database (403). Whichever fires
    first, the request must not reach the moderation data.
    """
    from app.core.security import issue_access_token

    target = _user(UserRole.ADMIN, token_version=0)
    token = issue_access_token(user_id=target.id, role="admin", token_version=0)

    # The account loses the admin role and its sessions are revoked.
    target.role = UserRole.DRIVER
    target.token_version = 1

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(target)
    try:
        response = await client.get(
            "/api/v1/admin/stats", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()


async def test_attack_demoted_admin_is_refused_even_with_a_valid_session(
    client, session, admin
) -> None:
    """The role is read from the database, not from the token claims.

    Here the session is still valid (the token version matches), only the
    role changed in the database: the request must be refused with a 403.
    """
    from app.core.security import issue_access_token

    target = _user(UserRole.ADMIN, token_version=0)
    token = issue_access_token(user_id=target.id, role="admin", token_version=0)

    # The role changed, but the session was not revoked.
    target.role = UserRole.DRIVER

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_db_session] = _real_session_dependency(target)
    try:
        response = await client.get(
            "/api/v1/admin/stats", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- Attack 4: the search filter must not be a wildcard ---------------------


async def test_attack_wildcard_search_does_not_match_every_user(
    client, session, admin
) -> None:
    """A `%` typed in the search box must not return the whole directory.

    The `%` and `_` characters of a LIKE pattern must be escaped, otherwise
    the filter is a data exfiltration primitive and a way to force a full
    table scan on a large dataset.
    """
    from app.services.admin import _escape_like

    # The wildcards are neutralised before the pattern is built.
    assert _escape_like("%") == "\\%"
    assert _escape_like("_") == "\\_"
    assert _escape_like("a\\b") == "a\\\\b"
    assert _escape_like("ana") == "ana"

    session.scalar_results = [0]
    session.scalars_results = [[]]
    response = await client.get("/api/v1/admin/users", params={"query": "%"})
    assert response.status_code == 200

    statements = " ".join(session.statements)
    assert "ESCAPE" in statements.upper(), (
        "the LIKE pattern must be escaped: % and _ are wildcards"
    )


async def test_attack_search_stays_parameterised(client, session, admin) -> None:
    """The search term is a bound parameter, never concatenated in the SQL."""
    session.scalar_results = [0]
    session.scalars_results = [[]]
    response = await client.get(
        "/api/v1/admin/users", params={"query": "'; DROP TABLE users; --"}
    )
    assert response.status_code == 200

    statements = " ".join(session.statements)
    assert "DROP TABLE" not in statements.upper()
    # The value travels as a bound parameter.
    assert ":email_1" in statements or ":param_1" in statements


async def test_attack_underscore_search_is_escaped(client, session, admin) -> None:
    """`_` is a single-character wildcard in LIKE: it must be escaped too."""
    session.scalar_results = [0]
    session.scalars_results = [[]]
    response = await client.get("/api/v1/admin/users", params={"query": "_"})
    assert response.status_code == 200

    statements = " ".join(session.statements)
    assert "ESCAPE" in statements.upper()


async def test_attack_search_rejects_an_overlong_query(client, session, admin) -> None:
    """The search input is bounded, so a long value cannot be used as a probe."""
    response = await client.get("/api/v1/admin/users", params={"query": "a" * 500})
    assert response.status_code == 422


# --- Attack 5: the response must not leak secrets ----------------------------


async def test_attack_user_list_does_not_leak_the_password_hash(
    client, session, admin
) -> None:
    """No secret ever crosses the administration boundary."""
    session.scalar_results = [1]
    session.scalars_results = [[_user()]]
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 200
    body = response.text
    for leaked in ("password_hash", "password", "token_version", "hashed"):
        assert leaked not in body


async def test_attack_report_list_does_not_leak_the_private_details(
    client, session, admin
) -> None:
    """The moderation list exposes the report, not the internal bookkeeping."""
    now = datetime(2026, 1, 1, tzinfo=UTC)
    session.scalar_results = [1]
    session.scalars_results = [
        [
            SimpleNamespace(
                id=uuid4(),
                reporter_id=uuid4(),
                reported_user_id=uuid4(),
                booking_id=None,
                reason="safety",
                details="a description",
                status=ReportStatus.OPEN,
                created_at=now,
                updated_at=now,
            )
        ]
    ]
    response = await client.get("/api/v1/admin/reports")
    assert response.status_code == 200
    assert "reporter_password" not in response.text


async def test_attack_soft_deleted_accounts_stay_out_of_the_directory(
    client, session, admin
) -> None:
    """A deleted account must not appear in the moderation list."""
    session.scalar_results = [0]
    session.scalars_results = [[]]
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 200

    statements = " ".join(session.statements)
    assert "deleted_at" in statements, (
        "the user list must filter out the soft-deleted accounts"
    )


# --- Attack 6: the moderation surface must be throttled ---------------------


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_attack_admin_surface_is_rate_limited(
    client, session, admin, method, path, body
) -> None:
    """The administration surface must be rate limited.

    Without a limit, a stolen administrator token gives an unlimited
    enumeration of the platform (users, reports) and an unlimited way to
    sanction accounts.

    The check is on the limiter registry: the calls are not replayed a
    hundred times, the quota must be registered on the endpoint.
    """
    assert _endpoint_of(path) is not None, f"{method} {path} is not registered"
    assert _quota_of(path) is not None, (
        f"the admin route {method} {path} carries no rate limit: "
        "the administration surface is not throttled"
    )


# Endpoint function behind each path of the administration surface.
ADMIN_ENDPOINTS = {
    "/api/v1/admin/stats": "read_stats",
    "/api/v1/admin/users": "list_users",
    "/api/v1/admin/reports": "list_reports",
    "/api/v1/admin/reports/{report_id}": "update_report",
    "/api/v1/admin/users/{user_id}/status": "update_user_status",
    "/api/v1/admin/users/{user_id}/identity": "update_user_identity",
}


def _endpoint_of(path: str) -> str | None:
    """The name of the endpoint function behind a path of the admin surface.

    The concrete identifiers of the tests are replaced by the name of the
    parameter, to match the declared routes.
    """
    normalised = re.sub(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        "{id}",
        path,
    )
    for template, endpoint in ADMIN_ENDPOINTS.items():
        if re.sub(r"\{[a-z_]+\}", "{id}", template) == normalised:
            return endpoint
    return None


def _quota_of(path: str) -> int | None:
    """The number of calls allowed by the rate limit of a path, if any."""
    endpoint = _endpoint_of(path)
    if endpoint is None:
        return None

    route_limits = app.state.limiter._route_limits
    for key, limits in route_limits.items():
        if key.endswith(f".{endpoint}"):
            for limit in limits:
                amount = getattr(limit.limit, "amount", None)
                if amount is not None:
                    return int(amount)
    return None


async def test_attack_the_admin_surface_really_answers_429(client, session, admin) -> None:
    """End to end proof: the limiter answers 429 once the quota is spent.

    The quota of the statistics route is read from the limiter registry, so
    the test stays in step with the configured value.
    """
    limiter.reset()
    account_limiter.clear()

    quota = _quota_of("/api/v1/admin/stats")
    assert quota is not None, "the statistics route carries no rate limit"

    session.scalar_results = [0] * 10
    statuses = []
    response = None
    for _ in range(quota + 5):
        response = await client.get("/api/v1/admin/stats")
        statuses.append(response.status_code)
        if response.status_code == 429:
            break

    assert 429 in statuses, (
        f"the administration surface answered {set(statuses)} after {quota + 5} "
        "calls: the quota is never enforced"
    )
    # The 429 comes with the Retry-After header the client needs.
    assert response.headers.get("Retry-After")


# --- Attack 7: the moderation decisions are bounded -------------------------


async def test_attack_pending_status_cannot_be_forced_by_an_admin(
    client, session, admin
) -> None:
    """`pending` is not a sanction: it must not be settable from the dashboard."""
    target = _user(UserRole.DRIVER)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "pending"}
    )
    assert response.status_code == 422
    assert session.committed == 0


async def test_attack_pending_identity_cannot_be_forced_by_an_admin(
    client, session, admin
) -> None:
    """Only a decision is accepted, never a reset to `pending`."""
    target = _user(UserRole.DRIVER)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity", json={"id_document_status": "pending"}
    )
    assert response.status_code == 422
    assert session.committed == 0


async def test_attack_unknown_status_is_rejected(client, session, admin) -> None:
    """An unknown status must not reach the database."""
    target = _user(UserRole.DRIVER)
    session.scalar_hook = _user_lookup(target)
    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "superuser"}
    )
    assert response.status_code == 422
    assert session.committed == 0


# --- Attack 8: the administrator account must not be self-service -----------


async def test_attack_bootstrap_never_demotes_an_administrator() -> None:
    """The bootstrap only promotes: it must never remove the admin role."""
    from app.services import admin as admin_service

    target = _user(UserRole.ADMIN, token_version=3)

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
    promoted = await admin_service.bootstrap_admin(session, "admin@example.com")

    assert promoted is target
    assert target.role == UserRole.ADMIN
    assert session.committed == 0
    assert target.token_version == 3


async def test_attack_bootstrap_ignores_a_deleted_account() -> None:
    """A soft-deleted account must not be promoted to administrator."""
    from app.services import admin as admin_service

    target = _user(UserRole.PASSENGER, deleted_at=datetime(2026, 1, 1, tzinfo=UTC))

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
    promoted = await admin_service.bootstrap_admin(session, "ghost@example.com")

    assert promoted is None
    assert target.role == UserRole.PASSENGER
    assert session.committed == 0


async def test_attack_bootstrap_does_not_create_an_account() -> None:
    """The bootstrap promotes an existing account: it never creates one."""
    from app.services import admin as admin_service

    class Session:
        def __init__(self) -> None:
            self.committed = 0
            self.added = []

        async def scalar(self, _statement):
            return None

        def add(self, obj) -> None:
            self.added.append(obj)

        async def commit(self) -> None:
            self.committed += 1

        async def refresh(self, _obj) -> None:
            return None

    session = Session()
    promoted = await admin_service.bootstrap_admin(session, "nobody@example.com")

    assert promoted is None
    assert session.added == []
    assert session.committed == 0
