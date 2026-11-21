import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, Forbidden, NotFound, Unauthorized
from app.core.security import hash_password, verify_password
from app.models import User, UserRole
from app.schemas.auth import LoginIn, RegisterIn, StaffCreateIn

# A valid bcrypt hash used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = hash_password("timing-equaliser-1")


def _create_user(db: Session, *, full_name: str, email: str, password: str, phone: str | None, role: UserRole) -> User:
    email = email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise Conflict("An account with this email already exists.", code="EMAIL_ALREADY_REGISTERED")
    user = User(full_name=full_name, email=email, password_hash=hash_password(password), phone=phone, role=role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("An account with this email already exists.", code="EMAIL_ALREADY_REGISTERED") from None
    db.refresh(user)
    return user


def register(db: Session, data: RegisterIn) -> User:
    return _create_user(
        db, full_name=data.full_name, email=data.email, password=data.password, phone=data.phone, role=UserRole.CUSTOMER
    )


def authenticate(db: Session, data: LoginIn) -> User:
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is None:
        verify_password(data.password, _DUMMY_HASH)
        raise Unauthorized("Invalid email or password.", code="INVALID_CREDENTIALS")
    if not verify_password(data.password, user.password_hash):
        raise Unauthorized("Invalid email or password.", code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise Forbidden("This account has been disabled.", code="ACCOUNT_DISABLED")
    return user


def list_staff(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User).where(User.role.in_([UserRole.STAFF, UserRole.ADMIN])).order_by(User.role, User.full_name)
        )
    )


def create_staff(db: Session, data: StaffCreateIn) -> User:
    return _create_user(
        db, full_name=data.full_name, email=data.email, password=data.password, phone=data.phone, role=UserRole.STAFF
    )


def set_staff_active(db: Session, user_id: uuid.UUID, is_active: bool, actor: User) -> User:
    user = db.get(User, user_id)
    if user is None or user.role == UserRole.CUSTOMER:
        raise NotFound("Staff member not found.", code="USER_NOT_FOUND")
    if user.id == actor.id:
        raise Conflict("You cannot deactivate your own account.", code="CANNOT_DEACTIVATE_SELF")
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user
