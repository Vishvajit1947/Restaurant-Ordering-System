import uuid

from sqlalchemy import Boolean, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import UserRole, user_role_enum


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Always stored lower-cased, so the unique constraint is case-insensitive.
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[UserRole] = mapped_column(user_role_enum, nullable=False, default=UserRole.CUSTOMER)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
