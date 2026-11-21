import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    Sequence,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, TimestampMixin
from app.models.enums import (
    OrderStatus,
    OrderType,
    PaymentMethod,
    PaymentStatus,
    order_status_enum,
    order_type_enum,
    payment_method_enum,
    payment_status_enum,
)
from app.models.user import User

order_number_seq = Sequence("order_number_seq", metadata=Base.metadata)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key"),
        CheckConstraint("subtotal >= 0 AND tax_amount >= 0 AND delivery_fee >= 0", name="amounts_non_negative"),
        CheckConstraint("total_amount = subtotal + tax_amount + delivery_fee", name="total_consistent"),
        CheckConstraint("order_type = 'PICKUP' OR delivery_address IS NOT NULL", name="delivery_requires_address"),
        # Rule 12: an order can only be PLACED (or progress further) once a payment succeeded.
        CheckConstraint(
            "status IN ('PENDING_PAYMENT', 'CANCELLED') OR payment_status = 'SUCCESS'",
            name="placed_requires_payment",
        ),
        CheckConstraint("status IN ('PENDING_PAYMENT', 'CANCELLED') OR placed_at IS NOT NULL", name="placed_at_set"),
        Index("ix_orders_user_created", "user_id", text("created_at DESC")),
        Index("ix_orders_status_created", "status", "created_at"),
        Index("ix_orders_placed_at", "placed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_number: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(order_status_enum, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(payment_status_enum, nullable=False)
    order_type: Mapped[OrderType] = mapped_column(order_type_enum, nullable=False)
    delivery_address: Mapped[str | None] = mapped_column(String(300))
    customer_notes: Mapped[str | None] = mapped_column(String(300))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    idempotency_key: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    placed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_reason: Mapped[str | None] = mapped_column(String(300))

    user: Mapped[User] = relationship(lazy="joined")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.item_name", lazy="selectin"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", order_by="Payment.attempt_number", lazy="selectin"
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusHistory.id",
        lazy="selectin",
    )


class OrderItem(Base, CreatedAtMixin):
    __tablename__ = "order_items"
    __table_args__ = (
        UniqueConstraint("order_id", "menu_item_id"),
        CheckConstraint("unit_price > 0", name="unit_price_positive"),
        CheckConstraint("quantity BETWEEN 1 AND 50", name="quantity_range"),
        CheckConstraint("line_total = unit_price * quantity", name="line_total_consistent"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class Payment(Base, CreatedAtMixin):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("order_id", "attempt_number"),
        UniqueConstraint("order_id", "idempotency_key"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("attempt_number > 0", name="attempt_positive"),
        # At most one successful payment per order, ever.
        Index(
            "uq_payments_one_success_per_order",
            "order_id",
            unique=True,
            postgresql_where=text("status IN ('SUCCESS', 'REFUNDED')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(payment_method_enum, nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(payment_status_enum, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    card_last4: Mapped[str | None] = mapped_column(String(4))
    upi_id: Mapped[str | None] = mapped_column(String(100))
    provider_reference: Mapped[str | None] = mapped_column(String(64))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    idempotency_key: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="payments")


class OrderStatusHistory(Base, CreatedAtMixin):
    __tablename__ = "order_status_history"
    __table_args__ = (Index("ix_order_status_history_order_created", "order_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    from_status: Mapped[OrderStatus | None] = mapped_column(order_status_enum)
    to_status: Mapped[OrderStatus] = mapped_column(order_status_enum, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(String(300))

    order: Mapped[Order] = relationship(back_populates="status_history")
    actor: Mapped[User | None] = relationship(lazy="joined")
