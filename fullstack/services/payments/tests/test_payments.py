import pytest
from httpx import AsyncClient

ORDER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code in (200, 503)
    data = r.json()
    assert "status" in data
    assert data["db"] == "ok"


# ---------------------------------------------------------------------------
# Create payment
# ---------------------------------------------------------------------------

async def test_create_payment(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 99.99})
    assert r.status_code == 201
    data = r.json()
    assert data["order_id"] == ORDER_ID
    assert data["amount"] == 99.99
    assert data["status"] == "pending"
    assert data["provider_ref"] is None
    assert "id" in data


async def test_create_payment_missing_fields(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# List payments
# ---------------------------------------------------------------------------

async def test_list_payments_empty(client: AsyncClient):
    r = await client.get("/api/v1/payments")
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0}


async def test_list_payments(client: AsyncClient):
    for amount in [10.0, 20.0, 30.0]:
        await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": amount})
    r = await client.get("/api/v1/payments")
    data = r.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


async def test_list_payments_pagination(client: AsyncClient):
    for i in range(5):
        await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": float(i + 1)})
    r = await client.get("/api/v1/payments", params={"skip": 0, "limit": 2})
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2


# ---------------------------------------------------------------------------
# Get payment
# ---------------------------------------------------------------------------

async def test_get_payment(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 50.0})
    payment_id = r.json()["id"]
    r2 = await client.get(f"/api/v1/payments/{payment_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == payment_id


async def test_get_payment_not_found(client: AsyncClient):
    r = await client.get("/api/v1/payments/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Process payment
# ---------------------------------------------------------------------------

async def test_process_payment(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 75.0})
    payment_id = r.json()["id"]

    r2 = await client.post(f"/api/v1/payments/{payment_id}/process")
    assert r2.status_code == 200
    data = r2.json()
    assert data["status"] == "completed"
    assert data["provider_ref"] is not None


async def test_process_payment_not_found(client: AsyncClient):
    r = await client.post("/api/v1/payments/00000000-0000-0000-0000-000000000000/process")
    assert r.status_code == 404


async def test_process_payment_idempotent(client: AsyncClient):
    """Processing an already-completed payment keeps it completed."""
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 25.0})
    payment_id = r.json()["id"]

    r2 = await client.post(f"/api/v1/payments/{payment_id}/process")
    first_ref = r2.json()["provider_ref"]

    r3 = await client.post(f"/api/v1/payments/{payment_id}/process")
    assert r3.status_code == 200
    assert r3.json()["status"] == "completed"
    assert r3.json()["provider_ref"] == first_ref


# ---------------------------------------------------------------------------
# Update status
# ---------------------------------------------------------------------------

async def test_update_payment_status_to_failed(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 40.0})
    payment_id = r.json()["id"]

    r2 = await client.patch(f"/api/v1/payments/{payment_id}/status", json={"status": "failed"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "failed"


async def test_update_payment_status_to_refunded(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 60.0})
    payment_id = r.json()["id"]
    await client.post(f"/api/v1/payments/{payment_id}/process")

    r2 = await client.patch(f"/api/v1/payments/{payment_id}/status", json={"status": "refunded"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "refunded"


async def test_update_payment_status_invalid(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 10.0})
    payment_id = r.json()["id"]
    r2 = await client.patch(f"/api/v1/payments/{payment_id}/status", json={"status": "reversed"})
    assert r2.status_code == 422


async def test_update_payment_status_not_found(client: AsyncClient):
    r = await client.patch(
        "/api/v1/payments/00000000-0000-0000-0000-000000000000/status",
        json={"status": "failed"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Revenue calculation (integration)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stats endpoint — TDD: these tests are written before the endpoint exists
# ---------------------------------------------------------------------------

async def test_payment_stats_empty(client: AsyncClient):
    r = await client.get("/api/v1/payments/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["by_status"] == {
        "pending": 0,
        "completed": 0,
        "failed": 0,
        "refunded": 0,
    }
    assert data["revenue"] == 0.0


async def test_payment_stats_revenue_only_counts_completed(client: AsyncClient):
    # Create three payments in different states
    pending = (await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 50.0})).json()
    completed = (await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 99.99})).json()
    failed = (await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 30.0})).json()

    await client.post(f"/api/v1/payments/{completed['id']}/process")
    await client.patch(f"/api/v1/payments/{failed['id']}/status", json={"status": "failed"})

    r = await client.get("/api/v1/payments/stats")
    data = r.json()
    assert data["total"] == 3
    assert data["by_status"]["pending"] == 1
    assert data["by_status"]["completed"] == 1
    assert data["by_status"]["failed"] == 1
    assert abs(data["revenue"] - 99.99) < 0.01


async def test_payment_stats_revenue_excludes_refunded(client: AsyncClient):
    p1 = (await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 100.0})).json()
    p2 = (await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": 200.0})).json()
    await client.post(f"/api/v1/payments/{p1['id']}/process")
    await client.post(f"/api/v1/payments/{p2['id']}/process")
    await client.patch(f"/api/v1/payments/{p2['id']}/status", json={"status": "refunded"})

    r = await client.get("/api/v1/payments/stats")
    data = r.json()
    assert data["by_status"]["completed"] == 1
    assert data["by_status"]["refunded"] == 1
    assert abs(data["revenue"] - 100.0) < 0.01


# ---------------------------------------------------------------------------

async def test_completed_payments_have_provider_ref(client: AsyncClient):
    """All processed payments must carry a provider reference."""
    ids = []
    for amount in [10.0, 20.0, 30.0]:
        r = await client.post("/api/v1/payments", json={"order_id": ORDER_ID, "amount": amount})
        ids.append(r.json()["id"])

    for pid in ids:
        await client.post(f"/api/v1/payments/{pid}/process")

    r = await client.get("/api/v1/payments")
    for payment in r.json()["items"]:
        if payment["status"] == "completed":
            assert payment["provider_ref"] is not None
