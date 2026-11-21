import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RestaurantSettings(Base):
    """Single-row table (id is always 1) holding restaurant info, operating status and pricing settings."""

    __tablename__ = "restaurant_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 0.30", name="tax_rate_range"),
        CheckConstraint("delivery_fee >= 0", name="delivery_fee_non_negative"),
        CheckConstraint("pending_payment_ttl_minutes BETWEEN 5 AND 120", name="ttl_range"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tagline: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    hero_image_url: Mapped[str | None] = mapped_column(String(500))
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False, default=Decimal("0.05"))
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("40.00"))
    pending_payment_ttl_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    opening_hours: Mapped[list | None] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
