"""Idempotent seed script: python -m scripts.seed

Creates demo accounts, restaurant settings, categories, menu items (with bundled photos) and a few
historical orders so the dashboard has data. Safe to run more than once.
"""

import random
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    ActorRole,
    Category,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    OrderType,
    Payment,
    PaymentMethod,
    PaymentStatus,
    RestaurantSettings,
    User,
    UserRole,
)
from app.services.menu_service import slugify
from app.services.order_service import _next_order_number
from app.services.pricing import compute_totals, line_total

ASSETS = Path(__file__).resolve().parent.parent / "seed_assets"

USERS = [
    ("Aarav Admin", "admin@saffronsmoke.test", "Admin@123", UserRole.ADMIN, "+919800000001"),
    ("Sana Staff", "staff@saffronsmoke.test", "Staff@123", UserRole.STAFF, "+919800000002"),
    ("Riya Customer", "customer@saffronsmoke.test", "Customer@123", UserRole.CUSTOMER, "+919800000003"),
]

# (category, description, sort_order, [ (name, description, price, image, spice, prep, available) ])
# Every dish is vegetarian: no meat, poultry, fish, seafood, egg or gelatin.
MENU = [
    (
        "Starters",
        "Small plates to open the table",
        0,
        [
            (
                "Samosa Duo",
                "Crisp pastry parcels of spiced potato and peas, with mint and tamarind chutneys.",
                "129",
                "samosa",
                1,
                10,
                True,
            ),
            (
                "Paneer Tikka",
                "Charred cottage cheese, peppers and onion marinated in hung curd and Kashmiri chilli.",
                "249",
                "paneer-tikka",
                2,
                18,
                True,
            ),
            (
                "Steamed Veg Momos",
                "Hand-pleated dumplings filled with cabbage, carrot and ginger. Served with fiery red chutney.",
                "169",
                "veg-momos",
                1,
                15,
                True,
            ),
            (
                "Papdi Chaat",
                "Crisp wafers, chickpeas, yoghurt, sev and pomegranate with sweet and green chutneys.",
                "149",
                "chaat",
                1,
                8,
                True,
            ),
            (
                "Classic French Fries",
                "Golden, crisp potato fries with sea salt and tomato ketchup.",
                "129",
                "french-fries",
                0,
                10,
                True,
            ),
            (
                "Masala Fries",
                "Crisp fries tossed in chaat masala, chilli and fresh coriander.",
                "149",
                "masala-fries",
                1,
                10,
                True,
            ),
        ],
    ),
    (
        "Curries & Biryani",
        "Slow-cooked classics from across India",
        10,
        [
            (
                "Butter Paneer Masala",
                "Soft paneer simmered in a velvety tomato, butter and fenugreek gravy.",
                "319",
                "butter-paneer",
                1,
                20,
                True,
            ),
            (
                "Paneer Makhani Rice Bowl",
                "Paneer makhani over fragrant jeera rice — a complete one-bowl meal.",
                "299",
                "paneer-rice-bowl",
                1,
                18,
                True,
            ),
            (
                "Kadai Paneer",
                "Paneer and peppers tossed in a freshly pounded kadai masala.",
                "289",
                "kadai-paneer",
                2,
                20,
                True,
            ),
            (
                "Veg Dum Biryani",
                "Basmati layered with seasonal vegetables, saffron and fried onions. Served with raita.",
                "299",
                "veg-biryani",
                2,
                28,
                True,
            ),
            (
                "North Indian Veg Thali",
                "Paneer curry, dal, seasonal sabzi, tandoori roti and pickle on one plate.",
                "329",
                "veg-thali",
                1,
                20,
                True,
            ),
            (
                "Kerala Banana Leaf Meal",
                "Rice, sambar, poriyal, thoran, papadum and payasam served on a banana leaf.",
                "349",
                "banana-leaf",
                1,
                20,
                True,
            ),
            (
                "Mumbai Pav Bhaji",
                "Buttery mashed vegetable bhaji with toasted pav, onions and lime.",
                "189",
                "pav-bhaji",
                2,
                15,
                True,
            ),
        ],
    ),
    (
        "South Indian",
        "Dosas, idlis and vadas with sambar",
        15,
        [
            (
                "Masala Dosa",
                "Crisp rice-and-lentil crepe with spiced potato, sambar and chutneys.",
                "179",
                "masala-dosa",
                1,
                15,
                True,
            ),
            (
                "Mysore Masala Dosa",
                "Dosa spread with fiery red chutney and filled with spiced potato.",
                "199",
                "mysore-dosa",
                2,
                16,
                False,
            ),
            ("Steamed Idli", "Soft steamed rice cakes with coconut chutney and sambar.", "119", "idli", 0, 10, True),
            (
                "Idli Vada Combo",
                "Two idlis and a crisp medu vada with sambar and chutneys.",
                "149",
                "idli-vada",
                1,
                12,
                True,
            ),
        ],
    ),
    (
        "Global Favourites",
        "Comfort food with an Indian twist",
        20,
        [
            (
                "Tandoori Paneer Pizza",
                "Wood-fired base, tandoori paneer, onions, peppers and eggless mint mayo drizzle.",
                "399",
                "tandoori-pizza",
                1,
                22,
                True,
            ),
            (
                "Classic Margherita",
                "San Marzano tomato, vegetarian mozzarella and basil on a blistered crust.",
                "349",
                "margherita",
                0,
                20,
                True,
            ),
            (
                "Veggie Burger",
                "Spiced vegetable patty, avocado, lettuce and tomato in a toasted bun.",
                "229",
                "veggie-burger",
                1,
                15,
                True,
            ),
            (
                "Crispy Paneer Burger",
                "Crumbed paneer patty, slaw and eggless peri-peri mayo in a soft bun.",
                "259",
                "paneer-burger",
                2,
                16,
                True,
            ),
            (
                "Veg Hakka Noodles",
                "Wok-tossed noodles with cabbage, carrot, peppers and spring onion.",
                "219",
                "hakka-noodles",
                1,
                15,
                True,
            ),
            (
                "Schezwan Noodles",
                "Noodles tossed in a fiery house Schezwan sauce with crunchy vegetables.",
                "239",
                "schezwan-noodles",
                3,
                15,
                True,
            ),
            (
                "Grilled Cheese Club Sandwich",
                "Triple-decker toast with cheese, vegetables and green chutney.",
                "199",
                "sandwich",
                1,
                12,
                True,
            ),
        ],
    ),
    (
        "Salads & Bowls",
        "Fresh, bright and filling",
        30,
        [
            (
                "Rainbow Buddha Bowl",
                "Chickpeas, avocado, roasted sweet potato, greens and tahini dressing.",
                "279",
                "buddha-bowl",
                0,
                12,
                True,
            ),
            (
                "Greek Garden Salad",
                "Mixed leaves, vegetarian feta, olives, cucumber and berries with lemon vinaigrette.",
                "249",
                "greek-salad",
                0,
                10,
                True,
            ),
        ],
    ),
    (
        "Desserts",
        "Something sweet to finish",
        40,
        [
            (
                "Eggless Raspberry Cream Cake",
                "Layers of eggless sponge, fresh cream and raspberry compote.",
                "199",
                "raspberry-cake",
                0,
                5,
                True,
            ),
            (
                "Eggless Chocolate Brownie",
                "Dense, eggless dark-chocolate brownie, best with a scoop of eggless ice cream.",
                "169",
                "brownie",
                0,
                5,
                True,
            ),
            (
                "Gajar Halwa",
                "Slow-cooked carrot pudding with ghee, khoa and toasted nuts.",
                "149",
                "gajar-halwa",
                0,
                5,
                True,
            ),
            (
                "Oreo Chocolate Sundae",
                "Eggless vanilla ice cream, chocolate sauce, whipped cream and crushed Oreos.",
                "219",
                "sundae",
                0,
                6,
                True,
            ),
            (
                "Strawberry Shrikhand Cups",
                "Chilled hung-curd shrikhand topped with macerated strawberries.",
                "179",
                "shrikhand-cups",
                0,
                5,
                True,
            ),
            (
                "Eggless Glazed Donut Stack",
                "Three eggless ring donuts with chocolate glaze and sprinkles.",
                "149",
                "donuts",
                0,
                5,
                False,
            ),
        ],
    ),
    (
        "Beverages",
        "Coolers, shakes and brews",
        50,
        [
            (
                "Strawberry Lime Cooler",
                "Muddled strawberries, lime and mint topped with soda.",
                "129",
                "lime-cooler",
                0,
                5,
                True,
            ),
            (
                "Fresh Lime Soda",
                "Freshly squeezed lime, mint and chilled soda, sweet or salted.",
                "89",
                "lime-soda",
                0,
                4,
                True,
            ),
            (
                "Fresh Alphonso Mango Juice",
                "Thick, chilled Alphonso mango pulp juice.",
                "139",
                "mango-juice",
                0,
                5,
                True,
            ),
            (
                "Strawberry Milkshake",
                "Fresh strawberries blended with milk and eggless vanilla ice cream.",
                "159",
                "milkshake",
                0,
                5,
                True,
            ),
            (
                "Vanilla Milkshake",
                "Thick, creamy milkshake made with eggless vanilla ice cream.",
                "149",
                "vanilla-milkshake",
                0,
                5,
                True,
            ),
            (
                "Oreo Cold Coffee",
                "Chilled coffee blended with milk, crushed Oreos and chocolate sauce.",
                "179",
                "oreo-cold-coffee",
                0,
                6,
                True,
            ),
            (
                "Assam Lemon Tea",
                "Brisk Assam tea brewed with lemon and a touch of honey.",
                "89",
                "lemon-tea",
                0,
                5,
                True,
            ),
        ],
    ),
]

# Photos of retired dishes: removed from the media directory if an older install copied them there.
RETIRED_ASSETS = [
    "seekh",
    "fried-chicken",
    "chicken-curry",
    "fish-curry",
    "prawn-curry",
    "biryani",
    "smash-burger",
    "chicken-burger",
    "prawn-spaghetti",
    "salmon-bowl",
    "panna-cotta",
    "momos",
    "hero",
]


def copy_assets() -> None:
    target = Path(settings.MEDIA_DIR) / "seed"
    target.mkdir(parents=True, exist_ok=True)
    for f in ASSETS.glob("*.jpg"):
        dest = target / f.name
        if not dest.exists():
            shutil.copyfile(f, dest)
    for name in RETIRED_ASSETS:
        (target / f"{name}.jpg").unlink(missing_ok=True)


def seed_users(db) -> dict[str, User]:
    users = {}
    for name, email, password, role, phone in USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(full_name=name, email=email, password_hash=hash_password(password), role=role, phone=phone)
            db.add(user)
        users[role.value] = user
    db.flush()
    return users


def seed_settings(db, admin: User) -> None:
    if db.get(RestaurantSettings, 1):
        return
    db.add(
        RestaurantSettings(
            id=1,
            name="Saffron & Smoke",
            tagline="100% vegetarian kitchen · Fire, spice and everything nice",
            description=(
                "Saffron & Smoke is a 100% vegetarian neighbourhood kitchen cooking regional Indian classics "
                "and global comfort food over charcoal and slow flames. Everything is made fresh to order — "
                "from our hand-pleated momos to vegetable dum biryani sealed and cooked for hours."
            ),
            address="12, 80 Feet Road, Koramangala 4th Block, Bengaluru 560034",
            phone="+91 80 4567 8910",
            email="hello@saffronsmoke.test",
            hero_image_url="/media/seed/hero-veg.jpg",
            is_open=True,
            currency="INR",
            tax_rate=Decimal("0.05"),
            delivery_fee=Decimal("40.00"),
            pending_payment_ttl_minutes=15,
            opening_hours=[
                {"day": "Monday – Thursday", "hours": "11:30 – 23:00"},
                {"day": "Friday – Saturday", "hours": "11:30 – 23:59"},
                {"day": "Sunday", "hours": "12:00 – 23:00"},
            ],
            updated_by=admin.id,
        )
    )
    db.flush()


def seed_menu(db) -> None:
    if db.scalar(select(func.count()).select_from(Category)):
        return
    for cat_name, cat_desc, sort_order, items in MENU:
        cat = Category(name=cat_name, slug=slugify(cat_name), description=cat_desc, sort_order=sort_order)
        db.add(cat)
        db.flush()
        for name, desc, price, image, spice, prep, available in items:
            db.add(
                MenuItem(
                    category_id=cat.id,
                    name=name,
                    description=desc,
                    price=Decimal(price),
                    image_url=f"/media/seed/{image}.jpg",
                    is_vegetarian=True,
                    spice_level=spice,
                    prep_time_minutes=prep,
                    is_available=available,
                )
            )
    db.flush()


def _history(order: Order, frm, to, actor: ActorRole, actor_id, at: datetime, note=None) -> None:
    order.status_history.append(
        OrderStatusHistory(
            from_status=frm, to_status=to, actor_role=actor.value, changed_by=actor_id, note=note, created_at=at
        )
    )


def seed_orders(db, users: dict[str, User]) -> None:
    if db.scalar(select(func.count()).select_from(Order)):
        return
    rng = random.Random(42)
    customer, staff = users["CUSTOMER"], users["STAFF"]
    s = db.get(RestaurantSettings, 1)
    items = list(db.scalars(select(MenuItem).where(MenuItem.is_available.is_(True))).unique())
    now = datetime.now(UTC)
    flow = [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]

    plans = [(d, OrderStatus.DELIVERED) for d in range(6, 0, -1) for _ in range(rng.randint(1, 3))]
    plans += [(0, OrderStatus.DELIVERED), (0, OrderStatus.READY), (0, OrderStatus.PREPARING), (0, OrderStatus.PLACED)]

    for days_ago, final in plans:
        created = now - timedelta(days=days_ago, hours=rng.randint(0, 3), minutes=rng.randint(5, 50))
        picks = rng.sample(items, rng.randint(1, 3))
        lines = [(m, rng.randint(1, 2)) for m in picks]
        otype = rng.choice([OrderType.PICKUP, OrderType.DELIVERY])
        totals = compute_totals([(m.price, q) for m, q in lines], s.tax_rate, s.delivery_fee, otype)
        order = Order(
            order_number=_next_order_number(db),
            user_id=customer.id,
            status=final,
            payment_status=PaymentStatus.SUCCESS,
            order_type=otype,
            delivery_address="Flat 4B, Lakeview Apartments, HSR Layout, Bengaluru"
            if otype == OrderType.DELIVERY
            else None,
            currency=s.currency,
            subtotal=totals.subtotal,
            tax_amount=totals.tax_amount,
            delivery_fee=totals.delivery_fee,
            total_amount=totals.total,
            idempotency_key=uuid.uuid4(),
            request_hash="seed",
            payment_expires_at=created + timedelta(minutes=15),
            placed_at=created + timedelta(minutes=1),
            created_at=created,
            updated_at=created,
        )
        for m, q in lines:
            order.items.append(
                OrderItem(
                    menu_item_id=m.id,
                    item_name=m.name,
                    unit_price=m.price,
                    quantity=q,
                    line_total=line_total(m.price, q),
                )
            )
        order.payments.append(
            Payment(
                attempt_number=1,
                method=PaymentMethod.CARD,
                status=PaymentStatus.SUCCESS,
                amount=totals.total,
                currency=s.currency,
                card_last4="4242",
                provider_reference=f"SIM-SEED{rng.randint(100000, 999999)}",
                idempotency_key=uuid.uuid4(),
                created_at=created + timedelta(minutes=1),
                completed_at=created + timedelta(minutes=1),
            )
        )
        _history(order, None, OrderStatus.PENDING_PAYMENT, ActorRole.CUSTOMER, customer.id, created)
        at = created + timedelta(minutes=1)
        _history(
            order, OrderStatus.PENDING_PAYMENT, OrderStatus.PLACED, ActorRole.SYSTEM, None, at, "Payment succeeded"
        )
        prev = OrderStatus.PLACED
        for step in flow[1 : flow.index(final) + 1]:
            at += timedelta(minutes=rng.randint(4, 12))
            _history(order, prev, step, ActorRole.STAFF, staff.id, at)
            prev = step
        db.add(order)
    db.flush()


def main() -> None:
    copy_assets()
    with SessionLocal() as db:
        users = seed_users(db)
        seed_settings(db, users["ADMIN"])
        seed_menu(db)
        seed_orders(db, users)
        db.commit()
    print("Seed complete.")
    print("  admin@saffronsmoke.test / Admin@123")
    print("  staff@saffronsmoke.test / Staff@123")
    print("  customer@saffronsmoke.test / Customer@123")


if __name__ == "__main__":
    main()
