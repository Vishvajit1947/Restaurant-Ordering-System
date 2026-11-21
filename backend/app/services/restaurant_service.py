import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import Conflict
from app.models import RestaurantSettings
from app.schemas.restaurant import RestaurantUpdateIn


def get_settings(db: Session, *, for_update: bool = False) -> RestaurantSettings:
    q = db.query(RestaurantSettings).filter(RestaurantSettings.id == 1)
    if for_update:
        q = q.with_for_update()
    row = q.one_or_none()
    if row is None:
        row = RestaurantSettings(
            id=1,
            name="Saffron & Smoke",
            is_open=True,
            currency="INR",
            tax_rate=Decimal("0.05"),
            delivery_fee=Decimal("40.00"),
            pending_payment_ttl_minutes=15,
        )
        db.add(row)
        db.flush()
    return row


def assert_open(db: Session) -> RestaurantSettings:
    s = get_settings(db)
    if not s.is_open:
        raise Conflict("The restaurant is currently closed and not accepting orders.", code="RESTAURANT_CLOSED")
    return s


def update_settings(db: Session, data: RestaurantUpdateIn, actor_id: uuid.UUID) -> RestaurantSettings:
    s = get_settings(db, for_update=True)
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in ("name",) and value is None:
            continue
        setattr(s, field, value)
    s.updated_by = actor_id
    db.commit()
    db.refresh(s)
    return s


def set_open(db: Session, is_open: bool, actor_id: uuid.UUID) -> RestaurantSettings:
    s = get_settings(db, for_update=True)
    s.is_open = is_open
    s.updated_by = actor_id
    db.commit()
    db.refresh(s)
    return s
