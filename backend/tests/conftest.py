import os

# Point the app at the test database BEFORE any app module is imported.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://restaurant:restaurant@localhost:5433/restaurant_test"
)
os.environ["ENV"] = "test"
os.environ.setdefault("MEDIA_DIR", os.path.join(os.path.dirname(__file__), ".media"))

import uuid  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category, MenuItem, RestaurantSettings, User, UserRole  # noqa: E402

TABLES = [t.name for t in reversed(Base.metadata.sorted_tables)]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_db():
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def restaurant(db):
    s = RestaurantSettings(
        id=1, name="Test Kitchen", is_open=True, currency="INR", tax_rate=Decimal("0.05"), delivery_fee=Decimal("40.00")
    )
    db.add(s)
    db.commit()
    return s


def _make_user(db, role: UserRole, email: str | None = None) -> User:
    user = User(
        full_name=f"Test {role.value.title()}",
        email=email or f"{role.value.lower()}-{uuid.uuid4().hex[:6]}@test.dev",
        password_hash=hash_password("Password1"),
        role=role,
    )
    db.add(user)
    db.commit()
    return user


def auth_headers(user: User) -> dict[str, str]:
    token, _ = create_access_token(user.id, user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def customer(db):
    return _make_user(db, UserRole.CUSTOMER)


@pytest.fixture
def other_customer(db):
    return _make_user(db, UserRole.CUSTOMER)


@pytest.fixture
def staff(db):
    return _make_user(db, UserRole.STAFF)


@pytest.fixture
def admin(db):
    return _make_user(db, UserRole.ADMIN)


@pytest.fixture
def cust_h(customer):
    return auth_headers(customer)


@pytest.fixture
def staff_h(staff):
    return auth_headers(staff)


@pytest.fixture
def admin_h(admin):
    return auth_headers(admin)


@pytest.fixture
def category(db):
    c = Category(name="Mains", slug="mains", sort_order=1)
    db.add(c)
    db.commit()
    return c


@pytest.fixture
def make_item(db, category):
    def _make(name="Paneer Tikka", price="249.00", available=True, **kw) -> MenuItem:
        item = MenuItem(category_id=category.id, name=name, price=Decimal(price), is_available=available, **kw)
        db.add(item)
        db.commit()
        return item

    return _make


@pytest.fixture
def item(make_item):
    return make_item()


@pytest.fixture
def unavailable_item(make_item):
    return make_item(name="Sold Out Curry", price="199.00", available=False)


def new_key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


GOOD_CARD = {"number": "4242 4242 4242 4242", "expiry": "12/30", "cvv": "123", "holder_name": "Test User"}
DECLINED_CARD = {**GOOD_CARD, "number": "4000 0000 0000 0002"}


@pytest.fixture
def placed_order(client, cust_h, item, restaurant):
    """A paid order in PLACED status."""
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 2}, headers=cust_h)
    order = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()}).json()
    r = client.post(
        f"/api/v1/orders/{order['id']}/payments",
        json={"method": "CARD", "card": GOOD_CARD},
        headers={**cust_h, **new_key()},
    )
    assert r.status_code == 201, r.text
    return r.json()["order"]


@pytest.fixture
def pending_order(client, cust_h, item, restaurant):
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 1}, headers=cust_h)
    r = client.post("/api/v1/orders", json={"order_type": "PICKUP"}, headers={**cust_h, **new_key()})
    assert r.status_code == 201, r.text
    return r.json()
