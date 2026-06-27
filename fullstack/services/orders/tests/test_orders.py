import pytest
from httpx import AsyncClient

USER_ID = "11111111-1111-1111-1111-111111111111"


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Create order
# ---------------------------------------------------------------------------

async def test_create_order(client: AsyncClient):
    r = await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 49.99})
    assert r.status_code == 201
    data = r.json()
    assert data["user_id"] == USER_ID
    assert data["total"] == 49.99
    assert data["status"] == "pending"
    assert "id" in data
    assert "created_at" in data


async def test_create_order_missing_fields(client: AsyncClient):
    r = await client.post("/api/v1/orders", json={"user_id": USER_ID})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# List orders
# ---------------------------------------------------------------------------

async def test_list_orders_empty(client: AsyncClient):
    r = await client.get("/api/v1/orders")
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0}


async def test_list_orders(client: AsyncClient):
    for total in [10.0, 20.0, 30.0]:
        await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": total})
    r = await client.get("/api/v1/orders")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


async def test_list_orders_pagination(client: AsyncClient):
    for i in range(5):
        await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": float(i + 1)})
    r = await client.get("/api/v1/orders", params={"skip": 0, "limit": 2})
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2


# ---------------------------------------------------------------------------
# Get order
# ---------------------------------------------------------------------------

async def test_get_order(client: AsyncClient):
    r = await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 99.0})
    order_id = r.json()["id"]
    r2 = await client.get(f"/api/v1/orders/{order_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == order_id


async def test_get_order_not_found(client: AsyncClient):
    r = await client.get("/api/v1/orders/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update status
# ---------------------------------------------------------------------------

async def test_update_order_status(client: AsyncClient):
    r = await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 50.0})
    order_id = r.json()["id"]

    for status in ("confirmed", "shipped", "delivered"):
        r2 = await client.patch(f"/api/v1/orders/{order_id}/status", json={"status": status})
        assert r2.status_code == 200
        assert r2.json()["status"] == status


async def test_update_order_status_invalid(client: AsyncClient):
    r = await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 50.0})
    order_id = r.json()["id"]
    r2 = await client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "exploded"})
    assert r2.status_code == 422


async def test_update_status_not_found(client: AsyncClient):
    r = await client.patch(
        "/api/v1/orders/00000000-0000-0000-0000-000000000000/status",
        json={"status": "confirmed"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Orders by user
# ---------------------------------------------------------------------------

async def test_get_user_orders(client: AsyncClient):
    other_user = "22222222-2222-2222-2222-222222222222"
    await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 10.0})
    await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": 20.0})
    await client.post("/api/v1/orders", json={"user_id": other_user, "total": 30.0})

    r = await client.get(f"/api/v1/orders/user/{USER_ID}")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    assert all(o["user_id"] == USER_ID for o in items)


async def test_get_user_orders_empty(client: AsyncClient):
    r = await client.get(f"/api/v1/orders/user/{USER_ID}")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# Stats endpoint — TDD: these tests are written before the endpoint exists
# ---------------------------------------------------------------------------

async def test_stats_empty(client: AsyncClient):
    r = await client.get("/api/v1/orders/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["by_status"] == {
        "pending": 0,
        "confirmed": 0,
        "shipped": 0,
        "delivered": 0,
        "cancelled": 0,
    }
    assert data["total_value"] == 0.0


async def test_stats_counts_by_status(client: AsyncClient):
    statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
    for i, status in enumerate(statuses):
        r = await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": float((i + 1) * 10)})
        order_id = r.json()["id"]
        if status != "pending":
            await client.patch(f"/api/v1/orders/{order_id}/status", json={"status": status})

    r = await client.get("/api/v1/orders/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    assert data["by_status"]["pending"] == 1
    assert data["by_status"]["confirmed"] == 1
    assert data["by_status"]["shipped"] == 1
    assert data["by_status"]["delivered"] == 1
    assert data["by_status"]["cancelled"] == 1


async def test_stats_total_value(client: AsyncClient):
    for amount in [10.0, 25.50, 64.99]:
        await client.post("/api/v1/orders", json={"user_id": USER_ID, "total": amount})

    r = await client.get("/api/v1/orders/stats")
    data = r.json()
    assert abs(data["total_value"] - 100.49) < 0.01
