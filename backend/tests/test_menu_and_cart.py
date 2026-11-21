import io

import pytest
from PIL import Image

from app.models import Category


# ---------- Menu retrieval ----------
def test_menu_retrieval_success(client, item, unavailable_item, make_item):
    archived = make_item(name="Old Dish", is_archived=True)
    r = client.get("/api/v1/menu-items")
    assert r.status_code == 200
    body = r.json()
    names = {i["name"] for i in body["items"]}
    assert names == {"Paneer Tikka", "Sold Out Curry"}
    assert archived.name not in names
    assert body["total"] == 2
    tikka = next(i for i in body["items"] if i["name"] == "Paneer Tikka")
    assert tikka["price"] == "249.00"
    assert tikka["category"]["name"] == "Mains"


def test_menu_search_filter_sort(client, make_item):
    make_item(name="Veg Momos", price="169.00", is_vegetarian=True, description="dumplings")
    make_item(name="Chicken Curry", price="349.00")
    make_item(name="Lassi", price="99.00", is_vegetarian=True, available=False)

    assert [i["name"] for i in client.get("/api/v1/menu-items?search=DUMPL").json()["items"]] == ["Veg Momos"]
    veg = client.get("/api/v1/menu-items?vegetarian=true&available_only=true").json()["items"]
    assert [i["name"] for i in veg] == ["Veg Momos"]
    prices = [i["price"] for i in client.get("/api/v1/menu-items?sort=price_desc").json()["items"]]
    assert prices == ["349.00", "169.00", "99.00"]
    ranged = client.get("/api/v1/menu-items?min_price=100&max_price=200").json()["items"]
    assert [i["name"] for i in ranged] == ["Veg Momos"]
    assert client.get("/api/v1/menu-items?min_price=-5").status_code == 422


def test_search_escapes_wildcards(client, make_item):
    make_item(name="Plain Rice")
    assert client.get("/api/v1/menu-items?search=%25").json()["total"] == 0


def test_inactive_category_hidden(client, db, item, category):
    category.is_active = False
    db.commit()
    assert client.get("/api/v1/menu-items").json()["total"] == 0
    assert client.get("/api/v1/categories").json() == []
    assert client.get(f"/api/v1/menu-items/{item.id}").status_code == 404


def test_item_detail_and_404(client, item):
    assert client.get(f"/api/v1/menu-items/{item.id}").json()["name"] == "Paneer Tikka"
    r = client.get("/api/v1/menu-items/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404 and r.json()["error"]["code"] == "MENU_ITEM_NOT_FOUND"


# ---------- Admin menu management ----------
def test_admin_category_crud(client, admin_h):
    r = client.post("/api/v1/admin/categories", json={"name": "Desserts"}, headers=admin_h)
    assert r.status_code == 201
    cid = r.json()["id"]
    dup = client.post("/api/v1/admin/categories", json={"name": "desserts"}, headers=admin_h)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"
    r = client.patch(f"/api/v1/admin/categories/{cid}", json={"sort_order": 5}, headers=admin_h)
    assert r.json()["sort_order"] == 5
    assert client.delete(f"/api/v1/admin/categories/{cid}", headers=admin_h).json()["deleted"] is True


def test_cannot_delete_category_with_items(client, admin_h, item, category):
    r = client.delete(f"/api/v1/admin/categories/{category.id}", headers=admin_h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CATEGORY_NOT_EMPTY"


def test_admin_item_create_validate_update(client, admin_h, category):
    bad = client.post(
        "/api/v1/admin/menu-items", json={"category_id": str(category.id), "name": "X", "price": "-1"}, headers=admin_h
    )
    assert bad.status_code == 422
    fields = {f["field"] for f in bad.json()["error"]["details"]["fields"]}
    assert {"name", "price"} <= fields
    r = client.post(
        "/api/v1/admin/menu-items",
        json={"category_id": str(category.id), "name": "Dal Makhani", "price": "259.50", "is_vegetarian": True},
        headers=admin_h,
    )
    assert r.status_code == 201 and r.json()["price"] == "259.50"
    iid = r.json()["id"]
    r = client.patch(f"/api/v1/admin/menu-items/{iid}", json={"price": "269"}, headers=admin_h)
    assert r.json()["price"] == "269.00"
    r = client.put(f"/api/v1/admin/menu-items/{iid}/availability", json={"is_available": False}, headers=admin_h)
    assert r.json()["is_available"] is False


def test_delete_never_ordered_item_hard_deletes(client, admin_h, item):
    assert client.delete(f"/api/v1/admin/menu-items/{item.id}", headers=admin_h).json() == {
        "deleted": True,
        "archived": False,
        "deactivated": False,
    }


def test_delete_ordered_item_archives(client, admin_h, placed_order, item):
    r = client.delete(f"/api/v1/admin/menu-items/{item.id}", headers=admin_h)
    assert r.json()["archived"] is True
    assert client.get(f"/api/v1/menu-items/{item.id}").status_code == 404


def test_image_upload(client, admin_h, tmp_path):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buf, format="PNG")
    r = client.post(
        "/api/v1/admin/uploads/images", files={"file": ("a.png", buf.getvalue(), "image/png")}, headers=admin_h
    )
    assert r.status_code == 201 and r.json()["url"].startswith("/media/menu/")
    r = client.post(
        "/api/v1/admin/uploads/images", files={"file": ("a.png", b"not an image", "image/png")}, headers=admin_h
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_IMAGE"


# ---------- Cart ----------
def test_add_available_item_to_cart(client, cust_h, item, restaurant):
    r = client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 2}, headers=cust_h)
    assert r.status_code == 200
    cart = r.json()
    assert cart["item_count"] == 2
    assert cart["subtotal"] == "498.00"
    assert cart["tax_amount"] == "24.90"
    assert cart["total_pickup"] == "522.90"
    assert cart["total_delivery"] == "562.90"
    assert cart["can_checkout"] is True


def test_add_same_item_merges_quantity(client, cust_h, item, restaurant):
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 2}, headers=cust_h)
    cart = client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 3}, headers=cust_h).json()
    assert len(cart["items"]) == 1
    assert cart["items"][0]["quantity"] == 5


def test_add_unavailable_item_rejected(client, cust_h, unavailable_item, restaurant):
    r = client.post("/api/v1/cart/items", json={"menu_item_id": str(unavailable_item.id)}, headers=cust_h)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "ITEM_UNAVAILABLE"
    assert client.get("/api/v1/cart", headers=cust_h).json()["items"] == []


def test_add_item_in_inactive_category_rejected(client, db, cust_h, item, category, restaurant):
    category.is_active = False
    db.commit()
    assert client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id)}, headers=cust_h).status_code == 409


def test_add_nonexistent_item(client, cust_h, restaurant):
    r = client.post("/api/v1/cart/items", json={"menu_item_id": "00000000-0000-0000-0000-000000000000"}, headers=cust_h)
    assert r.status_code == 404


@pytest.mark.parametrize("qty", [0, -1, 1.5, "2", 51, None, True])
def test_invalid_quantities(client, cust_h, item, restaurant, qty):
    r = client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": qty}, headers=cust_h)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_QUANTITY"


def test_merged_quantity_above_max_rejected(client, cust_h, item, restaurant):
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 45}, headers=cust_h)
    r = client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id), "quantity": 10}, headers=cust_h)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_QUANTITY"
    assert client.get("/api/v1/cart", headers=cust_h).json()["items"][0]["quantity"] == 45


def test_update_remove_clear(client, cust_h, item, make_item, restaurant):
    other = make_item(name="Naan", price="49.00")
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id)}, headers=cust_h)
    client.post("/api/v1/cart/items", json={"menu_item_id": str(other.id)}, headers=cust_h)
    cart = client.patch(f"/api/v1/cart/items/{item.id}", json={"quantity": 4}, headers=cust_h).json()
    assert {i["name"]: i["quantity"] for i in cart["items"]} == {"Paneer Tikka": 4, "Naan": 1}
    assert client.patch(f"/api/v1/cart/items/{item.id}", json={"quantity": 0}, headers=cust_h).status_code == 422
    cart = client.delete(f"/api/v1/cart/items/{other.id}", headers=cust_h).json()
    assert len(cart["items"]) == 1
    assert client.delete("/api/v1/cart", headers=cust_h).json()["items"] == []


def test_cart_flags_item_that_became_unavailable(client, db, cust_h, item, restaurant):
    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id)}, headers=cust_h)
    item.is_available = False
    db.commit()
    cart = client.get("/api/v1/cart", headers=cust_h).json()
    assert cart["items"][0]["is_available"] is False
    assert cart["can_checkout"] is False and "ITEM_UNAVAILABLE" in cart["blocking_reasons"]


def test_cart_is_private(client, cust_h, other_customer, item, restaurant):
    from tests.conftest import auth_headers

    client.post("/api/v1/cart/items", json={"menu_item_id": str(item.id)}, headers=cust_h)
    assert client.get("/api/v1/cart", headers=auth_headers(other_customer)).json()["items"] == []


def test_unused_category_import():
    assert Category.__tablename__ == "categories"
