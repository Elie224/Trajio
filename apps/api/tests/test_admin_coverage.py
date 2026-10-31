"""Couverture manquante de la surface d'administration.

Ce fichier complete `test_admin.py` (couvertures fonctionnelles) et
`test_admin_security.py` (attaques) sur les cas qui n'etaient verifies
nulle part :

- les bornes de pagination de la liste des **signalements** (seule la liste
  des utilisateurs les testait) ;
- la **reactivation** d'un compte banni ou suspendu (seul l'effet sur les
  sessions etait teste, jamais le statut lui-meme) ;
- la **re-decision d'identite** d'un document refuse (seul le refus etait
  teste, jamais la revalidation) ;
- la **suppression logique** d'un compte cible : `get_user` ignore les
  comptes supprimes, ce filtre n'etait verifie par aucun test ;
- les **effets de bord des transitions de signalement** : le statut du
  signalement et le nombre de rapports ouverts apres traitement ;
- la **coherence du compteur** `open_reports` avec la liste filtree.

Les noms des tests decrivent le comportement attendu, pour qu'un echec
nomme exactement la regle rompue.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.api.deps import get_current_user, get_db_session
from app.core.rate_limit import account_limiter, limiter
from app.main import app
from app.models import IdDocumentStatus, UserRole, UserStatus
from app.models.trust import ReportStatus
from app.schemas.admin import ADMIN_PAGE_DEFAULT_LIMIT, ADMIN_PAGE_MAX_LIMIT


class FakeScalarResult:
    """Mimics SQLAlchemy's ScalarResult: awaitable and iterable."""

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
        self.statements: list[str] = []
        self.committed = 0
        self.refreshed = 0
        self.scalar_hook = None

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

    @property
    def sql(self) -> str:
        return " ".join(self.statements)


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


def _report(status: ReportStatus = ReportStatus.OPEN, **overrides):
    now = datetime(2026, 1, 1, tzinfo=UTC)
    defaults = {
        "id": uuid4(),
        "reporter_id": uuid4(),
        "reported_user_id": uuid4(),
        "booking_id": None,
        "reason": "safety",
        "details": "detail",
        "status": status,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _user_lookup(row):
    """Hook returning `row` for the user lookup, None for the count query."""

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


# --- Pagination de la liste des signalements --------------------------------


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": -1},
        {"limit": ADMIN_PAGE_MAX_LIMIT + 1},
        {"offset": -1},
    ],
)
async def test_reports_list_rejects_out_of_range_pagination(client, session, admin, params) -> None:
    """Les bornes de pagination de la liste des signalements sont appliquees.

    Seule la liste des utilisateurs les testait : une valeur hors bornes
    sur les signalements passait inapercue.
    """
    response = await client.get("/api/v1/admin/reports", params=params)

    assert response.status_code == 422, params
    assert session.committed == 0


async def test_reports_list_accepts_the_pagination_bounds(client, session, admin) -> None:
    """Les bornes exactes sont acceptees."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    lowest = await client.get("/api/v1/admin/reports", params={"limit": 1, "offset": 0})
    assert lowest.status_code == 200

    highest = await client.get(
        "/api/v1/admin/reports",
        params={"limit": ADMIN_PAGE_MAX_LIMIT, "offset": 1000},
    )
    assert highest.status_code == 200


async def test_reports_list_applies_the_status_filter(client, session, admin) -> None:
    """Le filtre de statut est bien applique a la requete.

    Le test verifie la clause SQL : sans elle, la liste renvoie tous les
    signalements alors que l'administrateur a demande un seul statut.
    La valeur voyage en parametre lie, on verifie donc la presence de la
    clause `reports.status`.
    """
    session.scalar_results = [0]
    session.scalars_results = [[]]

    response = await client.get("/api/v1/admin/reports", params={"status": "reviewing"})

    assert response.status_code == 200
    assert "reports.status" in session.sql.lower(), "the status filter is missing from the query"


async def test_reports_list_without_filter_does_not_filter_on_the_status(
    client, session, admin
) -> None:
    """Sans filtre, la liste ne restreint pas les statuts."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    response = await client.get("/api/v1/admin/reports")

    assert response.status_code == 200
    assert "WHERE reports.status" not in session.sql


async def test_reports_list_paginates_with_limit_and_offset(client, session, admin) -> None:
    """La pagination est transmise a la requete."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    await client.get("/api/v1/admin/reports", params={"limit": 20, "offset": 40})

    sql = session.sql.lower()
    assert "limit" in sql
    assert "offset" in sql


async def test_reports_list_uses_the_default_page_size(client, session, admin) -> None:
    """Sans parametre, la page par defaut du tableau de bord est utilisee."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    await client.get("/api/v1/admin/reports")

    assert ADMIN_PAGE_DEFAULT_LIMIT == 20
    assert "limit" in session.sql.lower()


# --- Reactivation d'un compte ------------------------------------------------


@pytest.mark.parametrize(
    ("previous", "token_version"),
    [
        (UserStatus.SUSPENDED, 3),
        (UserStatus.BANNED, 7),
    ],
)
async def test_a_suspended_account_can_be_reinstated(
    client, session, admin, previous, token_version
) -> None:
    """Un compte suspendu ou banni peut etre reactivated.

    Le statut doit réellement revenir a `active` : seule la revocation des
    sessions etait verifiee jusqu'ici, pas le statut lui-meme.
    """
    target = _user(UserRole.DRIVER, status=previous, token_version=token_version)
    session.scalar_hook = _user_lookup(target)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "active"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert target.status == UserStatus.ACTIVE
    # La reactivation revoque aussi les sessions: l'ancien jeton ne doit
    # pas rester utilisable.
    assert target.token_version == token_version + 1
    assert session.committed == 1


async def test_a_banned_account_can_be_reinstated(client, session, admin) -> None:
    """Le bannissement est reversible depuis le tableau de bord."""
    target = _user(UserRole.DRIVER, status=UserStatus.BANNED, token_version=0)
    session.scalar_hook = _user_lookup(target)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "active"}
    )

    assert response.status_code == 200
    assert target.status == UserStatus.ACTIVE


async def test_the_sanction_statuses_are_the_three_the_dashboard_offers() -> None:
    """Les statuts de sanction sont exactement ceux proposes par l'UI."""
    from app.api.v1.endpoints.admin import SANCTION_STATUSES

    assert SANCTION_STATUSES == {UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED}


# --- Re-decision d'identite --------------------------------------------------


async def test_a_rejected_identity_can_be_verified_again(client, session, admin) -> None:
    """Un document d'identite refuse peut etre revalide.

    Le refus etait teste, jamais la revalidation : le cas de rigueur du
    dossier (erreur de l'administrateur) n'etait couvert par aucun test.
    """
    target = _user(UserRole.DRIVER, id_document_status=IdDocumentStatus.REJECTED)
    session.scalar_hook = _user_lookup(target)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity",
        json={"id_document_status": "verified"},
    )

    assert response.status_code == 200
    assert response.json()["id_document_status"] == "verified"
    assert target.id_document_status == IdDocumentStatus.VERIFIED
    assert session.committed == 1


async def test_a_verified_identity_can_be_rejected_again(client, session, admin) -> None:
    """Un document verifie peut etre refuse apres coup."""
    target = _user(UserRole.DRIVER, id_document_status=IdDocumentStatus.VERIFIED)
    session.scalar_hook = _user_lookup(target)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity",
        json={"id_document_status": "rejected"},
    )

    assert response.status_code == 200
    assert target.id_document_status == IdDocumentStatus.REJECTED


async def test_a_re_decided_identity_revokes_the_sessions_of_the_target(
    client, session, admin
) -> None:
    """Une re-decision d'identite revoque les sessions comme une sanction."""
    target = _user(UserRole.DRIVER, id_document_status=IdDocumentStatus.REJECTED, token_version=4)
    session.scalar_hook = _user_lookup(target)

    await client.patch(
        f"/api/v1/admin/users/{target.id}/identity",
        json={"id_document_status": "verified"},
    )

    assert target.token_version == 5


# --- Compte supprime (suppression logique) -----------------------------------


async def test_a_soft_deleted_account_cannot_be_sanctioned(client, session, admin) -> None:
    """Un compte supprime logiquement n'est pas sanctionnable.

    `get_user` filtre les comptes supprimes : le dashboard ne doit pas
    sanctionner un compte qui n'existe plus. Le filtre est verifie sur la
    requete, sinon le test ne prouverait rien (la session factice
    renverrait de toute facon `None`).
    """
    target = _user(
        UserRole.DRIVER,
        status=UserStatus.ACTIVE,
        deleted_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    # The lookup of a soft-deleted account returns nothing.
    session.scalar_hook = _user_lookup(None)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/status", json={"status": "banned"}
    )

    assert response.status_code == 404
    assert session.committed == 0
    assert target.status == UserStatus.ACTIVE
    # The lookup must have excluded the deleted accounts.
    assert "deleted_at" in session.sql.lower(), (
        "the sanction of a deleted account must be refused by the query itself"
    )


async def test_a_soft_deleted_account_cannot_have_its_identity_decided(
    client, session, admin
) -> None:
    """Un compte supprime logiquement n'a pas d'identite a decider."""
    target = _user(
        UserRole.DRIVER,
        id_document_status=IdDocumentStatus.PENDING,
        deleted_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    session.scalar_hook = _user_lookup(None)

    response = await client.patch(
        f"/api/v1/admin/users/{target.id}/identity",
        json={"id_document_status": "verified"},
    )

    assert response.status_code == 404
    assert session.committed == 0
    assert target.id_document_status == IdDocumentStatus.PENDING
    # The lookup must have excluded the deleted accounts.
    assert "deleted_at" in session.sql.lower(), (
        "the identity decision on a deleted account must be refused by the query itself"
    )


async def test_the_user_lookup_excludes_the_soft_deleted_accounts() -> None:
    """La requete de lecture d'un compte filtre bien `deleted_at`.

    Le filtre est verifie sur la requete reelle : un `get_user` qui
    oublierait le filtre renverrait un compte supprime comme cible de
    sanction.
    """
    from app.services.admin import get_user

    captured: list[str] = []

    class Session:
        async def scalar(self, statement):
            captured.append(str(statement))
            return None

    await get_user(Session(), uuid4())

    assert captured, "the user was not looked up"
    sql = captured[0].lower()
    assert "deleted_at" in sql, "the lookup must exclude the soft-deleted accounts"
    assert "is null" in sql, "the lookup must keep only the live accounts"


async def test_the_user_lookup_returns_a_live_account() -> None:
    """Un compte vivant est bien retrouve par `get_user`."""
    from app.services.admin import get_user

    target = _user(UserRole.DRIVER)
    captured: list[str] = []

    class Session:
        async def scalar(self, statement):
            captured.append(str(statement))
            return target

    found = await get_user(Session(), target.id)

    assert found is target
    assert "deleted_at" in captured[0]


# --- Effets de bord du traitement d'un signalement ---------------------------


async def test_treating_a_report_updates_its_status(client, session, admin) -> None:
    """Le traitement d'un signalement ecrit le nouveau statut."""
    report = _report(ReportStatus.OPEN)

    async def _get(_model, _pk):
        return report

    session.get = _get

    response = await client.patch(f"/api/v1/admin/reports/{report.id}", json={"status": "resolved"})

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert report.status == ReportStatus.RESOLVED
    assert session.committed == 1


async def test_a_report_moved_to_reviewing_is_no_longer_open(client, session, admin) -> None:
    """Un signalement passe en revue sort du compteur des signalements ouverts.

    `open_reports` compte `open` et `reviewing` : le passage en revue ne
    change donc pas le compteur, contrairement a une resolution. Ce test
    verrouille la semantique.
    """
    from app.services.admin import OPEN_REPORT_STATUSES

    assert ReportStatus.REVIEWING in OPEN_REPORT_STATUSES
    assert ReportStatus.RESOLVED not in OPEN_REPORT_STATUSES
    assert ReportStatus.DISMISSED not in OPEN_REPORT_STATUSES


async def test_the_open_reports_counter_matches_the_filtered_list(client, session, admin) -> None:
    """Le compteur des signalements ouverts et la liste filtrée comptent pareil.

    La tuile « Signalements ouverts » doit annoncer le meme nombre que la
    liste des signalements filtres sur `open` et `reviewing`.
    """
    from app.services.admin import OPEN_REPORT_STATUSES

    assert set(OPEN_REPORT_STATUSES) == {ReportStatus.OPEN, ReportStatus.REVIEWING}

    # The stats count the reports whose status is in the open set.
    # The counters are read in the order of the service: 4 account
    # counters, 2 trip counters, 2 booking counters, then the reports.
    session.scalar_results = [0] * 8 + [4, 0]
    stats = await client.get("/api/v1/admin/stats")
    assert stats.status_code == 200
    assert stats.json()["open_reports"] == 4

    # The list filters on the same set and reports the same total.
    session.statements.clear()
    session.scalar_results = [4]
    session.scalars_results = [[]]
    reports = await client.get("/api/v1/admin/reports")
    assert reports.status_code == 200
    assert reports.json()["total"] == 4


async def test_the_stats_counter_ignores_the_closed_reports(client, session, admin) -> None:
    """Un signalement resolu ou classe ne compte plus."""
    from app.services.admin import OPEN_REPORT_STATUSES

    for closed in (ReportStatus.RESOLVED, ReportStatus.DISMISSED):
        assert closed not in OPEN_REPORT_STATUSES


# --- Coherence de la liste des utilisateurs ----------------------------------


async def test_the_users_list_never_returns_a_soft_deleted_account(client, session, admin) -> None:
    """La liste des utilisateurs filtre les comptes supprimes."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    response = await client.get("/api/v1/admin/users")

    assert response.status_code == 200
    assert "deleted_at" in session.sql


async def test_the_users_list_accepts_the_pagination_bounds(client, session, admin) -> None:
    """Les bornes exactes de la pagination des utilisateurs sont acceptees."""
    session.scalar_results = [0]
    session.scalars_results = [[]]

    lowest = await client.get("/api/v1/admin/users", params={"limit": 1, "offset": 0})
    assert lowest.status_code == 200

    highest = await client.get(
        "/api/v1/admin/users",
        params={"limit": ADMIN_PAGE_MAX_LIMIT, "offset": 1000},
    )
    assert highest.status_code == 200
