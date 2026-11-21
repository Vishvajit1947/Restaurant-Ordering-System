import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequest, Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User, UserRole


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(settings.COOKIE_NAME)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _extract_token(request)
    if not token:
        raise Unauthorized()
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Your session has expired. Please log in again.", code="TOKEN_EXPIRED") from None
    except (jwt.PyJWTError, KeyError, ValueError):
        raise Unauthorized("Invalid authentication token.", code="INVALID_TOKEN") from None
    # The role is re-read from the database on every request, so deactivation/role changes apply immediately.
    user = db.get(User, user_id)
    if user is None:
        raise Unauthorized("Invalid authentication token.", code="INVALID_TOKEN")
    if not user.is_active:
        raise Forbidden("This account has been disabled.", code="ACCOUNT_DISABLED")
    return user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden()
        return user

    return dependency


require_customer = require_roles(UserRole.CUSTOMER)
require_staff = require_roles(UserRole.STAFF, UserRole.ADMIN)
require_admin = require_roles(UserRole.ADMIN)


def get_idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> uuid.UUID:
    if not idempotency_key:
        raise BadRequest("An Idempotency-Key header is required.", code="IDEMPOTENCY_KEY_REQUIRED")
    try:
        return uuid.UUID(idempotency_key)
    except ValueError:
        raise BadRequest("Idempotency-Key must be a UUID.", code="IDEMPOTENCY_KEY_REQUIRED") from None
