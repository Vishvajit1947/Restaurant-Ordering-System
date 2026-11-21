from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import Money, ORMModel, StrictInput


class OpeningHours(BaseModel):
    day: str = Field(max_length=20)
    hours: str = Field(max_length=40)


class RestaurantOut(ORMModel):
    name: str
    tagline: str | None
    description: str | None
    address: str | None
    phone: str | None
    email: str | None
    hero_image_url: str | None
    is_open: bool
    currency: str
    tax_rate: Decimal
    delivery_fee: Money
    pending_payment_ttl_minutes: int
    opening_hours: list[OpeningHours] | None


class RestaurantUpdateIn(StrictInput):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    hero_image_url: str | None = Field(default=None, max_length=500)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=Decimal("0.30"), decimal_places=4)
    delivery_fee: Decimal | None = Field(default=None, ge=0, le=Decimal("1000"), decimal_places=2)
    pending_payment_ttl_minutes: int | None = Field(default=None, ge=5, le=120)
    opening_hours: list[OpeningHours] | None = None


class RestaurantStatusIn(StrictInput):
    is_open: bool
