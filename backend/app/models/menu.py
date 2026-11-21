import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    __table_args__ = (Index("ix_categories_active_sort", "is_active", "sort_order"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    # Slug is derived from the lower-cased name, so its uniqueness makes names unique case-insensitively.
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    items: Mapped[list["MenuItem"]] = relationship(back_populates="category")


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price > 0 AND price <= 100000", name="price_range"),
        CheckConstraint("spice_level BETWEEN 0 AND 3", name="spice_level_range"),
        CheckConstraint("prep_time_minutes BETWEEN 1 AND 180", name="prep_time_range"),
        Index(
            "ix_menu_items_active_category_price",
            "category_id",
            "price",
            postgresql_where=text("is_archived = false"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_vegetarian: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spice_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    prep_time_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=15)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    category: Mapped[Category] = relationship(back_populates="items", lazy="joined")

    @property
    def is_orderable(self) -> bool:
        return self.is_available and not self.is_archived and self.category.is_active
