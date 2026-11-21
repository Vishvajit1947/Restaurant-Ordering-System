import re
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import OrderStatus, OrderType, PaymentMethod, PaymentStatus
from app.schemas.common import Money, ORMModel, StrictInput


class CheckoutIn(StrictInput):
    """Checkout body. Deliberately contains no items and no prices: the server reads the cart itself (rule 6)."""

    order_type: OrderType
    delivery_address: str | None = Field(default=None, max_length=300)
    customer_notes: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _address_rules(self) -> "CheckoutIn":
        if self.order_type == OrderType.DELIVERY:
            if not self.delivery_address or len(self.delivery_address) < 10:
                raise ValueError("A delivery address of at least 10 characters is required for delivery orders")
        else:
            self.delivery_address = None
        if self.customer_notes == "":
            self.customer_notes = None
        return self


class OrderItemOut(ORMModel):
    menu_item_id: uuid.UUID
    item_name: str
    unit_price: Money
    quantity: int
    line_total: Money


class PaymentOut(ORMModel):
    id: uuid.UUID
    attempt_number: int
    method: PaymentMethod
    status: PaymentStatus
    amount: Money
    currency: str
    card_last4: str | None
    upi_id: str | None
    provider_reference: str | None
    failure_reason: str | None
    created_at: datetime
    completed_at: datetime | None
    refunded_at: datetime | None


class StatusHistoryOut(BaseModel):
    from_status: OrderStatus | None
    to_status: OrderStatus
    actor_role: str
    actor_name: str | None
    note: str | None
    created_at: datetime


class CustomerOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None


class OrderSummaryOut(BaseModel):
    id: uuid.UUID
    order_number: str
    status: OrderStatus
    payment_status: PaymentStatus
    order_type: OrderType
    total_amount: Money
    currency: str
    item_count: int
    created_at: datetime
    placed_at: datetime | None
    customer_name: str | None = None


class OrderOut(BaseModel):
    id: uuid.UUID
    order_number: str
    status: OrderStatus
    payment_status: PaymentStatus
    order_type: OrderType
    delivery_address: str | None
    customer_notes: str | None
    currency: str
    items: list[OrderItemOut]
    subtotal: Money
    tax_amount: Money
    delivery_fee: Money
    total_amount: Money
    payment_expires_at: datetime
    placed_at: datetime | None
    created_at: datetime
    cancelled_reason: str | None
    estimated_ready_minutes: int
    payments: list[PaymentOut]
    status_history: list[StatusHistoryOut]
    allowed_actions: list[str]
    customer: CustomerOut | None = None
    allowed_transitions: list[OrderStatus] = []


class CancelIn(StrictInput):
    restore_to_cart: bool = False


class CancelOut(BaseModel):
    order: OrderOut
    restored: list[str] = []
    skipped: list[str] = []


class StatusChangeIn(StrictInput):
    to_status: OrderStatus
    note: str | None = Field(default=None, max_length=300)


class AdminCancelIn(StrictInput):
    reason: str = Field(min_length=3, max_length=300)


# ---------- Payments ----------

UPI_RE = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$")


def luhn_valid(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


class CardIn(StrictInput):
    number: str
    expiry: str = Field(description="MM/YY")
    cvv: str
    holder_name: str = Field(min_length=2, max_length=100)

    @field_validator("number")
    @classmethod
    def _number(cls, v: str) -> str:
        v = v.replace(" ", "").replace("-", "")
        if not v.isdigit() or not 12 <= len(v) <= 19:
            raise ValueError("Card number must be 12-19 digits")
        if not luhn_valid(v):
            raise ValueError("Card number is invalid")
        return v

    @field_validator("expiry")
    @classmethod
    def _expiry(cls, v: str) -> str:
        m = re.fullmatch(r"(0[1-9]|1[0-2])/(\d{2})", v)
        if not m:
            raise ValueError("Expiry must be in MM/YY format")
        month, year = int(m.group(1)), 2000 + int(m.group(2))
        today = date.today()
        if (year, month) < (today.year, today.month):
            raise ValueError("Card has expired")
        return v

    @field_validator("cvv")
    @classmethod
    def _cvv(cls, v: str) -> str:
        if not re.fullmatch(r"\d{3,4}", v):
            raise ValueError("CVV must be 3 or 4 digits")
        return v


class PaymentIn(StrictInput):
    method: PaymentMethod
    card: CardIn | None = None
    upi_id: str | None = Field(default=None, max_length=100)
    simulate: Literal["SUCCESS", "FAILURE"] | None = None

    @model_validator(mode="after")
    def _method_details(self) -> "PaymentIn":
        if self.method == PaymentMethod.CARD:
            if self.card is None:
                raise ValueError("Card details are required for card payments")
            self.upi_id = None
        else:
            if not self.upi_id or not UPI_RE.match(self.upi_id):
                raise ValueError("A valid UPI ID (name@bank) is required for UPI payments")
            self.card = None
        return self


class PaymentResultOut(BaseModel):
    payment: PaymentOut
    order: OrderOut
