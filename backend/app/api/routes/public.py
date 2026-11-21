"""Public and customer-facing routes: health, auth, restaurant, menu, cart, orders, payments."""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_idempotency_key, require_customer
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.models import ActorRole, OrderStatus, User
from app.schemas.auth import AuthOut, LoginIn, RegisterIn, UserOut
from app.schemas.cart import CartAddIn, CartOut, CartUpdateIn
from app.schemas.common import Page
from app.schemas.menu import CategoryOut, MenuItemOut, MenuSort
from app.schemas.order import (
    CancelIn,
    CancelOut,
    CheckoutIn,
    OrderOut,
    OrderSummaryOut,
    PaymentIn,
    PaymentOut,
    PaymentResultOut,
)
from app.schemas.restaurant import RestaurantOut
from app.services import (
    auth_service,
    cart_service,
    menu_service,
    order_service,
    payment_service,
    restaurant_service,
)

router = APIRouter()


# ---------- Health ----------
@router.get("/health", tags=["health"])
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


# ---------- Auth ----------
def _auth_response(response: Response, user: User) -> AuthOut:
    token, expires_in = create_access_token(user.id, user.role.value)
    response.set_cookie(
        settings.COOKIE_NAME,
        token,
        max_age=expires_in,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )
    return AuthOut(user=UserOut.model_validate(user), access_token=token, expires_in=expires_in)


@router.post("/auth/register", response_model=AuthOut, status_code=201, tags=["auth"])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    return _auth_response(response, auth_service.register(db, body))


@router.post("/auth/login", response_model=AuthOut, tags=["auth"])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    return _auth_response(response, auth_service.authenticate(db, body))


@router.post("/auth/logout", status_code=204, tags=["auth"])
def logout(response: Response):
    response.delete_cookie(settings.COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@router.get("/auth/me", response_model=UserOut, tags=["auth"])
def me(user: User = Depends(get_current_user)):
    return user


# ---------- Restaurant ----------
@router.get("/restaurant", response_model=RestaurantOut, tags=["restaurant"])
def get_restaurant(db: Session = Depends(get_db)):
    s = restaurant_service.get_settings(db)
    db.commit()
    return s


# ---------- Menu ----------
@router.get("/categories", response_model=list[CategoryOut], tags=["menu"])
def list_categories(db: Session = Depends(get_db)):
    return menu_service.list_categories(db, include_inactive=False)


@router.get("/menu-items", response_model=Page[MenuItemOut], tags=["menu"])
def list_menu_items(
    category_id: uuid.UUID | None = None,
    search: str | None = Query(default=None, max_length=100),
    vegetarian: bool | None = None,
    available_only: bool = False,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    sort: MenuSort = "name",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = menu_service.list_menu_items(
        db,
        public=True,
        category_id=category_id,
        search=search,
        vegetarian=vegetarian,
        available_only=available_only,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(items=[MenuItemOut.model_validate(i) for i in items], page=page, page_size=page_size, total=total)


@router.get("/menu-items/{item_id}", response_model=MenuItemOut, tags=["menu"])
def get_menu_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    return menu_service.get_menu_item(db, item_id, public=True)


# ---------- Cart (customers only) ----------
@router.get("/cart", response_model=CartOut, tags=["cart"])
def get_cart(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return cart_service.build_cart(db, user)


@router.post("/cart/items", response_model=CartOut, tags=["cart"])
def add_to_cart(body: CartAddIn, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return cart_service.add_item(db, user, body.menu_item_id, body.quantity)


@router.patch("/cart/items/{menu_item_id}", response_model=CartOut, tags=["cart"])
def update_cart_item(
    menu_item_id: uuid.UUID, body: CartUpdateIn, user: User = Depends(require_customer), db: Session = Depends(get_db)
):
    return cart_service.set_quantity(db, user, menu_item_id, body.quantity)


@router.delete("/cart/items/{menu_item_id}", response_model=CartOut, tags=["cart"])
def remove_cart_item(menu_item_id: uuid.UUID, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return cart_service.remove_item(db, user, menu_item_id)


@router.delete("/cart", response_model=CartOut, tags=["cart"])
def clear_cart(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return cart_service.clear(db, user)


# ---------- Orders ----------
@router.post("/orders", response_model=OrderOut, status_code=201, tags=["orders"])
def checkout(
    body: CheckoutIn,
    response: Response,
    key: uuid.UUID = Depends(get_idempotency_key),
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    order, created = order_service.checkout(db, user, key, body)
    if not created:
        response.status_code = 200
    return order_service.to_order_out(db, order, viewer=ActorRole.CUSTOMER)


@router.get("/orders", response_model=Page[OrderSummaryOut], tags=["orders"])
def my_orders(
    status: OrderStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    orders, total = order_service.list_customer_orders(db, user, status=status, page=page, page_size=page_size)
    return Page(items=[order_service.to_summary(o) for o in orders], page=page, page_size=page_size, total=total)


@router.get("/orders/{order_id}", response_model=OrderOut, tags=["orders"])
def my_order(order_id: uuid.UUID, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = order_service.get_customer_order(db, user, order_id)
    return order_service.to_order_out(db, order, viewer=ActorRole.CUSTOMER)


@router.post("/orders/{order_id}/cancel", response_model=CancelOut, tags=["orders"])
def cancel_my_order(
    order_id: uuid.UUID, body: CancelIn, user: User = Depends(require_customer), db: Session = Depends(get_db)
):
    order, restored, skipped = order_service.cancel_by_customer(db, user, order_id, body.restore_to_cart)
    return CancelOut(
        order=order_service.to_order_out(db, order, viewer=ActorRole.CUSTOMER), restored=restored, skipped=skipped
    )


# ---------- Payments ----------
@router.post("/orders/{order_id}/payments", response_model=PaymentResultOut, status_code=201, tags=["payments"])
def pay_order(
    order_id: uuid.UUID,
    body: PaymentIn,
    response: Response,
    key: uuid.UUID = Depends(get_idempotency_key),
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    payment, order, created = payment_service.pay(db, user, order_id, key, body)
    if not created:
        response.status_code = 200
    return PaymentResultOut(
        payment=PaymentOut.model_validate(payment),
        order=order_service.to_order_out(db, order, viewer=ActorRole.CUSTOMER),
    )


@router.get("/orders/{order_id}/payments", response_model=list[PaymentOut], tags=["payments"])
def list_payments(order_id: uuid.UUID, user: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = order_service.get_customer_order(db, user, order_id)
    return [PaymentOut.model_validate(p) for p in order.payments]
