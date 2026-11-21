import re
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole
from app.schemas.common import ORMModel

PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


def _validate_password(v: str) -> str:
    if not re.search(r"[A-Za-z]", v) or not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one letter and one digit")
    return v


def _validate_phone(v: str | None) -> str | None:
    if v in (None, ""):
        return None
    v = v.replace(" ", "").replace("-", "")
    if not PHONE_RE.match(v):
        raise ValueError("Phone must be 10-15 digits, optionally starting with +")
    return v


class RegisterIn(BaseModel):
    # Unknown fields (such as "role") are ignored: registration always creates a CUSTOMER.
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = None

    _pw = field_validator("password")(_validate_password)
    _ph = field_validator("phone")(_validate_phone)


class LoginIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Plain string on purpose: login only looks the address up, so strict deliverability rules
    # (which reject reserved demo domains such as *.test) do not apply here.
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    role: UserRole
    is_active: bool


class AuthOut(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class StaffCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = None

    _pw = field_validator("password")(_validate_password)
    _ph = field_validator("phone")(_validate_phone)


class StaffUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool
