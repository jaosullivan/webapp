"""Seed the database with realistic demo data via the service APIs."""
import httpx
import random

USERS_URL = "http://localhost:8001/api/v1"
ORDERS_URL = "http://localhost:8002/api/v1"
PAYMENTS_URL = "http://localhost:8003/api/v1"

SEED_USERS = [
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


def seed():
    client = httpx.Client(timeout=10.0)

    # Create users
    user_ids = []
    print("Creating users...")
    for email, password in SEED_USERS:
        r = client.post(f"{USERS_URL}/users", json={"email": email, "password": password})
        if r.status_code == 201:
            user_ids.append(r.json()["id"])
            print(f"  + {email}")
        elif r.status_code == 400:
            # Already exists — fetch ID via list
            r2 = client.get(f"{USERS_URL}/users", params={"limit": 100})
            match = next((u for u in r2.json()["items"] if u["email"] == email), None)
            if match:
                user_ids.append(match["id"])
                print(f"  ~ {email} (already exists)")
        else:
            print(f"  ! {email} failed: {r.status_code} {r.text}")

    if not user_ids:
        print("No users available — aborting.")
        return

    # Create orders and payments
    print(f"\nCreating orders and payments for {len(user_ids)} users...")
    order_count = 0
    payment_count = 0

    for user_id in user_ids:
        num_orders = random.randint(2, 5)
        for _ in range(num_orders):
            total = round(random.choice(ORDER_TOTALS) + random.uniform(-5, 20), 2)
            r = client.post(f"{ORDERS_URL}/orders", json={"user_id": user_id, "total": total})
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
                client.patch(f"{ORDERS_URL}/orders/{order_id}/status", json={"status": status})

            # Create a payment for non-cancelled orders
            if final_status != "cancelled":
                pr = client.post(f"{PAYMENTS_URL}/payments", json={"order_id": order_id, "amount": total})
                if pr.status_code != 201:
                    continue
                payment_id = pr.json()["id"]
                payment_count += 1

                # Set payment status based on order status
                pay_status = PAYMENT_STATUS_MAP.get(final_status, "pending")
                if isinstance(pay_status, list):
                    pay_status = random.choice(pay_status)
                if pay_status == "completed":
                    client.post(f"{PAYMENTS_URL}/payments/{payment_id}/process")
                elif pay_status == "failed":
                    client.patch(f"{PAYMENTS_URL}/payments/{payment_id}/status", json={"status": "failed"})

    print(f"\nDone! Created:")
    print(f"  {len(user_ids)} users")
    print(f"  {order_count} orders")
    print(f"  {payment_count} payments")

    # Print summary stats
    r = client.get(f"{USERS_URL}/users", params={"limit": 1})
    r2 = client.get(f"{ORDERS_URL}/orders", params={"limit": 1})
    r3 = client.get(f"{PAYMENTS_URL}/payments", params={"limit": 200})
    revenue = sum(p["amount"] for p in r3.json()["items"] if p["status"] == "completed")
    print(f"\nDashboard will show:")
    print(f"  Total users:    {r.json()['total']}")
    print(f"  Total orders:   {r2.json()['total']}")
    print(f"  Total payments: {r3.json()['total']}")
    print(f"  Revenue:        ${revenue:,.2f}")


if __name__ == "__main__":
    seed()
