import uuid
from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.common import Money, StrictInput

# Strict integer: JSON 1.5, "2", true are all rejected (rule 3).
Quantity = Annotated[int, Field(strict=True, ge=1, le=50)]


class CartAddIn(StrictInput):
    menu_item_id: uuid.UUID
    quantity: Quantity = 1


class CartUpdateIn(StrictInput):
    quantity: Quantity


class CartLineOut(BaseModel):
    menu_item_id: uuid.UUID
    name: str
    image_url: str | None
    is_vegetarian: bool
    unit_price: Money
    quantity: int
    line_total: Money
    is_available: bool


class CartOut(BaseModel):
    items: list[CartLineOut]
    item_count: int
    subtotal: Money
    tax_amount: Money
    tax_rate: str
    delivery_fee_if_delivery: Money
    total_pickup: Money
    total_delivery: Money
    currency: str
    can_checkout: bool
    blocking_reasons: list[str]
