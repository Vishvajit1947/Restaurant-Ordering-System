import re
import uuid
from decimal import Decimal

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound
from app.models import CartItem, Category, MenuItem, OrderItem
from app.schemas.menu import (
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    DeleteResult,
    MenuItemCreateIn,
    MenuItemUpdateIn,
    MenuSort,
)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "category"


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------- Categories ----------------


def _category_counts(db: Session) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(MenuItem.category_id, func.count()).where(MenuItem.is_archived.is_(False)).group_by(MenuItem.category_id)
    ).all()
    return {cid: n for cid, n in rows}


def list_categories(db: Session, *, include_inactive: bool) -> list[CategoryOut]:
    q = select(Category).order_by(Category.sort_order, Category.name)
    if not include_inactive:
        q = q.where(Category.is_active.is_(True))
    counts = _category_counts(db)
    out = []
    for c in db.scalars(q):
        item = CategoryOut.model_validate(c)
        item.item_count = counts.get(c.id, 0)
        out.append(item)
    return out


def _get_category(db: Session, category_id: uuid.UUID) -> Category:
    cat = db.get(Category, category_id)
    if cat is None:
        raise NotFound("Category not found.", code="CATEGORY_NOT_FOUND")
    return cat


def _ensure_unique_slug(db: Session, slug: str, exclude_id: uuid.UUID | None = None) -> None:
    q = select(Category.id).where(Category.slug == slug)
    if exclude_id:
        q = q.where(Category.id != exclude_id)
    if db.scalar(q):
        raise Conflict("A category with this name already exists.", code="CATEGORY_NAME_TAKEN")


def create_category(db: Session, data: CategoryCreateIn) -> CategoryOut:
    slug = slugify(data.name)
    _ensure_unique_slug(db, slug)
    cat = Category(slug=slug, **data.model_dump())
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("A category with this name already exists.", code="CATEGORY_NAME_TAKEN") from None
    return CategoryOut.model_validate(cat)


def update_category(db: Session, category_id: uuid.UUID, data: CategoryUpdateIn) -> CategoryOut:
    cat = _get_category(db, category_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("name"):
        slug = slugify(values["name"])
        _ensure_unique_slug(db, slug, exclude_id=cat.id)
        cat.slug = slug
    for field, value in values.items():
        if value is not None:
            setattr(cat, field, value)
    db.commit()
    out = CategoryOut.model_validate(cat)
    out.item_count = _category_counts(db).get(cat.id, 0)
    return out


def delete_category(db: Session, category_id: uuid.UUID) -> DeleteResult:
    cat = _get_category(db, category_id)
    active_items = db.scalar(
        select(func.count()).where(MenuItem.category_id == cat.id, MenuItem.is_archived.is_(False))
    )
    if active_items:
        raise Conflict(
            f"This category still has {active_items} menu item(s). Move or delete them first.",
            code="CATEGORY_NOT_EMPTY",
            details={"item_count": active_items},
        )
    has_archived = db.scalar(select(exists().where(MenuItem.category_id == cat.id)))
    if has_archived:
        # Archived items keep order history intact, so the category is hidden rather than removed.
        cat.is_active = False
        db.commit()
        return DeleteResult(deactivated=True)
    db.delete(cat)
    db.commit()
    return DeleteResult(deleted=True)


# ---------------- Menu items ----------------


def list_menu_items(
    db: Session,
    *,
    public: bool,
    category_id: uuid.UUID | None = None,
    search: str | None = None,
    vegetarian: bool | None = None,
    available_only: bool = False,
    is_available: bool | None = None,
    include_archived: bool = False,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    sort: MenuSort = "name",
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[MenuItem], int]:
    q = select(MenuItem).join(Category, MenuItem.category_id == Category.id)
    if public:
        q = q.where(MenuItem.is_archived.is_(False), Category.is_active.is_(True))
    elif not include_archived:
        q = q.where(MenuItem.is_archived.is_(False))
    if category_id:
        q = q.where(MenuItem.category_id == category_id)
    if search:
        pattern = f"%{_escape_like(search.strip())}%"
        q = q.where(or_(MenuItem.name.ilike(pattern, escape="\\"), MenuItem.description.ilike(pattern, escape="\\")))
    if vegetarian is not None:
        q = q.where(MenuItem.is_vegetarian.is_(vegetarian))
    if available_only:
        q = q.where(MenuItem.is_available.is_(True))
    if is_available is not None:
        q = q.where(MenuItem.is_available.is_(is_available))
    if min_price is not None:
        q = q.where(MenuItem.price >= min_price)
    if max_price is not None:
        q = q.where(MenuItem.price <= max_price)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    order = {
        "name": (MenuItem.name.asc(),),
        "price_asc": (MenuItem.price.asc(), MenuItem.name.asc()),
        "price_desc": (MenuItem.price.desc(), MenuItem.name.asc()),
        "newest": (MenuItem.created_at.desc(), MenuItem.name.asc()),
    }[sort]
    if sort == "name" and not search:
        order = (Category.sort_order.asc(), MenuItem.name.asc())
    items = db.scalars(q.order_by(*order).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return list(items), total


def get_menu_item(db: Session, item_id: uuid.UUID, *, public: bool) -> MenuItem:
    item = db.get(MenuItem, item_id)
    if item is None or (public and (item.is_archived or not item.category.is_active)):
        raise NotFound("Menu item not found.", code="MENU_ITEM_NOT_FOUND")
    return item


def _ensure_unique_item_name(db: Session, category_id: uuid.UUID, name: str, exclude_id: uuid.UUID | None) -> None:
    q = select(MenuItem.id).where(
        MenuItem.category_id == category_id,
        func.lower(MenuItem.name) == name.lower(),
        MenuItem.is_archived.is_(False),
    )
    if exclude_id:
        q = q.where(MenuItem.id != exclude_id)
    if db.scalar(q):
        raise Conflict("An item with this name already exists in the category.", code="MENU_ITEM_NAME_TAKEN")


def create_menu_item(db: Session, data: MenuItemCreateIn) -> MenuItem:
    _get_category(db, data.category_id)
    _ensure_unique_item_name(db, data.category_id, data.name, None)
    item = MenuItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_menu_item(db: Session, item_id: uuid.UUID, data: MenuItemUpdateIn) -> MenuItem:
    item = get_menu_item(db, item_id, public=False)
    if item.is_archived:
        raise Conflict("Archived items cannot be edited.", code="MENU_ITEM_ARCHIVED")
    values = {
        k: v
        for k, v in data.model_dump(exclude_unset=True).items()
        if v is not None or k in ("description", "image_url")
    }
    if "category_id" in values:
        _get_category(db, values["category_id"])
    _ensure_unique_item_name(db, values.get("category_id", item.category_id), values.get("name", item.name), item.id)
    for field, value in values.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def set_availability(db: Session, item_id: uuid.UUID, is_available: bool) -> MenuItem:
    item = get_menu_item(db, item_id, public=False)
    if item.is_archived:
        raise Conflict("Archived items cannot be made available.", code="MENU_ITEM_ARCHIVED")
    item.is_available = is_available
    db.commit()
    db.refresh(item)
    return item


def delete_menu_item(db: Session, item_id: uuid.UUID) -> DeleteResult:
    item = get_menu_item(db, item_id, public=False)
    was_ordered = db.scalar(select(exists().where(OrderItem.menu_item_id == item.id)))
    if was_ordered:
        # Keep the row so historical orders stay valid; hide it everywhere else.
        item.is_archived = True
        item.is_available = False
        db.execute(delete(CartItem).where(CartItem.menu_item_id == item.id))
        db.commit()
        return DeleteResult(archived=True)
    db.delete(item)
    db.commit()
    return DeleteResult(deleted=True)
