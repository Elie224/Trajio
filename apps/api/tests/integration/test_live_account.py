"""DELETE /me, rate limits, token confusion and forgot-password on a live server."""

from __future__ import annotations

import statistics
import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx

from .conftest import BASE, PASSWORD, new_client, next_ip, pytestmark, register_and_login  # noqa: F401

FRONT = "http://localhost:3000"


def _publish_trip(c: httpx.Client, seats: int = 3) -> dict:
    v = c.post(
        "/vehicles",
        json={
            "brand": "Test",
            "model": "Car",
            "plate": f"T-{uuid.uuid4().hex[:6]}",
            "seats_total": 4,
        },
    )
    assert v.status_code == 201, v.text
    t = c.post(
        "/trips",
        json={
            "vehicle_id": v.json()["id"],
            "origin_label": "Paris Gare de Lyon",
            "destination_label": "Paris Bastille",
            "origin_lat": 48.844,
            "origin_lng": 2.374,
            "destination_lat": 48.853,
            "destination_lng": 2.369,
            "departure_time": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            "seats_total": seats,
        },
    )
    assert t.status_code == 201, t.text
    return t.json()


def test_delete_me_full_effects(db):
    driver, driver_email = register_and_login("drv")
    other, _ = register_and_login("oth")
    passenger, _ = register_and_login("pax")
    own_trip = _publish_trip(driver)
    other_trip = _publish_trip(other)
    # someone books the driver's trip; driver books another driver's trip
    b1 = passenger.post("/bookings", json={"trip_id": own_trip["id"], "requested_seats": 1})
    assert b1.status_code == 201, b1.text
    b2 = driver.post("/bookings", json={"trip_id": other_trip["id"], "requested_seats": 2})
    assert b2.status_code == 201, b2.text
    seats_before = db.execute(
        "select seats_available from trips where id=%s", (other_trip["id"],)
    ).fetchone()[0]

    me = driver.get("/auth/me").json()
    old_access = driver.cookies.get("trajio_access_token")
    old_refresh = driver.cookies.get("trajio_refresh_token")

    preview = driver.get("/auth/me/deletion-preview")
    assert preview.json() == {"trips": 1, "bookings": 1}

    t0 = datetime.now(UTC)
    r = driver.request("DELETE", "/auth/me", json={"password": PASSWORD})
    assert r.status_code == 200, r.text

    u = db.execute(
        "select email, first_name, last_name, phone, deleted_at, status, password_changed_at "
        "from users where id=%s",
        (me["id"],),
    ).fetchone()
    assert u[0].endswith("@anonyme.invalid") and u[0] != driver_email
    assert (u[1], u[2], u[3]) == ("Utilisateur", "Supprimé", None)
    assert u[4] is not None and u[4] >= t0 - timedelta(seconds=1)
    assert str(u[5]).upper().endswith("SUSPENDED")
    live_tokens = db.execute(
        "select count(*) from refresh_tokens where user_id=%s and revoked_at is null", (me["id"],)
    ).fetchone()[0]
    assert live_tokens == 0
    st = db.execute(
        "select status, cancelled_at from trips where id=%s", (own_trip["id"],)
    ).fetchone()
    assert str(st[0]).upper().endswith("CANCELLED") and st[1] is not None
    bs = db.execute("select status from bookings where id=%s", (b1.json()["id"],)).fetchone()[0]
    assert str(bs).upper().endswith("CANCELLED")
    bs2 = db.execute("select status from bookings where id=%s", (b2.json()["id"],)).fetchone()[0]
    assert str(bs2).upper().endswith("CANCELLED")
    seats_after = db.execute(
        "select seats_available from trips where id=%s", (other_trip["id"],)
    ).fetchone()[0]
    assert seats_after == seats_before + 2

    replay = new_client()
    assert replay.get("/auth/me", cookies={"trajio_access_token": old_access}).status_code == 401
    assert (
        replay.post("/auth/refresh", cookies={"trajio_refresh_token": old_refresh}).status_code
        == 401
    )
    ex = replay.get("/auth/me/export", cookies={"trajio_access_token": old_access})
    assert ex.status_code == 401 and driver_email not in ex.text
    lg = new_client().post(
        "/auth/login",
        json={"email": driver_email, "password": PASSWORD},
        headers={"X-Forwarded-For": next_ip()},
    )
    assert lg.status_code == 401


def _hammer(c: httpx.Client, method: str, path: str, **kw) -> list[httpx.Response]:
    return [c.request(method, path, headers={"X-Forwarded-For": next_ip()}, **kw) for _ in range(6)]


def _check_429(responses: list[httpx.Response], window: int) -> None:
    assert [r.status_code for r in responses[:5]].count(429) == 0, [
        r.status_code for r in responses
    ]
    last = responses[5]
    assert last.status_code == 429, last.text
    ra = int(last.headers["Retry-After"])
    assert 0 < ra <= window and ra >= window - 120, ra


def test_rate_limit_delete_me_per_account():
    c, _ = register_and_login("rl")
    _check_429(_hammer(c, "DELETE", "/auth/me", json={"password": "wrong-password-xx"}), 3600)


def test_rate_limit_export_per_account():
    c, _ = register_and_login("rl")
    _check_429(_hammer(c, "GET", "/auth/me/export"), 3600)


def test_rate_limit_preview_per_account():
    c, _ = register_and_login("rl")
    _check_429(_hammer(c, "GET", "/auth/me/deletion-preview"), 3600)


def test_login_429_exposes_retry_after_to_front():
    c = new_client()
    email = f"rl-{uuid.uuid4().hex[:8]}@example.com"
    rs = [
        c.post(
            "/auth/login",
            json={"email": email, "password": "wrong-password-xx"},
            headers={"Origin": FRONT, "X-Forwarded-For": next_ip()},
        )
        for _ in range(6)
    ]
    last = rs[-1]
    assert last.status_code == 429, [r.status_code for r in rs]
    assert 0 < int(last.headers["Retry-After"]) <= 900
    exposed = last.headers.get("access-control-expose-headers", "").lower()
    assert "retry-after" in exposed, dict(last.headers)


def _forgot(email: str) -> httpx.Response:
    return new_client().post(
        "/auth/forgot-password", json={"email": email}, headers={"X-Forwarded-For": next_ip()}
    )


def test_token_confusion_and_reuse():
    c, email = register_and_login("tok")
    access = c.cookies.get("trajio_access_token")
    r = new_client().post(
        "/auth/reset-password", json={"token": access, "new_password": "Another-Dummy-456!"}
    )
    assert r.status_code == 400, r.text
    fp = _forgot(email)
    reset = fp.json()["reset_token"]  # dev mode only
    assert (
        new_client().get("/auth/me", headers={"Authorization": f"Bearer {reset}"}).status_code
        == 401
    )
    ok = new_client().post(
        "/auth/reset-password", json={"token": reset, "new_password": "Another-Dummy-456!"}
    )
    assert ok.status_code == 200, ok.text
    again = new_client().post(
        "/auth/reset-password", json={"token": reset, "new_password": "Third-Dummy-789!!"}
    )
    assert again.status_code == 400, again.text
    # old session must be dead after reset
    assert new_client().get("/auth/me", cookies={"trajio_access_token": access}).status_code == 401


def test_forgot_password_indistinguishable():
    existing = [register_and_login("fp")[1] for _ in range(25)]
    unknown = [f"nobody-{uuid.uuid4().hex[:10]}@example.com" for _ in range(25)]
    t_ex, t_un = [], []
    for e, u in zip(existing, unknown, strict=True):
        for target, bucket in ((e, t_ex), (u, t_un)):
            s = time.perf_counter()
            r = _forgot(target)
            bucket.append(time.perf_counter() - s)
            assert r.status_code == 200
            body = r.json()
            body.pop("reset_token", None)  # dev-only field, checked separately
            assert body == {
                "message": "Si ce compte existe, un lien de réinitialisation a été envoyé."
            } or (set(body) <= {"message", "reset_token"})
    diff_ms = (statistics.median(t_ex) - statistics.median(t_un)) * 1000
    print(f"forgot-password median existing-unknown = {diff_ms:.2f} ms")
    assert abs(diff_ms) < 20
