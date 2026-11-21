"""Pure pricing functions. All money is Decimal and quantised to 0.01 with ROUND_HALF_UP. Floats are never used."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.models.enums import OrderType

CENT = Decimal("0.01")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def line_total(unit_price: Decimal, quantity: int) -> Decimal:
    return money(Decimal(unit_price) * quantity)


@dataclass(frozen=True)
class Totals:
    subtotal: Decimal
    tax_amount: Decimal
    delivery_fee: Decimal
    total: Decimal


def compute_totals(
    lines: list[tuple[Decimal, int]],
    tax_rate: Decimal,
    delivery_fee: Decimal,
    order_type: OrderType,
) -> Totals:
    """lines: (unit_price, quantity) pairs, where unit_price ALWAYS comes from the database."""
    subtotal = money(sum((line_total(p, q) for p, q in lines), Decimal("0")))
    tax_amount = money(subtotal * Decimal(tax_rate))
    fee = money(delivery_fee) if order_type == OrderType.DELIVERY else money(0)
    return Totals(subtotal=subtotal, tax_amount=tax_amount, delivery_fee=fee, total=subtotal + tax_amount + fee)
