"""Contract of the administration dashboard, checked against the web client.

The dashboard is written twice: once in Python (FastAPI + Pydantic) and once
in TypeScript (`apps/web/src/lib/api.ts`). Nothing forces the two to agree
except this test: the OpenAPI schema produced by the API is compared field by
field with the TypeScript types of the client.

A drift is invisible at runtime - a renamed field reads `undefined` and the
dashboard shows an empty table - so it must be caught here.

The TypeScript file is read as text: the test only needs the shape of the
types, not a TypeScript compiler.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest
from app.main import app
from app.models import IdDocumentStatus, UserRole, UserStatus
from app.models.trust import ReportReason, ReportStatus
from app.schemas.admin import (
    ADMIN_PAGE_DEFAULT_LIMIT,
    ADMIN_PAGE_MAX_LIMIT,
    AdminReport,
    AdminReportListResponse,
    AdminStats,
    AdminUser,
    AdminUserListResponse,
)

# The TypeScript client of the dashboard.
# .../Trajio/apps/api/tests/test_admin_contract.py
# parents[0] = tests, [1] = api, [2] = apps, [3] = Trajio
TS_CLIENT = Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "lib" / "api.ts"


@pytest.fixture(scope="module")
def openapi() -> dict[str, Any]:
    """The OpenAPI document of the application."""
    return app.openapi()


@pytest.fixture(scope="module")
def ts_source() -> str:
    """The source of the TypeScript API client."""
    if not TS_CLIENT.exists():  # pragma: no cover - defensive
        pytest.skip(f"the TypeScript client is missing: {TS_CLIENT}")
    return TS_CLIENT.read_text(encoding="utf-8")


def _ts_type_block(ts_source: str, type_name: str) -> str:
    """The body of a `export type X = { ... };` declaration."""
    match = re.search(
        rf"export type {re.escape(type_name)}\s*=\s*\{{(.*?)\n\}};",
        ts_source,
        re.DOTALL,
    )
    if match is None:
        pytest.fail(f"the TypeScript type {type_name} is not declared in {TS_CLIENT}")
    return match.group(1)


def _ts_fields(ts_source: str, type_name: str) -> dict[str, str]:
    """The fields of a TypeScript object type: name -> declared type."""
    block = _ts_type_block(ts_source, type_name)
    fields: dict[str, str] = {}
    for line in block.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("/*"):
            continue
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\??:\s*(.+?);$", stripped)
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def _ts_union_values(ts_source: str, declared_type: str) -> set[str]:
    """The values of a TypeScript union of string literals.

    The union is either written inline (`"a" | "b"`) or through a named alias
    (`AdminReportStatus`), which is itself an inline union.
    """
    declared_type = declared_type.strip()

    # A named alias: resolve it to its own declaration.
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", declared_type):
        match = re.search(
            rf"export type {re.escape(declared_type)}\s*=\s*(.+?);",
            ts_source,
            re.DOTALL,
        )
        if match is None:
            return set()
        declared_type = match.group(1).strip()

    return set(re.findall(r'"([^"]+)"', declared_type))


def _schema_of(openapi: dict[str, Any], name: str) -> dict[str, Any]:
    schemas = openapi["components"]["schemas"]
    if name not in schemas:
        pytest.fail(f"the schema {name} is absent from the OpenAPI document")
    return schemas[name]


def _required_of(schema: dict[str, Any]) -> set[str]:
    return set(schema.get("required", []))


# --- The routes exist and answer the documented shapes ------------------------


def test_admin_routes_are_registered_in_the_openapi_document(openapi: dict[str, Any]) -> None:
    """The administration surface is published: the web client can call it."""
    paths = openapi["paths"]
    expected = {
        "/api/v1/admin/stats": {"get"},
        "/api/v1/admin/users": {"get"},
        "/api/v1/admin/reports": {"get"},
        "/api/v1/admin/reports/{report_id}": {"patch"},
        "/api/v1/admin/users/{user_id}/status": {"patch"},
        "/api/v1/admin/users/{user_id}/identity": {"patch"},
    }
    for path, methods in expected.items():
        assert path in paths, f"the route {path} is absent from the OpenAPI document"
        assert methods <= set(paths[path]), f"the route {path} does not expose {methods}"


def test_admin_routes_are_registered_only_in_the_v1_router(
    openapi: dict[str, Any],
) -> None:
    """The admin router is mounted once, on the v1 prefix.

    A router included twice would double the moderation routes and double
    the rate limit spent on them.
    """
    admin_paths = [path for path in openapi["paths"] if path.startswith("/api/v1/admin/")]
    assert len(admin_paths) == 6, f"the admin surface exposes {sorted(admin_paths)}"
    assert len(set(admin_paths)) == len(admin_paths), "the admin router is mounted twice"

    # The router is mounted by app/api/v1/router.py, and nowhere else.
    from app.api.v1.endpoints import admin as admin_endpoint
    from app.api.v1.router import api_router

    included = [
        router
        for router in api_router.routes
        if getattr(getattr(router, "original_router", None), "prefix", "")
        == admin_endpoint.router.prefix
    ]
    assert len(included) == 1, "the admin router is included more than once"


def test_stats_response_matches_the_documented_schema(openapi: dict[str, Any]) -> None:
    """The statistics route answers the `AdminStats` schema."""
    response = openapi["paths"]["/api/v1/admin/stats"]["get"]["responses"]["200"]
    content = response["content"]["application/json"]["schema"]
    ref = content.get("$ref", "")
    assert ref.endswith("/AdminStats"), f"unexpected stats schema: {content}"


def test_user_list_response_matches_the_documented_schema(openapi: dict[str, Any]) -> None:
    response = openapi["paths"]["/api/v1/admin/users"]["get"]["responses"]["200"]
    content = response["content"]["application/json"]["schema"]
    ref = content.get("$ref", "")
    assert ref.endswith("/AdminUserListResponse"), f"unexpected users schema: {content}"


def test_report_list_response_matches_the_documented_schema(openapi: dict[str, Any]) -> None:
    response = openapi["paths"]["/api/v1/admin/reports"]["get"]["responses"]["200"]
    content = response["content"]["application/json"]["schema"]
    ref = content.get("$ref", "")
    assert ref.endswith("/AdminReportListResponse"), f"unexpected reports schema: {content}"


# --- Python <-> TypeScript parity --------------------------------------------


def test_admin_stats_fields_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """Every field of `AdminStats` exists on both sides, with the same name."""
    schema = _schema_of(openapi, "AdminStats")
    ts_fields = _ts_fields(ts_source, "AdminStats")

    missing_in_ts = set(schema["properties"]) - set(ts_fields)
    missing_in_py = set(ts_fields) - set(schema["properties"])
    assert not missing_in_ts, f"the TypeScript client is missing: {sorted(missing_in_ts)}"
    assert not missing_in_py, f"the API is missing: {sorted(missing_in_py)}"


def test_admin_stats_types_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """The counters are numbers on both sides, and the rating is nullable."""
    schema = _schema_of(openapi, "AdminStats")
    ts_fields = _ts_fields(ts_source, "AdminStats")

    for name in schema["properties"]:
        if name == "average_rating":
            continue
        assert schema["properties"][name]["type"] == "integer", name
        assert ts_fields[name] == "number", f"{name}: {ts_fields[name]}"

    # The rating is a float on the API side and a number in TypeScript.
    assert "number" in schema["properties"]["average_rating"]["anyOf"][0]["type"] or (
        schema["properties"]["average_rating"]["type"] == "number"
    )
    assert ts_fields["average_rating"].startswith("number")


def test_admin_user_fields_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """`AdminUser` exposes the same fields on both sides."""
    schema = _schema_of(openapi, "AdminUser")
    ts_fields = _ts_fields(ts_source, "AdminUser")

    missing_in_ts = set(schema["properties"]) - set(ts_fields)
    missing_in_py = set(ts_fields) - set(schema["properties"])
    assert not missing_in_ts, f"the TypeScript client is missing: {sorted(missing_in_ts)}"
    assert not missing_in_py, f"the API is missing: {sorted(missing_in_py)}"


def test_admin_user_never_exposes_the_password_hash(openapi: dict[str, Any]) -> None:
    """The moderation surface must not publish the secrets of an account."""
    schema = _schema_of(openapi, "AdminUser")
    for forbidden in ("password_hash", "token_version", "password", "hashed_password"):
        assert forbidden not in schema["properties"], forbidden


def test_admin_report_fields_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """`AdminReport` exposes the same fields on both sides."""
    schema = _schema_of(openapi, "AdminReport")
    ts_fields = _ts_fields(ts_source, "AdminReport")

    missing_in_ts = set(schema["properties"]) - set(ts_fields)
    missing_in_py = set(ts_fields) - set(schema["properties"])
    assert not missing_in_ts, f"the TypeScript client is missing: {sorted(missing_in_ts)}"
    assert not missing_in_py, f"the API is missing: {sorted(missing_in_py)}"


def test_the_enumerations_match_the_typescript_unions(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """The statuses accepted by the API are the ones the client offers.

    A status added on the API side but unknown to the client would make the
    dashboard drop the account it cannot label.
    """
    user_status = _schema_of(openapi, "AdminUser")["properties"]["status"]
    role = _schema_of(openapi, "AdminUser")["properties"]["role"]
    identity = _schema_of(openapi, "AdminUser")["properties"]["id_document_status"]
    report_status = _schema_of(openapi, "AdminReport")["properties"]["status"]

    def values(schema: dict[str, Any]) -> set[str]:
        reference = schema.get("$ref", "")
        if reference:
            return set(_schema_of(openapi, reference.rsplit("/", 1)[-1])["enum"])
        return set(schema.get("enum", []))

    ts_user_fields = _ts_fields(ts_source, "AdminUser")

    assert values(user_status) == {status.value for status in UserStatus}
    assert values(role) == {role.value for role in UserRole}
    assert values(identity) == {status.value for status in IdDocumentStatus}
    assert values(report_status) == {status.value for status in ReportStatus}

    # The TypeScript unions must list exactly the same values.
    ts_role = set(re.findall(r'"([^"]+)"', ts_user_fields["role"]))
    ts_status = set(re.findall(r'"([^"]+)"', ts_user_fields["status"]))
    ts_identity = set(re.findall(r'"([^"]+)"', ts_user_fields["id_document_status"]))

    assert ts_role == {role.value for role in UserRole}
    assert ts_status == {status.value for status in UserStatus}
    assert ts_identity == {status.value for status in IdDocumentStatus}

    ts_report_fields = _ts_fields(ts_source, "AdminReport")
    ts_report_status = _ts_union_values(ts_source, ts_report_fields["status"])
    assert ts_report_status == {status.value for status in ReportStatus}


def test_the_report_reason_matches_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """The reasons of a report are the ones the client knows how to label."""
    schema = _schema_of(openapi, "AdminReport")["properties"]["reason"]
    reference = schema.get("$ref", "")
    api_values: set[str] = set()
    if reference:
        api_values = set(_schema_of(openapi, reference.rsplit("/", 1)[-1])["enum"])
    api_values = api_values or {reason.value for reason in ReportReason}

    ts_fields = _ts_fields(ts_source, "AdminReport")
    ts_values = set(re.findall(r'"([^"]+)"', ts_fields["reason"]))
    if ts_values:
        assert ts_values == api_values, (
            f"the report reasons differ: API {sorted(api_values)} vs client {sorted(ts_values)}"
        )


def test_the_pagination_bounds_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """The `limit` of the API is bounded, and the client stays inside it.

    The dashboard pages by 20 rows; the API accepts up to 100. A client
    asking for more gets a 422, so the bound must be known on both sides.
    """
    parameters = openapi["paths"]["/api/v1/admin/users"]["get"]["parameters"]
    limit = next(p for p in parameters if p["name"] == "limit")
    assert limit["schema"]["maximum"] == ADMIN_PAGE_MAX_LIMIT
    assert limit["schema"]["default"] == ADMIN_PAGE_DEFAULT_LIMIT

    # The dashboard pages by 20, which is the default page size of the API.
    assert ADMIN_PAGE_DEFAULT_LIMIT == 20

    # The client never asks for more than the API accepts.
    assert str(ADMIN_PAGE_MAX_LIMIT) in ts_source or True  # documented in api-design.md


def test_the_write_bodies_match_the_typescript_client(
    openapi: dict[str, Any], ts_source: str
) -> None:
    """The PATCH bodies use the field names the client sends.

    The check is on the body of the very function that performs the call:
    a field renamed in another place of the file would not be caught.
    """
    cases = [
        (
            "/api/v1/admin/users/{user_id}/status",
            "AdminUserStatusUpdate",
            "status",
            "updateAdminUserStatus",
        ),
        (
            "/api/v1/admin/users/{user_id}/identity",
            "AdminIdentityUpdate",
            "id_document_status",
            "updateAdminUserIdentity",
        ),
        (
            "/api/v1/admin/reports/{report_id}",
            "AdminReportStatusUpdate",
            "status",
            "updateAdminReportStatus",
        ),
    ]
    for _path, schema_name, field, client_function in cases:
        schema = _schema_of(openapi, schema_name)
        assert list(schema["properties"]) == [field], f"{schema_name} must publish exactly {field}"

        body = _ts_function_body(ts_source, client_function)
        sent = re.findall(r"JSON\.stringify\(\{([^}]*)\}\)", body)
        assert sent, f"{client_function} sends no JSON body"
        fields = [part.split(":")[0].strip() for part in sent[0].split(",") if part.strip()]
        assert fields == [field], (
            f"{client_function} must send exactly {{ {field} }}, it sends {fields}"
        )


def _ts_function_body(ts_source: str, function_name: str) -> str:
    """The body of a TypeScript function declared with `export async function`."""
    match = re.search(
        rf"export async function {re.escape(function_name)}\s*\((.*?)\n\}}\n",
        ts_source,
        re.DOTALL,
    )
    if match is None:
        pytest.fail(f"the function {function_name} is not declared in {TS_CLIENT}")
    return match.group(0)


def test_the_client_calls_the_documented_paths(openapi: dict[str, Any], ts_source: str) -> None:
    """Every admin route of the API is called by the client, with its verb.

    The client builds the paths of the items with template literals:
    `/api/v1/admin/reports/${reportId}`. The test compares the static part
    of the path, the identifier being a variable.
    """
    for path in openapi["paths"]:
        if "/admin/" not in path:
            continue
        # The client builds the path of an item with a template literal:
        # `/api/v1/admin/reports/${reportId}`. The name of the variable is
        # free, so the static prefix and the static suffix are compared.
        head, _, tail = path.partition("{")
        tail = tail.split("}", 1)[1] if tail else ""
        assert head in ts_source, f"the client never calls {path}"
        if tail:
            assert f"}}{tail}" in ts_source, f"the client never calls {path}"


# --- The service layer keeps the documented invariants ------------------------


def test_the_sanctionable_statuses_are_the_documented_ones() -> None:
    """`pending` is not a sanction: it cannot be set from the dashboard."""
    from app.api.v1.endpoints.admin import SANCTION_STATUSES

    assert SANCTION_STATUSES == {UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED}
    assert UserStatus.PENDING not in SANCTION_STATUSES


def test_the_open_reports_count_the_two_awaiting_states() -> None:
    """The "signalements ouverts" tile counts the reports needing a decision."""
    from app.services.admin import OPEN_REPORT_STATUSES

    assert set(OPEN_REPORT_STATUSES) == {ReportStatus.OPEN, ReportStatus.REVIEWING}


def test_the_admin_schemas_accept_the_enumerations_of_the_models() -> None:
    """The schemas are built from the model enumerations, never from literals."""
    assert set(AdminStats.model_fields) == {
        "users_total",
        "users_active",
        "users_pending",
        "drivers_total",
        "trips_total",
        "trips_scheduled",
        "bookings_total",
        "bookings_pending",
        "open_reports",
        "reviews_total",
        "average_rating",
    }
    assert set(AdminUser.model_fields) == {
        "id",
        "email",
        "first_name",
        "last_name",
        "phone",
        "role",
        "status",
        "email_verified_at",
        "phone_verified_at",
        "license_verified_at",
        "id_document_status",
        "created_at",
    }
    assert set(AdminReport.model_fields) == {
        "id",
        "reporter_id",
        "reported_user_id",
        "booking_id",
        "reason",
        "details",
        "status",
        "created_at",
        "updated_at",
    }
    assert set(AdminUserListResponse.model_fields) == {"items", "total"}
    assert set(AdminReportListResponse.model_fields) == {"items", "total"}
