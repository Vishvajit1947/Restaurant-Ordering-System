from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.models import MenuItem, Order, OrderItem, OrderStatus, PaymentStatus
from app.schemas.dashboard import DailyRevenue, DashboardStats, TopItem
from app.services import order_service, restaurant_service
from app.services.order_service import TZ
from app.services.pricing import money


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, datetime.min.time(), TZ)
    return start, start + timedelta(days=1)


def get_stats(db: Session, day: date | None = None) -> DashboardStats:
    order_service.expire_stale_orders(db)
    settings = restaurant_service.get_settings(db)
    day = day or datetime.now(TZ).date()
    start, end = _day_bounds(day)

    paid_today = (
        select(Order)
        .where(Order.placed_at >= start, Order.placed_at < end, Order.payment_status == PaymentStatus.SUCCESS)
        .subquery()
    )
    orders_today = db.scalar(select(func.count()).select_from(paid_today)) or 0
    revenue_today = db.scalar(select(func.coalesce(func.sum(paid_today.c.total_amount), 0))) or Decimal(0)
    aov = money(Decimal(revenue_today) / orders_today) if orders_today else money(0)

    active = dict(
        db.execute(
            select(Order.status, func.count())
            .where(Order.status.in_(order_service.sm.ACTIVE_KITCHEN))
            .group_by(Order.status)
        ).all()
    )
    active_by_status = {s.value: int(active.get(s, 0)) for s in order_service.sm.ACTIVE_KITCHEN}
    pending = db.scalar(select(func.count()).where(Order.status == OrderStatus.PENDING_PAYMENT)) or 0
    cancelled_today = (
        db.scalar(
            select(func.count()).where(
                Order.status == OrderStatus.CANCELLED, Order.updated_at >= start, Order.updated_at < end
            )
        )
        or 0
    )

    week_start, _ = _day_bounds(day - timedelta(days=6))
    top_rows = db.execute(
        select(
            OrderItem.menu_item_id,
            OrderItem.item_name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.line_total).label("rev"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.placed_at >= week_start, Order.placed_at < end, Order.payment_status == PaymentStatus.SUCCESS)
        .group_by(OrderItem.menu_item_id, OrderItem.item_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    ).all()

    local_day = cast(func.timezone(str(TZ), Order.placed_at), Date)
    rev_rows = dict(
        (r[0], (r[1], r[2]))
        for r in db.execute(
            select(local_day, func.sum(Order.total_amount), func.count())
            .where(Order.placed_at >= week_start, Order.placed_at < end, Order.payment_status == PaymentStatus.SUCCESS)
            .group_by(local_day)
        ).all()
    )
    revenue_7d = []
    for i in range(6, -1, -1):
        d = day - timedelta(days=i)
        rev, cnt = rev_rows.get(d, (Decimal(0), 0))
        revenue_7d.append(DailyRevenue(date=d, revenue=money(rev), orders=cnt))

    menu_total = db.scalar(select(func.count()).where(MenuItem.is_archived.is_(False))) or 0
    menu_unavailable = (
        db.scalar(select(func.count()).where(MenuItem.is_archived.is_(False), MenuItem.is_available.is_(False))) or 0
    )

    return DashboardStats(
        date=day,
        currency=settings.currency,
        orders_today=orders_today,
        revenue_today=money(revenue_today),
        average_order_value=aov,
        active_by_status=active_by_status,
        pending_payment_count=pending,
        cancelled_today=cancelled_today,
        top_items_7d=[TopItem(menu_item_id=r[0], name=r[1], quantity=int(r[2]), revenue=money(r[3])) for r in top_rows],
        revenue_7d=revenue_7d,
        menu_items_total=menu_total,
        menu_items_unavailable=menu_unavailable,
    )
