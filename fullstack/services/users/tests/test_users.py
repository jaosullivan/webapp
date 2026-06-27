import pytest
from httpx import AsyncClient


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# User registration
# ---------------------------------------------------------------------------

async def test_create_user(client: AsyncClient):
    r = await client.post("/api/v1/users", json={"email": "alice@example.com", "password": "secret"})
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "alice@example.com"
    assert data["is_active"] is True
    assert "id" in data
    assert "hashed_password" not in data


async def test_create_user_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@example.com", "password": "secret"}
    await client.post("/api/v1/users", json=payload)
    r = await client.post("/api/v1/users", json=payload)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"]


async def test_create_user_invalid_email(client: AsyncClient):
    r = await client.post("/api/v1/users", json={"email": "not-an-email", "password": "secret"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Auth / login
# ---------------------------------------------------------------------------

async def _register(client: AsyncClient, email: str = "user@example.com", password: str = "pass123"):
    await client.post("/api/v1/users", json={"email": email, "password": password})


async def test_login_success(client: AsyncClient):
    await _register(client)
    r = await client.post(
        "/api/v1/auth/token",
        data={"username": "user@example.com", "password": "pass123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await _register(client)
    r = await client.post(
        "/api/v1/auth/token",
        data={"username": "user@example.com", "password": "wrongpass"},
    )
    assert r.status_code == 401


async def test_login_unknown_email(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/token",
        data={"username": "nobody@example.com", "password": "pass"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# List / get users
# ---------------------------------------------------------------------------

async def test_list_users_empty(client: AsyncClient):
    r = await client.get("/api/v1/users")
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0}


async def test_list_users(client: AsyncClient):
    for i in range(3):
        await client.post("/api/v1/users", json={"email": f"u{i}@example.com", "password": "pw"})
    r = await client.get("/api/v1/users")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


async def test_list_users_pagination(client: AsyncClient):
    for i in range(5):
        await client.post("/api/v1/users", json={"email": f"p{i}@example.com", "password": "pw"})
    r = await client.get("/api/v1/users", params={"skip": 0, "limit": 2})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2


async def test_get_user(client: AsyncClient):
    r = await client.post("/api/v1/users", json={"email": "get@example.com", "password": "pw"})
    user_id = r.json()["id"]
    r2 = await client.get(f"/api/v1/users/{user_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == user_id


async def test_get_user_not_found(client: AsyncClient):
    r = await client.get("/api/v1/users/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Toggle status
# ---------------------------------------------------------------------------

async def test_toggle_user_status(client: AsyncClient):
    r = await client.post("/api/v1/users", json={"email": "toggle@example.com", "password": "pw"})
    user_id = r.json()["id"]
    assert r.json()["is_active"] is True

    r2 = await client.patch(f"/api/v1/users/{user_id}/status")
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False

    r3 = await client.patch(f"/api/v1/users/{user_id}/status")
    assert r3.json()["is_active"] is True


async def test_toggle_status_not_found(client: AsyncClient):
    r = await client.patch("/api/v1/users/00000000-0000-0000-0000-000000000000/status")
    assert r.status_code == 404
