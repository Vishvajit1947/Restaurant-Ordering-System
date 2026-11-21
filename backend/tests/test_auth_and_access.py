import pytest

from tests.conftest import auth_headers


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok", "database": "ok"}


def test_register_creates_customer_and_ignores_role(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"full_name": "New Person", "email": "New@Example.com", "password": "secret123", "role": "ADMIN"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["role"] == "CUSTOMER"
    assert body["user"]["email"] == "new@example.com"
    assert "access_token" in body
    assert "access_token" in r.cookies


def test_register_duplicate_email_case_insensitive(client):
    payload = {"full_name": "A Person", "email": "dup@example.com", "password": "secret123"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    r = client.post("/api/v1/auth/register", json={**payload, "email": "DUP@example.com"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


@pytest.mark.parametrize("password", ["short1", "allletters", "12345678"])
def test_register_weak_password(client, password):
    r = client.post("/api/v1/auth/register", json={"full_name": "A B", "email": "x@example.com", "password": password})
    assert r.status_code == 422
    assert r.json()["error"]["details"]["fields"][0]["field"] == "password"


def test_login_success_and_me(client, customer):
    r = client.post("/api/v1/auth/login", json={"email": customer.email, "password": "Password1"})
    assert r.status_code == 200
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["email"] == customer.email


def test_login_wrong_password(client, customer):
    r = client.post("/api/v1/auth/login", json={"email": customer.email, "password": "Wrong1234"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_deactivated_user_blocked(client, db, customer, cust_h):
    customer.is_active = False
    db.commit()
    assert client.get("/api/v1/auth/me", headers=cust_h).status_code == 403


def test_invalid_token(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401


ADMIN_ONLY = [
    ("get", "/api/v1/admin/dashboard/stats"),
    ("get", "/api/v1/admin/menu-items"),
    ("post", "/api/v1/admin/categories"),
    ("put", "/api/v1/admin/restaurant/status"),
    ("get", "/api/v1/admin/staff"),
]
STAFF_ALLOWED = [("get", "/api/v1/admin/orders")]


@pytest.mark.parametrize("method,path", ADMIN_ONLY + STAFF_ALLOWED)
def test_anonymous_gets_401_on_admin_routes(client, method, path):
    r = getattr(client, method)(path, **({"json": {}} if method in ("post", "put") else {}))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "NOT_AUTHENTICATED"


@pytest.mark.parametrize("method,path", ADMIN_ONLY + STAFF_ALLOWED)
def test_customer_forbidden_on_admin_routes(client, cust_h, method, path):
    r = getattr(client, method)(path, headers=cust_h, **({"json": {}} if method in ("post", "put") else {}))
    assert r.status_code == 403


@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_staff_forbidden_on_admin_only_routes(client, staff_h, method, path):
    r = getattr(client, method)(path, headers=staff_h, **({"json": {}} if method in ("post", "put") else {}))
    assert r.status_code == 403


def test_staff_can_view_orders(client, staff_h, restaurant):
    assert client.get("/api/v1/admin/orders", headers=staff_h).status_code == 200


def test_staff_and_admin_cannot_use_cart(client, staff_h, admin_h):
    assert client.get("/api/v1/cart", headers=staff_h).status_code == 403
    assert client.get("/api/v1/cart", headers=admin_h).status_code == 403


def test_admin_creates_and_deactivates_staff(client, admin_h, admin):
    r = client.post(
        "/api/v1/admin/staff",
        json={"full_name": "New Staff", "email": "ns@test.dev", "password": "Staff1234"},
        headers=admin_h,
    )
    assert r.status_code == 201 and r.json()["role"] == "STAFF"
    sid = r.json()["id"]
    r = client.patch(f"/api/v1/admin/staff/{sid}", json={"is_active": False}, headers=admin_h)
    assert r.json()["is_active"] is False
    r = client.patch(f"/api/v1/admin/staff/{admin.id}", json={"is_active": False}, headers=admin_h)
    assert r.status_code == 409


def test_restaurant_public_info_and_toggle(client, admin_h, restaurant, admin):
    assert client.get("/api/v1/restaurant").json()["is_open"] is True
    r = client.put("/api/v1/admin/restaurant/status", json={"is_open": False}, headers=admin_h)
    assert r.status_code == 200 and r.json()["is_open"] is False
    assert client.get("/api/v1/restaurant").json()["is_open"] is False
    _ = auth_headers  # keep import used


def test_login_with_reserved_demo_domain(client, db):
    from app.core.security import hash_password
    from app.models import User, UserRole

    db.add(
        User(
            full_name="Demo",
            email="customer@saffronsmoke.test",
            password_hash=hash_password("Customer@123"),
            role=UserRole.CUSTOMER,
        )
    )
    db.commit()
    r = client.post("/api/v1/auth/login", json={"email": "Customer@SaffronSmoke.test", "password": "Customer@123"})
    assert r.status_code == 200, r.text
