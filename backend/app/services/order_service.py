import hashlib
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.exceptions import BadRequest, Conflict, NotFound
from app.models import (
    ActorRole,
    CartItem,
    Category,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    PaymentStatus,
    User,
    UserRole,
    order_number_seq,
)
from app.schemas.order import (
    CheckoutIn,
    CustomerOut,
    OrderItemOut,
    OrderOut,
    OrderSummaryOut,
    PaymentOut,
    StatusHistoryOut,
)
from app.services import order_state_machine as sm
from app.services import restaurant_service
from app.services.pricing import compute_totals, line_total

TZ = ZoneInfo(app_settings.TIMEZONE)


def now_utc() -> datetime:
    return datetime.now(UTC)


def actor_role_for(user: User) -> ActorRole:
    return ActorRole(user.role.value)


# ---------------- Serialisation ----------------


def to_order_out(db: Session, order: Order, *, viewer: ActorRole) -> OrderOut:
    prep_times = db.scalars(
        select(MenuItem.prep_time_minutes).where(MenuItem.id.in_([i.menu_item_id for i in order.items]))
    ).all()
    actions: list[str] = []
    if viewer == ActorRole.CUSTOMER and order.status == OrderStatus.PENDING_PAYMENT:
        if order.payment_expires_at > now_utc():
            actions.append("PAY")
        actions.append("CANCEL")
    out = OrderOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status,
        payment_status=order.payment_status,
        order_type=order.order_type,
        delivery_address=order.delivery_address,
        customer_notes=order.customer_notes,
        currency=order.currency,
        items=[OrderItemOut.model_validate(i) for i in order.items],
        subtotal=order.subtotal,
        tax_amount=order.tax_amount,
        delivery_fee=order.delivery_fee,
        total_amount=order.total_amount,
        payment_expires_at=order.payment_expires_at,
        placed_at=order.placed_at,
        created_at=order.created_at,
        cancelled_reason=order.cancelled_reason,
        estimated_ready_minutes=(max(prep_times) if prep_times else 15) + 10,
        payments=[PaymentOut.model_validate(p) for p in order.payments],
        status_history=[
            StatusHistoryOut(
                from_status=h.from_status,
                to_status=h.to_status,
                actor_role=h.actor_role,
                actor_name=h.actor.full_name if h.actor and viewer != ActorRole.CUSTOMER else None,
                note=h.note,
                created_at=h.created_at,
            )
            for h in order.status_history
        ],
        allowed_actions=actions,
    )
    if viewer in (ActorRole.STAFF, ActorRole.ADMIN):
        out.customer = CustomerOut(
            id=order.user.id, full_name=order.user.full_name, email=order.user.email, phone=order.user.phone
        )
        out.allowed_transitions = sm.allowed_targets(order.status, viewer)
    return out


def to_summary(order: Order, *, with_customer: bool = False) -> OrderSummaryOut:
    return OrderSummaryOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status,
        payment_status=order.payment_status,
        order_type=order.order_type,
        total_amount=order.total_amount,
        currency=order.currency,
        item_count=sum(i.quantity for i in order.items),
        created_at=order.created_at,
        placed_at=order.placed_at,
        customer_name=order.user.full_name if with_customer else None,
    )


# ---------------- Transitions & history ----------------


def record_history(
    db: Session,
    order: Order,
    from_status: OrderStatus | None,
    to_status: OrderStatus,
    actor: ActorRole,
    actor_id: uuid.UUID | None,
    note: str | None = None,
) -> None:
    entry = OrderStatusHistory(
        order_id=order.id,
        from_status=from_status,
        to_status=to_status,
        actor_role=actor.value,
        changed_by=actor_id,
        note=note,
    )
    order.status_history.append(entry)


def apply_transition(
    db: Session,
    order: Order,
    target: OrderStatus,
    actor: ActorRole,
    actor_id: uuid.UUID | None,
    note: str | None = None,
) -> None:
    """Validates through the state machine, applies side effects and writes history. Caller holds the row lock."""
    sm.assert_transition(order.status, target, actor)
    previous = order.status
    if target == OrderStatus.PLACED:
        order.placed_at = now_utc()
    if target == OrderStatus.CANCELLED:
        order.cancelled_reason = note
        if order.payment_status == PaymentStatus.SUCCESS:
            for p in order.payments:
                if p.status == PaymentStatus.SUCCESS:
                    p.status = PaymentStatus.REFUNDED
                    p.refunded_at = now_utc()
            order.payment_status = PaymentStatus.REFUNDED
    order.status = target
    record_history(db, order, previous, target, actor, actor_id, note)


def lock_order(db: Session, order_id: uuid.UUID, *, owner_id: uuid.UUID | None = None) -> Order:
    q = select(Order).where(Order.id == order_id).with_for_update(of=Order)
    if owner_id is not None:
        q = q.where(Order.user_id == owner_id)
    order = db.scalars(q).unique().one_or_none()
    if order is None:
        raise NotFound("Order not found.", code="ORDER_NOT_FOUND")
    db.refresh(order)  # make sure we see the latest committed state after acquiring the lock
    return order


def is_expired(order: Order) -> bool:
    return order.status == OrderStatus.PENDING_PAYMENT and order.payment_expires_at <= now_utc()


def expire_locked_order(db: Session, order: Order) -> None:
    apply_transition(db, order, OrderStatus.CANCELLED, ActorRole.SYSTEM, None, "Payment window expired")


def expire_stale_orders(db: Session, *, user_id: uuid.UUID | None = None) -> int:
    """Lazily cancels unpaid orders whose payment window has passed. No background worker needed."""
    q = (
        select(Order.id)
        .where(Order.status == OrderStatus.PENDING_PAYMENT, Order.payment_expires_at <= now_utc())
        .with_for_update(skip_locked=True)
    )
    if user_id:
        q = q.where(Order.user_id == user_id)
    ids = db.scalars(q).all()
    for oid in ids:
        order = db.get(Order, oid)
        if order and is_expired(order):
            expire_locked_order(db, order)
    if ids:
        db.commit()
    else:
        db.rollback()  # release the (empty) lock transaction
    return len(ids)


# ---------------- Checkout ----------------


def _request_hash(body: CheckoutIn) -> str:
    canonical = json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _find_by_key(db: Session, user_id: uuid.UUID, key: uuid.UUID) -> Order | None:
    return (
        db.scalars(select(Order).where(Order.user_id == user_id, Order.idempotency_key == key)).unique().one_or_none()
    )


def _replay(existing: Order, request_hash: str) -> Order:
    if existing.request_hash != request_hash:
        raise Conflict(
            "This Idempotency-Key was already used for a different checkout request.",
            code="IDEMPOTENCY_KEY_REUSED",
        )
    return existing


def _next_order_number(db: Session) -> str:
    seq = db.scalar(select(order_number_seq.next_value()))
    return f"ORD-{datetime.now(TZ):%Y%m%d}-{seq:06d}"


def checkout(db: Session, user: User, key: uuid.UUID, body: CheckoutIn) -> tuple[Order, bool]:
    """Returns (order, created). created=False means an idempotent replay of an earlier request."""
    req_hash = _request_hash(body)
    existing = _find_by_key(db, user.id, key)
    if existing:
        return _replay(existing, req_hash), False

    # Serialise this customer's checkouts so two concurrent requests cannot both consume the same cart.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    existing = _find_by_key(db, user.id, key)
    if existing:
        db.rollback()
        return _replay(existing, req_hash), False

    settings = restaurant_service.assert_open(db)
    lines = list(
        db.scalars(
            select(CartItem)
            .join(MenuItem, CartItem.menu_item_id == MenuItem.id)
            .join(Category, MenuItem.category_id == Category.id)
            .where(CartItem.user_id == user.id)
            .order_by(CartItem.created_at)
        ).unique()
    )
    if not lines:
        raise BadRequest("Your cart is empty.", code="CART_EMPTY")

    # Rule 2: availability is re-validated at checkout.
    unavailable = [line.menu_item for line in lines if not line.menu_item.is_orderable]
    if unavailable:
        raise Conflict(
            "Some items in your cart are no longer available: " + ", ".join(i.name for i in unavailable),
            code="ITEM_UNAVAILABLE",
            details={"menu_item_ids": [str(i.id) for i in unavailable]},
        )

    totals = compute_totals(
        [(line.menu_item.price, line.quantity) for line in lines],
        settings.tax_rate,
        settings.delivery_fee,
        body.order_type,
    )
    order = Order(
        order_number=_next_order_number(db),
        user_id=user.id,
        status=OrderStatus.PENDING_PAYMENT,
        payment_status=PaymentStatus.PENDING,
        order_type=body.order_type,
        delivery_address=body.delivery_address,
        customer_notes=body.customer_notes,
        currency=settings.currency,
        subtotal=totals.subtotal,
        tax_amount=totals.tax_amount,
        delivery_fee=totals.delivery_fee,
        total_amount=totals.total,
        idempotency_key=key,
        request_hash=req_hash,
        payment_expires_at=now_utc() + timedelta(minutes=settings.pending_payment_ttl_minutes),
    )
    for line in lines:
        order.items.append(
            OrderItem(
                menu_item_id=line.menu_item.id,
                item_name=line.menu_item.name,  # snapshot
                unit_price=line.menu_item.price,  # snapshot
                quantity=line.quantity,
                line_total=line_total(line.menu_item.price, line.quantity),
            )
        )
    db.add(order)
    db.flush()
    record_history(db, order, None, OrderStatus.PENDING_PAYMENT, ActorRole.CUSTOMER, user.id)
    db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_by_key(db, user.id, key)
        if existing:
            return _replay(existing, req_hash), False
        raise
    db.refresh(order)
    return order, True


# ---------------- Customer queries & actions ----------------


def list_customer_orders(
    db: Session, user: User, *, status: OrderStatus | None, page: int, page_size: int
) -> tuple[list[Order], int]:
    expire_stale_orders(db, user_id=user.id)
    q = select(Order).where(Order.user_id == user.id)
    if status:
        q = q.where(Order.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    orders = db.scalars(q.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return list(orders), total


def get_customer_order(db: Session, user: User, order_id: uuid.UUID) -> Order:
    order = db.scalars(select(Order).where(Order.id == order_id, Order.user_id == user.id)).unique().one_or_none()
    if order is None:
        raise NotFound("Order not found.", code="ORDER_NOT_FOUND")
    if is_expired(order):
        order = lock_order(db, order_id, owner_id=user.id)
        if is_expired(order):
            expire_locked_order(db, order)
            db.commit()
    return order


def _restore_to_cart(db: Session, user: User, order: Order) -> tuple[list[str], list[str]]:
    restored, skipped = [], []
    for oi in order.items:
        item = db.get(MenuItem, oi.menu_item_id)
        if item is None or not item.is_orderable:
            skipped.append(oi.item_name)
            continue
        stmt = insert(CartItem).values(id=uuid.uuid4(), user_id=user.id, menu_item_id=item.id, quantity=oi.quantity)
        stmt = stmt.on_conflict_do_update(
            index_elements=[CartItem.user_id, CartItem.menu_item_id],
            set_={"quantity": func.least(CartItem.quantity + stmt.excluded.quantity, 50), "updated_at": func.now()},
        )
        db.execute(stmt)
        restored.append(oi.item_name)
    return restored, skipped


def cancel_by_customer(
    db: Session, user: User, order_id: uuid.UUID, restore_to_cart: bool
) -> tuple[Order, list[str], list[str]]:
    order = lock_order(db, order_id, owner_id=user.id)
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise Conflict(
            "Only orders awaiting payment can be cancelled by the customer.",
            code="INVALID_STATUS_TRANSITION",
            details={"from": order.status.value, "to": OrderStatus.CANCELLED.value},
        )
    apply_transition(db, order, OrderStatus.CANCELLED, ActorRole.CUSTOMER, user.id, "Cancelled by customer")
    restored, skipped = _restore_to_cart(db, user, order) if restore_to_cart else ([], [])
    db.commit()
    db.refresh(order)
    return order, restored, skipped


# ---------------- Staff / admin ----------------


def admin_list_orders(
    db: Session,
    *,
    statuses: list[OrderStatus] | None,
    include_unpaid: bool,
    date_from: date | None,
    date_to: date | None,
    search: str | None,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Order], int]:
    expire_stale_orders(db)
    q = select(Order).join(User, Order.user_id == User.id)
    if statuses:
        q = q.where(Order.status.in_(statuses))
    if not include_unpaid:
        q = q.where(Order.status != OrderStatus.PENDING_PAYMENT)
    if date_from:
        q = q.where(Order.created_at >= datetime.combine(date_from, datetime.min.time(), TZ))
    if date_to:
        q = q.where(Order.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), TZ))
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(Order.order_number.ilike(term), User.full_name.ilike(term)))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    order_by = Order.created_at.asc() if sort == "oldest" else Order.created_at.desc()
    orders = db.scalars(q.order_by(order_by).offset((page - 1) * page_size).limit(page_size)).unique()
    return list(orders), total


def admin_get_order(db: Session, order_id: uuid.UUID) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise NotFound("Order not found.", code="ORDER_NOT_FOUND")
    if is_expired(order):
        order = lock_order(db, order_id)
        if is_expired(order):
            expire_locked_order(db, order)
            db.commit()
    return order


def admin_change_status(db: Session, actor: User, order_id: uuid.UUID, target: OrderStatus, note: str | None) -> Order:
    order = lock_order(db, order_id)
    role = actor_role_for(actor)
    if target == OrderStatus.CANCELLED and role == ActorRole.ADMIN and not note:
        note = "Cancelled by restaurant"
    apply_transition(db, order, target, role, actor.id, note)
    db.commit()
    db.refresh(order)
    return order


def admin_cancel(db: Session, actor: User, order_id: uuid.UUID, reason: str) -> Order:
    if actor.role != UserRole.ADMIN:
        from app.core.exceptions import Forbidden

        raise Forbidden("Only admins can cancel orders.")
    return admin_change_status(db, actor, order_id, OrderStatus.CANCELLED, reason)
