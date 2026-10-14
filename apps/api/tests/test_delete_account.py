"""DELETE /me requires a password body."""


async def test_delete_me_requires_auth(client) -> None:
    response = await client.request("DELETE", "/api/v1/auth/me", json={"password": "x"})
    assert response.status_code == 401


async def test_delete_me_rejects_missing_password(client) -> None:
    response = await client.request("DELETE", "/api/v1/auth/me", json={})
    assert response.status_code in (401, 422)
