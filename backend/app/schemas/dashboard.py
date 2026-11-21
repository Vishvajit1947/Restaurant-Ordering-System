import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.common import Money


class TopItem(BaseModel):
    menu_item_id: uuid.UUID
    name: str
    quantity: int
    revenue: Money


class DailyRevenue(BaseModel):
    date: date
    revenue: Money
    orders: int


class DashboardStats(BaseModel):
    date: date
    currency: str
    orders_today: int
    revenue_today: Money
    average_order_value: Money
    active_by_status: dict[str, int]
    pending_payment_count: int
    cancelled_today: int
    top_items_7d: list[TopItem]
    revenue_7d: list[DailyRevenue]
    menu_items_total: int
    menu_items_unavailable: int
