"""Convert existing databases to the fully vegetarian menu (data only, no schema change).

Runs exactly once per database, so dishes an admin later deletes are never recreated.
Fresh databases have no categories yet and get the vegetarian menu from scripts/seed.py instead.

Order history is preserved: a retired dish that appears on any order is archived (order_items has
ON DELETE RESTRICT and keeps its own name/price snapshot). Dishes never ordered are deleted.
Only rows still pointing at a bundled seed photo are retired, so admin-created dishes are untouched.

Revision ID: b7e41c90a2f6
Revises: d558ca61a348
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7e41c90a2f6"
down_revision: str | Sequence[str] | None = "d558ca61a348"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RETIRED = {
    "Chicken Seekh Skewers": "seekh",
    "Crispy Masala Fried Chicken": "fried-chicken",
    "Home-style Chicken Curry": "chicken-curry",
    "Goan Fish Curry": "fish-curry",
    "Prawn Coconut Curry": "prawn-curry",
    "Hyderabadi Chicken Biryani": "biryani",
    "Double Smash Burger": "smash-burger",
    "Crispy Chicken Burger": "chicken-burger",
    "Spicy Prawn Spaghetti": "prawn-spaghetti",
    "Grilled Salmon Power Bowl": "salmon-bowl",
    "Strawberry Panna Cotta": "panna-cotta",  # traditionally set with gelatin
}

# old name -> (new name, old seed description, new description)
RENAMED = {
    "Raspberry Cream Cake": (
        "Eggless Raspberry Cream Cake",
        "Layers of sponge, fresh cream and raspberry compote.",
        "Layers of eggless sponge, fresh cream and raspberry compote.",
    ),
    "Chocolate Fudge Brownie": (
        "Eggless Chocolate Brownie",
        "Dense dark-chocolate brownie, best with a scoop of ice cream.",
        "Dense, eggless dark-chocolate brownie, best with a scoop of eggless ice cream.",
    ),
    "Glazed Donut Stack": (
        "Eggless Glazed Donut Stack",
        "Three ring donuts with chocolate glaze and sprinkles.",
        "Three eggless ring donuts with chocolate glaze and sprinkles.",
    ),
}

# Applied only while the description is still the original seed text, so admin edits survive.
DESCRIPTIONS = {
    "Tandoori Paneer Pizza": (
        "Wood-fired base, tandoori paneer, onions, peppers and mint mayo drizzle.",
        "Wood-fired base, tandoori paneer, onions, peppers and eggless mint mayo drizzle.",
    ),
    "Classic Margherita": (
        "San Marzano tomato, fior di latte and basil on a blistered crust.",
        "San Marzano tomato, vegetarian mozzarella and basil on a blistered crust.",
    ),
    "Greek Garden Salad": (
        "Mixed leaves, feta, olives, cucumber and berries with lemon vinaigrette.",
        "Mixed leaves, vegetarian feta, olives, cucumber and berries with lemon vinaigrette.",
    ),
    "Oreo Chocolate Sundae": (
        "Vanilla ice cream, chocolate sauce, whipped cream and crushed Oreos.",
        "Eggless vanilla ice cream, chocolate sauce, whipped cream and crushed Oreos.",
    ),
    "Strawberry Milkshake": (
        "Fresh strawberries blended with milk and vanilla ice cream.",
        "Fresh strawberries blended with milk and eggless vanilla ice cream.",
    ),
}

# category slug, name, description, price, image, spice, prep, available
ADDED = [
    (
        "starters",
        "Classic French Fries",
        "Golden, crisp potato fries with sea salt and tomato ketchup.",
        "129",
        "french-fries",
        0,
        10,
        True,
    ),
    (
        "starters",
        "Masala Fries",
        "Crisp fries tossed in chaat masala, chilli and fresh coriander.",
        "149",
        "masala-fries",
        1,
        10,
        True,
    ),
    (
        "curries-biryani",
        "Veg Dum Biryani",
        "Basmati layered with seasonal vegetables, saffron and fried onions. Served with raita.",
        "299",
        "veg-biryani",
        2,
        28,
        True,
    ),
    (
        "curries-biryani",
        "North Indian Veg Thali",
        "Paneer curry, dal, seasonal sabzi, tandoori roti and pickle on one plate.",
        "329",
        "veg-thali",
        1,
        20,
        True,
    ),
    (
        "south-indian",
        "Masala Dosa",
        "Crisp rice-and-lentil crepe with spiced potato, sambar and chutneys.",
        "179",
        "masala-dosa",
        1,
        15,
        True,
    ),
    (
        "south-indian",
        "Mysore Masala Dosa",
        "Dosa spread with fiery red chutney and filled with spiced potato.",
        "199",
        "mysore-dosa",
        2,
        16,
        False,
    ),
    (
        "south-indian",
        "Steamed Idli",
        "Soft steamed rice cakes with coconut chutney and sambar.",
        "119",
        "idli",
        0,
        10,
        True,
    ),
    (
        "south-indian",
        "Idli Vada Combo",
        "Two idlis and a crisp medu vada with sambar and chutneys.",
        "149",
        "idli-vada",
        1,
        12,
        True,
    ),
    (
        "global-favourites",
        "Veggie Burger",
        "Spiced vegetable patty, avocado, lettuce and tomato in a toasted bun.",
        "229",
        "veggie-burger",
        1,
        15,
        True,
    ),
    (
        "global-favourites",
        "Crispy Paneer Burger",
        "Crumbed paneer patty, slaw and eggless peri-peri mayo in a soft bun.",
        "259",
        "paneer-burger",
        2,
        16,
        True,
    ),
    (
        "global-favourites",
        "Veg Hakka Noodles",
        "Wok-tossed noodles with cabbage, carrot, peppers and spring onion.",
        "219",
        "hakka-noodles",
        1,
        15,
        True,
    ),
    (
        "global-favourites",
        "Schezwan Noodles",
        "Noodles tossed in a fiery house Schezwan sauce with crunchy vegetables.",
        "239",
        "schezwan-noodles",
        3,
        15,
        True,
    ),
    (
        "desserts",
        "Strawberry Shrikhand Cups",
        "Chilled hung-curd shrikhand topped with macerated strawberries.",
        "179",
        "shrikhand-cups",
        0,
        5,
        True,
    ),
    (
        "beverages",
        "Vanilla Milkshake",
        "Thick, creamy milkshake made with eggless vanilla ice cream.",
        "149",
        "vanilla-milkshake",
        0,
        5,
        True,
    ),
    (
        "beverages",
        "Oreo Cold Coffee",
        "Chilled coffee blended with milk, crushed Oreos and chocolate sauce.",
        "179",
        "oreo-cold-coffee",
        0,
        6,
        True,
    ),
    (
        "beverages",
        "Fresh Lime Soda",
        "Freshly squeezed lime, mint and chilled soda, sweet or salted.",
        "89",
        "lime-soda",
        0,
        4,
        True,
    ),
]

OLD_TAGLINE = "Modern Indian kitchen · Fire, spice and everything nice"
NEW_TAGLINE = "100% vegetarian kitchen · Fire, spice and everything nice"
OLD_DESCRIPTION = (
    "Saffron & Smoke is a neighbourhood kitchen cooking regional Indian classics and global comfort food "
    "over charcoal and slow flames. Everything is made fresh to order — from our hand-pleated momos to "
    "dum biryani sealed and cooked for hours."
)
NEW_DESCRIPTION = (
    "Saffron & Smoke is a 100% vegetarian neighbourhood kitchen cooking regional Indian classics and global "
    "comfort food over charcoal and slow flames. Everything is made fresh to order — from our hand-pleated "
    "momos to vegetable dum biryani sealed and cooked for hours."
)


def upgrade() -> None:
    conn = op.get_bind()
    if not conn.scalar(sa.text("SELECT count(*) FROM categories")):
        return  # fresh database: scripts/seed.py creates the vegetarian menu

    for name, image in RETIRED.items():
        rows = conn.execute(
            sa.text("SELECT id FROM menu_items WHERE name = :name AND image_url = :url AND is_archived = false"),
            {"name": name, "url": f"/media/seed/{image}.jpg"},
        ).scalars()
        for item_id in list(rows):
            conn.execute(sa.text("DELETE FROM cart_items WHERE menu_item_id = :id"), {"id": item_id})
            ordered = conn.scalar(
                sa.text("SELECT EXISTS (SELECT 1 FROM order_items WHERE menu_item_id = :id)"), {"id": item_id}
            )
            if ordered:
                conn.execute(
                    sa.text(
                        "UPDATE menu_items SET is_archived = true, is_available = false, is_vegetarian = false, "
                        "image_url = NULL, updated_at = now() WHERE id = :id"
                    ),
                    {"id": item_id},
                )
            else:
                conn.execute(sa.text("DELETE FROM menu_items WHERE id = :id"), {"id": item_id})

    for old, (new, old_desc, new_desc) in RENAMED.items():
        conn.execute(
            sa.text(
                "UPDATE menu_items SET name = CAST(:new AS varchar), updated_at = now(), "
                "description = CASE WHEN description = :old_desc THEN CAST(:new_desc AS varchar) ELSE description END "
                "WHERE name = :old AND is_archived = false"
            ),
            {"old": old, "new": new, "old_desc": old_desc, "new_desc": new_desc},
        )
    for name, (old_desc, new_desc) in DESCRIPTIONS.items():
        conn.execute(
            sa.text(
                "UPDATE menu_items SET description = :new_desc, updated_at = now() "
                "WHERE name = :name AND description = :old_desc AND is_archived = false"
            ),
            {"name": name, "old_desc": old_desc, "new_desc": new_desc},
        )
    conn.execute(
        sa.text(
            "UPDATE menu_items SET image_url = '/media/seed/veg-momos.jpg' WHERE image_url = '/media/seed/momos.jpg'"
        )
    )

    conn.execute(
        sa.text(
            "INSERT INTO categories (id, name, slug, description, sort_order, is_active) "
            "VALUES (gen_random_uuid(), 'South Indian', 'south-indian', 'Dosas, idlis and vadas with sambar', 15, true) "
            "ON CONFLICT (slug) DO NOTHING"
        )
    )
    for slug, name, desc, price, image, spice, prep, available in ADDED:
        conn.execute(
            sa.text(
                "INSERT INTO menu_items (id, category_id, name, description, price, image_url, is_vegetarian, "
                "spice_level, prep_time_minutes, is_available, is_archived) "
                "SELECT gen_random_uuid(), c.id, CAST(:name AS varchar), CAST(:desc AS varchar), CAST(:price AS numeric), "
                "CAST(:url AS varchar), true, CAST(:spice AS smallint), CAST(:prep AS smallint), "
                "CAST(:available AS boolean), false FROM categories c WHERE c.slug = :slug AND NOT EXISTS ("
                "SELECT 1 FROM menu_items m WHERE lower(m.name) = lower(CAST(:name AS varchar)) AND m.is_archived = false)"
            ),
            {
                "slug": slug,
                "name": name,
                "desc": desc,
                "price": price,
                "url": f"/media/seed/{image}.jpg",
                "spice": spice,
                "prep": prep,
                "available": available,
            },
        )

    conn.execute(
        sa.text(
            "UPDATE restaurant_settings SET "
            "hero_image_url = CASE WHEN hero_image_url = '/media/seed/hero.jpg' THEN '/media/seed/hero-veg.jpg' "
            "ELSE hero_image_url END, "
            "tagline = CASE WHEN tagline = :old_tag THEN CAST(:new_tag AS varchar) ELSE tagline END, "
            "description = CASE WHEN description = :old_desc THEN CAST(:new_desc AS text) ELSE description END"
        ),
        {"old_tag": OLD_TAGLINE, "new_tag": NEW_TAGLINE, "old_desc": OLD_DESCRIPTION, "new_desc": NEW_DESCRIPTION},
    )


def downgrade() -> None:
    # Data-only migration: retired dishes are intentionally not restored.
    pass
