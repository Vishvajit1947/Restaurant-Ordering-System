import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict
from app.models import ActorRole, MenuItem, Order, OrderStatus, Payment, PaymentMethod, PaymentStatus, User
from app.schemas.order import PaymentIn
from app.services import order_service, restaurant_service
from app.services.payment_gateway import gateway


def pay(db: Session, user: User, order_id: uuid.UUID, key: uuid.UUID, body: PaymentIn) -> tuple[Payment, Order, bool]:
    """Attempts a simulated payment. Returns (payment, order, created).

    The order row is locked for the whole attempt, so concurrent attempts on one order run one after the other.
    """
    order = order_service.lock_order(db, order_id, owner_id=user.id)

    prior = db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.idempotency_key == key))
    if prior is not None:
        db.rollback()
        return prior, order, False  # idempotent replay

    if order.payment_status == PaymentStatus.SUCCESS or any(
        p.status in (PaymentStatus.SUCCESS, PaymentStatus.REFUNDED) for p in order.payments
    ):
        raise Conflict("This order has already been paid.", code="ORDER_ALREADY_PAID")

    if order_service.is_expired(order):
        order_service.expire_locked_order(db, order)
        db.commit()
        raise Conflict(
            "The payment window for this order has expired, so it was cancelled. "
            "You can restore its items to your cart and order again.",
            code="ORDER_EXPIRED",
        )

    if order.status != OrderStatus.PENDING_PAYMENT:
        raise Conflict(f"This order cannot be paid because it is {order.status.value}.", code="ORDER_NOT_PAYABLE")

    restaurant_service.assert_open(db)

    item_ids = [i.menu_item_id for i in order.items]
    unavailable = [
        m for m in db.scalars(select(MenuItem).where(MenuItem.id.in_(item_ids))).unique() if not m.is_orderable
    ]
    if unavailable:
        raise Conflict(
            "Some items in this order are no longer available: "
            + ", ".join(m.name for m in unavailable)
            + ". Please cancel the order and update your cart.",
            code="ITEM_UNAVAILABLE",
            details={"menu_item_ids": [str(m.id) for m in unavailable]},
        )

    attempt_number = (db.scalar(select(func.max(Payment.attempt_number)).where(Payment.order_id == order.id)) or 0) + 1
    card_number = body.card.number if body.card else None
    payment = Payment(
        order_id=order.id,
        attempt_number=attempt_number,
        method=body.method,
        status=PaymentStatus.PENDING,
        amount=order.total_amount,  # never taken from the client (rule 6)
        currency=order.currency,
        card_last4=card_number[-4:] if card_number else None,
        upi_id=body.upi_id if body.method == PaymentMethod.UPI else None,
        idempotency_key=key,
    )
    db.add(payment)
    db.flush()

    result = gateway.charge(
        order.total_amount,
        order.currency,
        body.method,
        card_number=card_number,
        upi_id=body.upi_id,
        simulate=body.simulate,
    )
    payment.completed_at = func.now()
    if result.success:
        payment.status = PaymentStatus.SUCCESS
        payment.provider_reference = result.reference
        order.payment_status = PaymentStatus.SUCCESS
        # Rule 12: only a successful payment moves the order to PLACED.
        order_service.apply_transition(
            db, order, OrderStatus.PLACED, ActorRole.SYSTEM, None, f"Payment {result.reference} succeeded"
        )
    else:
        # Rule 10: a failed payment leaves the order in PENDING_PAYMENT so the customer can retry (rule 11).
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = result.failure_reason
        order.payment_status = PaymentStatus.FAILED

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        prior = db.scalar(select(Payment).where(Payment.order_id == order_id, Payment.idempotency_key == key))
        if prior is not None:
            return prior, db.get(Order, order_id), False
        raise Conflict("This order has already been paid.", code="ORDER_ALREADY_PAID") from None
    db.refresh(payment)
    db.refresh(order)
    return payment, order, True
