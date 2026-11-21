import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, Unprocessable
from app.models import CartItem, MenuItem, OrderType, User
from app.schemas.cart import CartLineOut, CartOut
from app.services import restaurant_service
from app.services.pricing import compute_totals, line_total

MAX_QTY = 50
MAX_LINES = 30


def _lines(db: Session, user_id: uuid.UUID) -> list[CartItem]:
    return list(db.scalars(select(CartItem).where(CartItem.user_id == user_id).order_by(CartItem.created_at)).unique())


def build_cart(db: Session, user: User) -> CartOut:
    settings = restaurant_service.get_settings(db)
    lines = _lines(db, user.id)
    out_lines: list[CartLineOut] = []
    priced: list[tuple[Decimal, int]] = []
    any_unavailable = False
    for line in lines:
        item = line.menu_item
        available = item.is_orderable
        any_unavailable |= not available
        priced.append((item.price, line.quantity))
        out_lines.append(
            CartLineOut(
                menu_item_id=item.id,
                name=item.name,
                image_url=item.image_url,
                is_vegetarian=item.is_vegetarian,
                unit_price=item.price,
                quantity=line.quantity,
                line_total=line_total(item.price, line.quantity),
                is_available=available,
            )
        )
    pickup = compute_totals(priced, settings.tax_rate, settings.delivery_fee, OrderType.PICKUP)
    delivery = compute_totals(priced, settings.tax_rate, settings.delivery_fee, OrderType.DELIVERY)
    reasons = []
    if not lines:
        reasons.append("CART_EMPTY")
    if any_unavailable:
        reasons.append("ITEM_UNAVAILABLE")
    if not settings.is_open:
        reasons.append("RESTAURANT_CLOSED")
    return CartOut(
        items=out_lines,
        item_count=sum(line.quantity for line in lines),
        subtotal=pickup.subtotal,
        tax_amount=pickup.tax_amount,
        tax_rate=str(settings.tax_rate),
        delivery_fee_if_delivery=delivery.delivery_fee,
        total_pickup=pickup.total,
        total_delivery=delivery.total,
        currency=settings.currency,
        can_checkout=not reasons,
        blocking_reasons=reasons,
    )


def add_item(db: Session, user: User, menu_item_id: uuid.UUID, quantity: int) -> CartOut:
    item = db.get(MenuItem, menu_item_id)
    if item is None or item.is_archived:
        raise NotFound("Menu item not found.", code="MENU_ITEM_NOT_FOUND")
    if not item.is_orderable:
        raise Conflict(
            f"{item.name} is currently unavailable.",
            code="ITEM_UNAVAILABLE",
            details={"menu_item_ids": [str(item.id)]},
        )
    existing = db.scalar(select(CartItem.quantity).where(CartItem.user_id == user.id, CartItem.menu_item_id == item.id))
    if existing is not None and existing + quantity > MAX_QTY:
        raise Unprocessable(
            f"You can order at most {MAX_QTY} of one item (you already have {existing}).",
            code="INVALID_QUANTITY",
            details={"max": MAX_QTY, "current": existing},
        )
    if existing is None:
        line_count = db.scalar(select(func.count()).where(CartItem.user_id == user.id)) or 0
        if line_count >= MAX_LINES:
            raise Unprocessable(f"A cart can hold at most {MAX_LINES} different items.", code="CART_LINE_LIMIT")

    # Atomic upsert: a duplicate item increments the existing line (rule 4), guarded by a UNIQUE constraint.
    stmt = insert(CartItem).values(id=uuid.uuid4(), user_id=user.id, menu_item_id=item.id, quantity=quantity)
    stmt = stmt.on_conflict_do_update(
        index_elements=[CartItem.user_id, CartItem.menu_item_id],
        set_={"quantity": CartItem.quantity + stmt.excluded.quantity, "updated_at": func.now()},
    )
    try:
        db.execute(stmt)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Unprocessable(
            f"You can order at most {MAX_QTY} of one item.", code="INVALID_QUANTITY", details={"max": MAX_QTY}
        ) from None
    return build_cart(db, user)


def _get_line(db: Session, user: User, menu_item_id: uuid.UUID) -> CartItem:
    line = db.scalar(select(CartItem).where(CartItem.user_id == user.id, CartItem.menu_item_id == menu_item_id))
    if line is None:
        raise NotFound("This item is not in your cart.", code="CART_ITEM_NOT_FOUND")
    return line


def set_quantity(db: Session, user: User, menu_item_id: uuid.UUID, quantity: int) -> CartOut:
    line = _get_line(db, user, menu_item_id)
    if quantity > line.quantity and not line.menu_item.is_orderable:
        raise Conflict(
            f"{line.menu_item.name} is currently unavailable.",
            code="ITEM_UNAVAILABLE",
            details={"menu_item_ids": [str(menu_item_id)]},
        )
    line.quantity = quantity
    db.commit()
    return build_cart(db, user)


def remove_item(db: Session, user: User, menu_item_id: uuid.UUID) -> CartOut:
    line = _get_line(db, user, menu_item_id)
    db.delete(line)
    db.commit()
    return build_cart(db, user)


def clear(db: Session, user: User) -> CartOut:
    db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    db.commit()
    return build_cart(db, user)
