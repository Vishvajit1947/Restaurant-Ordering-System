import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import Money, ORMModel, StrictInput


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    sort_order: int
    is_active: bool
    item_count: int = 0


class CategoryCreateIn(StrictInput):
    name: str = Field(min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    sort_order: int = Field(default=0, ge=0, le=10000)
    is_active: bool = True


class CategoryUpdateIn(StrictInput):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    sort_order: int | None = Field(default=None, ge=0, le=10000)
    is_active: bool | None = None


class CategoryRef(ORMModel):
    id: uuid.UUID
    name: str
    slug: str


class MenuItemOut(ORMModel):
    id: uuid.UUID
    category: CategoryRef
    name: str
    description: str | None
    price: Money
    image_url: str | None
    is_vegetarian: bool
    spice_level: int
    prep_time_minutes: int
    is_available: bool
    is_archived: bool
    created_at: datetime


Price = Decimal


class MenuItemCreateIn(StrictInput):
    category_id: uuid.UUID
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    price: Decimal = Field(gt=0, le=100000, decimal_places=2)
    image_url: str | None = Field(default=None, max_length=500)
    is_vegetarian: bool = False
    spice_level: int = Field(default=0, ge=0, le=3)
    prep_time_minutes: int = Field(default=15, ge=1, le=180)
    is_available: bool = True


class MenuItemUpdateIn(StrictInput):
    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    price: Decimal | None = Field(default=None, gt=0, le=100000, decimal_places=2)
    image_url: str | None = Field(default=None, max_length=500)
    is_vegetarian: bool | None = None
    spice_level: int | None = Field(default=None, ge=0, le=3)
    prep_time_minutes: int | None = Field(default=None, ge=1, le=180)
    is_available: bool | None = None


class AvailabilityIn(StrictInput):
    is_available: bool


class DeleteResult(ORMModel):
    deleted: bool = False
    archived: bool = False
    deactivated: bool = False


MenuSort = Literal["name", "price_asc", "price_desc", "newest"]


class UploadOut(ORMModel):
    url: str
