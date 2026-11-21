import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.models import Order, Payment
from tests.conftest import DECLINED_CARD, GOOD_CARD, auth_headers, new_key


def add(client, h, item, qty=1):
    return client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": qty}, headers=h)


def count_orders(db):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(Order))


# ---------- Checkout ----------
def test_empty_cart_checkout(client, cust_h, restaurant):
    r = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "CART_EMPTY"


def test_checkout_creates_pending_order_with_server_totals(client, cust_h, item, restaurant, db):
    add(client, cust_h, item, 2)
    r = client.post(
        "/api/v1/orders",
        json={"order_type": "DELIVERY", "delivery_address": "221B Baker Street, Bengaluru"},
        headers={**cust_h, **new_key()},
    )
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["status"] == "PENDING_PAYMENT" and o["payment_status"] == "PENDING"
    assert o["order_number"].startswith("ORD-")
    assert (o["subtotal"], o["tax_amount"], o["delivery_fee"], o["total_amount"]) == (
        "498.00",
        "24.90",
        "40.00",
        "562.90",
    )
    assert o["items"][0] == {
        "menu_item_id": str(item.id),
        "item_name": "Paneer Tikka",
        "unit_price": "249.00",
        "quantity": 2,
        "line_total": "498.00",
    }
    assert o["status_history"][0]["to_status"] == "PENDING_PAYMENT"
    assert o["allowed_actions"] == ["PAY", "CANCEL"]
    assert client.get("/api/v1/cart", headers=cust_h).json()["items"] == []


def test_client_prices_rejected(client, cust_h, item, restaurant):
    add(client, cust_h, item)
    r = client.post(
        "/api/v1/orders",
        json={"order_type": "PICKUP", "total_amount": "1.00", "items": [{"menu_item_id": str(item.id), "price": "1"}]},
        headers={**cust_h, **new_key()},
    )
    assert r.status_code == 422


def test_price_snapshot_survives_menu_price_change(client, cust_h, item, restaurant, admin_h):
    add(client, cust_h, item)
    order = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()}).json()
    client.patch(f"/api/v1/admin/menu-items/{item.id}", json={"price": "999"}, headers=admin_h)
    again = client.get(f"/api/v1/orders/{order['id']}", headers=cust_h).json()
    assert again["items"][0]["unit_price"] == "249.00"
    assert again["total_amount"] == order["total_amount"]


def test_delivery_requires_address(client, cust_h, item, restaurant):
    add(client, cust_h, item)
    r = client.post("/api/v1/orders", json={"order_type": "DELIVERY"}, headers={**cust_h, **new_key()})
    assert r.status_code == 422


def test_missing_idempotency_key(client, cust_h, item, restaurant):
    add(client, cust_h, item)
    r = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers=cust_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_item_became_unavailable_blocks_checkout(client, db, cust_h, item, restaurant):
    add(client, cust_h, item)
    item.is_available = False
    db.commit()
    r = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "ITEM_UNAVAILABLE"
    assert r.json()["error"]["details"]["menu_item_ids"] == [str(item.id)]
    assert count_orders(db) == 0


def test_closed_restaurant_blocks_checkout(client, db, cust_h, item, restaurant):
    add(client, cust_h, item)
    restaurant.is_open = False
    db.commit()
    r = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()})
    assert r.status_code == 409 and r.json()["error"]["code"] == "RESTAURANT_CLOSED"


def test_duplicate_submission_returns_same_order(client, db, cust_h, item, restaurant):
    add(client, cust_h, item)
    key = new_key()
    first = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **key})
    second = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **key})
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert count_orders(db) == 1


def test_idempotency_key_reused_with_different_body(client, cust_h, item, restaurant):
    add(client, cust_h, item)
    key = new_key()
    client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **key})
    r = client.post(
        "/api/v1/orders", json={"order_type": "PICKUP", "customer_notes": "extra spicy"}, headers={**cust_h, **key}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


def test_concurrent_duplicate_submission(client, db, cust_h, item, restaurant):
    add(client, cust_h, item)
    key = new_key()

    def submit(_):
        return client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **key})

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(submit, range(5)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert count_orders(db) == 1


def test_order_numbers_unique(client, cust_h, item, restaurant):
    numbers = set()
    for _ in range(3):
        add(client, cust_h, item)
        numbers.add(
            client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()}).json()[
                "order_number"
            ]
        )
    assert len(numbers) == 3


def test_customer_cannot_see_others_orders(client, pending_order, other_customer):
    r = client.get(f"/api/v1/orders/{pending_order['id']}", headers=auth_headers(other_customer))
    assert r.status_code == 404


def test_order_history_lists_own_orders(client, cust_h, pending_order):
    page = client.get("/api/v1/orders", headers=cust_h).json()
    assert page["total"] == 1 and page["items"][0]["id"] == pending_order["id"]


# ---------- Payments ----------
def pay(client, h, order_id, payload, key=None):
    return client.post(f"/api/v1/orders/{order_id}/payments", json=payload, headers={**h, **(key or new_key())})


def test_success_places_order(client, cust_h, pending_order, staff_h):
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 201
    body = r.json()
    assert body["payment"]["status"] == "SUCCESS"
    assert body["payment"]["amount"] == pending_order["total_amount"]
    assert body["payment"]["card_last4"] == "4242"
    assert body["order"]["status"] == "PLACED" and body["order"]["payment_status"] == "SUCCESS"
    assert body["order"]["placed_at"] is not None
    assert [h["to_status"] for h in body["order"]["status_history"]] == ["PENDING_PAYMENT", "PLACED"]
    queue = client.get("/api/v1/admin/orders", headers=staff_h).json()
    assert [o["id"] for o in queue["items"]] == [pending_order["id"]]


def test_failed_payment_keeps_pending(client, cust_h, pending_order, staff_h):
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": DECLINED_CARD})
    assert r.status_code == 201
    assert r.json()["payment"]["status"] == "FAILED"
    assert "declined" in r.json()["payment"]["failure_reason"].lower()
    assert r.json()["order"]["status"] == "PENDING_PAYMENT"
    assert r.json()["order"]["payment_status"] == "FAILED"
    # Unpaid orders are not shown in the staff queue.
    assert client.get("/api/v1/admin/orders", headers=staff_h).json()["total"] == 0


def test_simulate_failure_flag_and_upi(client, cust_h, pending_order):
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD, "simulate": "FAILURE"})
    assert r.json()["payment"]["status"] == "FAILED"
    r = pay(client, cust_h, pending_order["id"], {"method": "UPI", "upi_id": "fail@sim"})
    assert r.json()["payment"]["status"] == "FAILED"
    r = pay(client, cust_h, pending_order["id"], {"method": "UPI", "upi_id": "riya@okbank"})
    assert r.json()["payment"]["status"] == "SUCCESS"


def test_retry_after_failure_single_order(client, db, cust_h, pending_order):
    for _ in range(3):
        assert (
            pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": DECLINED_CARD}).json()["payment"][
                "status"
            ]
            == "FAILED"
        )
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.json()["payment"]["attempt_number"] == 4
    assert r.json()["order"]["status"] == "PLACED"
    assert count_orders(db) == 1
    assert [p["status"] for p in r.json()["order"]["payments"]] == ["FAILED", "FAILED", "FAILED", "SUCCESS"]


def test_pay_twice_conflict(client, cust_h, pending_order):
    pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ORDER_ALREADY_PAID"


def test_payment_idempotent_replay(client, db, cust_h, pending_order):
    key = new_key()
    a = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD}, key)
    b = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD}, key)
    assert a.status_code == 201 and b.status_code == 200
    assert a.json()["payment"]["id"] == b.json()["payment"]["id"]
    assert db.scalar(select(func.count()).select_from(Payment)) == 1


def test_concurrent_payments_only_one_success(client, db, cust_h, pending_order):
    def attempt(_):
        return pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(attempt, range(4)))
    assert sorted(r.status_code for r in results) == [201, 409, 409, 409]
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Payment).where(Payment.status == "SUCCESS")) == 1


def test_invalid_card_is_validation_error_not_attempt(client, db, cust_h, pending_order):
    r = pay(
        client, cust_h, pending_order["id"], {"method": "CARD", "card": {**GOOD_CARD, "number": "4242424242424241"}}
    )
    assert r.status_code == 422
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": {**GOOD_CARD, "expiry": "01/20"}})
    assert r.status_code == 422
    assert db.scalar(select(func.count()).select_from(Payment)) == 0


def test_client_amount_rejected(client, cust_h, pending_order):
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD, "amount": "1.00"})
    assert r.status_code == 422


def test_expired_order_cannot_be_paid(client, db, cust_h, pending_order):
    order = db.get(Order, uuid.UUID(pending_order["id"]))
    order.payment_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ORDER_EXPIRED"
    assert client.get(f"/api/v1/orders/{pending_order['id']}", headers=cust_h).json()["status"] == "CANCELLED"


def test_payment_rechecks_availability_and_open_status(client, db, cust_h, pending_order, item, restaurant):
    item.is_available = False
    db.commit()
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ITEM_UNAVAILABLE"
    item.is_available = True
    restaurant.is_open = False
    db.commit()
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "RESTAURANT_CLOSED"


def test_customer_cancel_and_restore_to_cart(client, cust_h, pending_order):
    r = client.post(f"/api/v1/orders/{pending_order['id']}/cancel", json={"restore_to_cart": True}, headers=cust_h)
    assert r.status_code == 200
    assert r.json()["order"]["status"] == "CANCELLED"
    assert r.json()["restored"] == ["Paneer Tikka"]
    assert client.get("/api/v1/cart", headers=cust_h).json()["item_count"] == 1
    r = pay(client, cust_h, pending_order["id"], {"method": "CARD", "card": GOOD_CARD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ORDER_NOT_PAYABLE"


def test_customer_cannot_cancel_placed_order(client, cust_h, placed_order):
    r = client.post(f"/api/v1/orders/{placed_order['id']}/cancel", json={}, headers=cust_h)
    assert r.status_code == 409


# ---------- Staff / admin order management ----------
def status(client, h, oid, to, note=None):
    return client.post(f"/api/v1/admin/orders/{oid}/status", json={"to_status": to, "note": note}, headers=h)


def test_full_kitchen_flow_with_history(client, staff_h, cust_h, placed_order):
    oid = placed_order["id"]
    detail = client.get(f"/api/v1/admin/orders/{oid}", headers=staff_h).json()
    assert detail["allowed_transitions"] == ["PREPARING"]
    assert detail["customer"]["full_name"] == "Test Customer"
    for to in ("PREPARING", "READY", "DELIVERED"):
        r = status(client, staff_h, oid, to)
        assert r.status_code == 200 and r.json()["status"] == to
    history = client.get(f"/api/v1/orders/{oid}", headers=cust_h).json()["status_history"]
    assert [h["to_status"] for h in history] == ["PENDING_PAYMENT", "PLACED", "PREPARING", "READY", "DELIVERED"]
    assert [h["actor_role"] for h in history] == ["CUSTOMER", "SYSTEM", "STAFF", "STAFF", "STAFF"]


def test_invalid_transition_409(client, staff_h, placed_order):
    r = status(client, staff_h, placed_order["id"], "DELIVERED")
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "INVALID_STATUS_TRANSITION"
    assert err["details"] == {"from": "PLACED", "to": "DELIVERED", "allowed": ["PREPARING", "CANCELLED"]}


def test_cannot_go_backwards_or_leave_terminal(client, staff_h, placed_order):
    oid = placed_order["id"]
    status(client, staff_h, oid, "PREPARING")
    assert status(client, staff_h, oid, "PLACED").status_code == 409
    status(client, staff_h, oid, "READY")
    status(client, staff_h, oid, "DELIVERED")
    assert status(client, staff_h, oid, "PREPARING").status_code == 409


def test_cannot_set_placed_manually(client, admin_h, pending_order):
    r = status(client, admin_h, pending_order["id"], "PLACED")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"


def test_staff_cannot_cancel_paid_order(client, staff_h, placed_order):
    assert status(client, staff_h, placed_order["id"], "CANCELLED").status_code == 403
    r = client.post(f"/api/v1/admin/orders/{placed_order['id']}/cancel", json={"reason": "No stock"}, headers=staff_h)
    assert r.status_code == 403


def test_admin_cancel_refunds_payment(client, admin_h, placed_order):
    r = client.post(
        f"/api/v1/admin/orders/{placed_order['id']}/cancel", json={"reason": "Kitchen issue"}, headers=admin_h
    )
    assert r.status_code == 200
    o = r.json()
    assert o["status"] == "CANCELLED" and o["payment_status"] == "REFUNDED"
    assert o["payments"][0]["status"] == "REFUNDED" and o["payments"][0]["refunded_at"]
    assert o["cancelled_reason"] == "Kitchen issue"


def test_concurrent_status_updates_one_wins(client, staff_h, placed_order):
    def move(_):
        return status(client, staff_h, placed_order["id"], "PREPARING")

    with ThreadPoolExecutor(max_workers=3) as pool:
        codes = sorted(r.status_code for r in pool.map(move, range(3)))
    assert codes == [200, 409, 409]


def test_admin_order_filters(client, staff_h, placed_order):
    assert client.get("/api/v1/admin/orders?status=PREPARING", headers=staff_h).json()["total"] == 0
    assert client.get("/api/v1/admin/orders?status=PLACED", headers=staff_h).json()["total"] == 1
    num = placed_order["order_number"]
    assert client.get(f"/api/v1/admin/orders?search={num}", headers=staff_h).json()["total"] == 1


def test_dashboard_stats(client, admin_h, placed_order):
    s = client.get("/api/v1/admin/dashboard/stats", headers=admin_h).json()
    assert s["orders_today"] == 1
    assert s["revenue_today"] == placed_order["total_amount"]
    assert s["active_by_status"]["PLACED"] == 1
    assert s["top_items_7d"][0]["name"] == "Paneer Tikka" and s["top_items_7d"][0]["quantity"] == 2
    assert len(s["revenue_7d"]) == 7
