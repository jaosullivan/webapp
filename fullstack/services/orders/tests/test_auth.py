"""Tests that every orders endpoint requires a valid JWT."""
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.main import app as fastapi_app
from app.db.session import get_db

USER_ID = "11111111-1111-1111-1111-111111111111"
FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid"


@pytest_asyncio.fixture
async def unauthed_client(engine):
    """Client with DB wired but no auth override — auth is enforced normally."""
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()


async def test_list_orders_no_token(unauthed_client: AsyncClient):
    r = await unauthed_client.get("/api/v1/orders")
    assert r.status_code == 401


async def test_list_orders_bad_token(unauthed_client: AsyncClient):
    r = await unauthed_client.get("/api/v1/orders",
                                   headers={"Authorization": f"Bearer {FAKE_JWT}"})
    assert r.status_code == 401


async def test_create_order_no_token(unauthed_client: AsyncClient):
    r = await unauthed_client.post("/api/v1/orders",
                                    json={"user_id": USER_ID, "total": 10.0})
    assert r.status_code == 401


async def test_update_status_no_token(unauthed_client: AsyncClient):
    r = await unauthed_client.patch("/api/v1/orders/some-id/status",
                                     json={"status": "confirmed"})
    assert r.status_code == 401


async def test_stats_no_token(unauthed_client: AsyncClient):
    r = await unauthed_client.get("/api/v1/orders/stats")
    assert r.status_code == 401


async def test_health_no_auth_required(unauthed_client: AsyncClient):
    """Health check must be publicly accessible (no auth)."""
    r = await unauthed_client.get("/health")
    assert r.status_code in (200, 503)
    assert r.json()["db"] == "ok"


async def test_blocklisted_token_returns_401(unauthed_client: AsyncClient):
    """A valid JWT whose token key is in the Redis blocklist must be rejected."""
    from unittest.mock import AsyncMock, patch
    from jose import jwt as jose_jwt

    token = jose_jwt.encode({"sub": USER_ID}, "changeme-in-production", algorithm="HS256")
    mock_redis = AsyncMock()
    mock_redis.get.return_value = b"1"

    with patch("shared.auth.get_redis_pool", return_value=mock_redis):
        r = await unauthed_client.get(
            "/api/v1/orders",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 401
    assert r.json()["detail"] == "Token has been revoked"
