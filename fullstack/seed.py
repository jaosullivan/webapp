"""Seed the database with realistic demo data via the service APIs."""
import httpx
import random

USERS_URL = "http://localhost:8001/api/v1"
ORDERS_URL = "http://localhost:8002/api/v1"
PAYMENTS_URL = "http://localhost:8003/api/v1"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

SEED_USERS = [
    # First user — must match INITIAL_ADMIN_EMAIL so it gets is_admin=True
    (ADMIN_EMAIL, ADMIN_PASSWORD),
    ("alice@example.com", "password123"),
    ("bob@example.com", "password123"),
    ("carol@example.com", "password123"),
    ("david@example.com", "password123"),
    ("eve@example.com", "password123"),
    ("frank@example.com", "password123"),
    ("grace@example.com", "password123"),
    ("henry@example.com", "password123"),
    ("iris@example.com", "password123"),
    ("jack@example.com", "password123"),
]

ORDER_TOTALS = [12.99, 24.50, 49.99, 89.00, 149.99, 199.50, 299.00, 34.95, 64.00, 119.99]

ORDER_STATUS_FLOW = [
    ("pending",),
    ("confirmed",),
    ("shipped",),
    ("delivered",),
    ("cancelled",),
    ("confirmed", "shipped"),
    ("confirmed", "shipped", "delivered"),
    ("pending", "confirmed"),
]

PAYMENT_STATUS_MAP = {
    "delivered": "completed",
    "shipped": "completed",
    "confirmed": random.choice(["completed", "pending"]),
    "pending": "pending",
    "cancelled": "failed",
}


def _get_admin_token(client: httpx.Client) -> str:
    r = client.post(
        f"{USERS_URL}/auth/token",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def seed():
    client = httpx.Client(timeout=10.0)

    # Register all users — POST /users is the public registration endpoint
    user_ids: dict[str, str] = {}  # email -> id
    print("Registering users...")
    for email, password in SEED_USERS:
        r = client.post(f"{USERS_URL}/users", json={"email": email, "password": password})
        if r.status_code == 201:
            user_ids[email] = r.json()["id"]
            print(f"  + {email}")
        elif r.status_code == 400:
            print(f"  ~ {email} (already exists)")
        else:
            print(f"  ! {email} failed: {r.status_code} {r.text}")

    # Authenticate as admin — required for user listing and all order/payment endpoints
    print("\nAuthenticating as admin...")
    try:
        token = _get_admin_token(client)
    except Exception as e:
        print(f"  ! Login failed: {e}")
        return
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Resolve IDs for any user that already existed (not in user_ids yet)
    missing = [e for e, _ in SEED_USERS if e not in user_ids]
    if missing:
        r = client.get(f"{USERS_URL}/users", params={"limit": 100}, headers=auth_headers)
        if r.status_code == 200:
            for u in r.json()["items"]:
                if u["email"] in missing:
                    user_ids[u["email"]] = u["id"]
                    print(f"  ~ resolved ID for {u['email']}")

    ordered_ids = [user_ids[e] for e, _ in SEED_USERS if e in user_ids]
    if not ordered_ids:
        print("No users available — aborting.")
        return

    # Create orders and payments using admin token
    print(f"\nCreating orders and payments for {len(ordered_ids)} users...")
    order_count = 0
    payment_count = 0

    for user_id in ordered_ids:
        num_orders = random.randint(2, 5)
        for _ in range(num_orders):
            total = round(random.choice(ORDER_TOTALS) + random.uniform(-5, 20), 2)
            r = client.post(
                f"{ORDERS_URL}/orders",
                json={"user_id": user_id, "total": total},
                headers=auth_headers,
            )
            if r.status_code != 201:
                print(f"  ! order failed: {r.status_code}")
                continue

            order = r.json()
            order_id = order["id"]
            order_count += 1

            # Advance order through a random status flow
            status_flow = random.choice(ORDER_STATUS_FLOW)
            final_status = status_flow[-1]
            for status in status_flow:
                client.patch(
                    f"{ORDERS_URL}/orders/{order_id}/status",
                    json={"status": status},
                    headers=auth_headers,
                )

            # Create a payment for non-cancelled orders
            if final_status != "cancelled":
                pr = client.post(
                    f"{PAYMENTS_URL}/payments",
                    json={"order_id": order_id, "amount": total},
                    headers=auth_headers,
                )
                if pr.status_code != 201:
                    continue
                payment_id = pr.json()["id"]
                payment_count += 1

                pay_status = PAYMENT_STATUS_MAP.get(final_status, "pending")
                if isinstance(pay_status, list):
                    pay_status = random.choice(pay_status)
                if pay_status == "completed":
                    client.post(f"{PAYMENTS_URL}/payments/{payment_id}/process", headers=auth_headers)
                elif pay_status == "failed":
                    client.patch(
                        f"{PAYMENTS_URL}/payments/{payment_id}/status",
                        json={"status": "failed"},
                        headers=auth_headers,
                    )

    print(f"\nDone! Created:")
    print(f"  {len(ordered_ids)} users")
    print(f"  {order_count} orders")
    print(f"  {payment_count} payments")

    # Print summary stats
    r = client.get(f"{USERS_URL}/users", params={"limit": 1}, headers=auth_headers)
    r2 = client.get(f"{ORDERS_URL}/orders", params={"limit": 1}, headers=auth_headers)
    r3 = client.get(f"{PAYMENTS_URL}/payments", params={"limit": 200}, headers=auth_headers)
    revenue = sum(p["amount"] for p in r3.json()["items"] if p["status"] == "completed")
    print(f"\nDashboard will show:")
    print(f"  Total users:    {r.json()['total']}")
    print(f"  Total orders:   {r2.json()['total']}")
    print(f"  Total payments: {r3.json()['total']}")
    print(f"  Revenue:        ${revenue:,.2f}")


if __name__ == "__main__":
    seed()
