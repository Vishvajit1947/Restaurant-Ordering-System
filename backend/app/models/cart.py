import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.menu import MenuItem


class CartItem(Base, TimestampMixin):
    """One line of a customer's server-side cart. Each customer has one implicit cart."""

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("user_id", "menu_item_id"),
        CheckConstraint("quantity BETWEEN 1 AND 50", name="quantity_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    menu_item: Mapped[MenuItem] = relationship(lazy="joined")
