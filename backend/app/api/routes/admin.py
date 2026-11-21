"""Staff and admin routes. Every route here requires STAFF or ADMIN; most require ADMIN."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_staff
from app.db.session import get_db
from app.models import ActorRole, OrderStatus, User
from app.schemas.auth import StaffCreateIn, StaffUpdateIn, UserOut
from app.schemas.common import Page
from app.schemas.dashboard import DashboardStats
from app.schemas.menu import (
    AvailabilityIn,
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    DeleteResult,
    MenuItemCreateIn,
    MenuItemOut,
    MenuItemUpdateIn,
    MenuSort,
    UploadOut,
)
from app.schemas.order import AdminCancelIn, OrderOut, OrderSummaryOut, StatusChangeIn
from app.schemas.restaurant import RestaurantOut, RestaurantStatusIn, RestaurantUpdateIn
from app.services import (
    auth_service,
    dashboard_service,
    menu_service,
    order_service,
    restaurant_service,
    upload_service,
)
from app.services.order_service import actor_role_for

router = APIRouter(prefix="/admin")


# ---------- Restaurant settings (admin) ----------
@router.get("/restaurant", response_model=RestaurantOut, tags=["admin: restaurant"])
def get_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return restaurant_service.get_settings(db)


@router.patch("/restaurant", response_model=RestaurantOut, tags=["admin: restaurant"])
def update_settings(body: RestaurantUpdateIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return restaurant_service.update_settings(db, body, user.id)


@router.put("/restaurant/status", response_model=RestaurantOut, tags=["admin: restaurant"])
def set_status(body: RestaurantStatusIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return restaurant_service.set_open(db, body.is_open, user.id)


# ---------- Categories (admin) ----------
@router.get("/categories", response_model=list[CategoryOut], tags=["admin: menu"])
def list_categories(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.list_categories(db, include_inactive=True)


@router.post("/categories", response_model=CategoryOut, status_code=201, tags=["admin: menu"])
def create_category(body: CategoryCreateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.create_category(db, body)


@router.patch("/categories/{category_id}", response_model=CategoryOut, tags=["admin: menu"])
def update_category(
    category_id: uuid.UUID, body: CategoryUpdateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return menu_service.update_category(db, category_id, body)


@router.delete("/categories/{category_id}", response_model=DeleteResult, tags=["admin: menu"])
def delete_category(category_id: uuid.UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.delete_category(db, category_id)


# ---------- Menu items (admin) ----------
@router.get("/menu-items", response_model=Page[MenuItemOut], tags=["admin: menu"])
def list_menu_items(
    category_id: uuid.UUID | None = None,
    search: str | None = Query(default=None, max_length=100),
    is_available: bool | None = None,
    include_archived: bool = False,
    sort: MenuSort = "name",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    items, total = menu_service.list_menu_items(
        db,
        public=False,
        category_id=category_id,
        search=search,
        is_available=is_available,
        include_archived=include_archived,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(items=[MenuItemOut.model_validate(i) for i in items], page=page, page_size=page_size, total=total)


@router.get("/menu-items/{item_id}", response_model=MenuItemOut, tags=["admin: menu"])
def get_menu_item(item_id: uuid.UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.get_menu_item(db, item_id, public=False)


@router.post("/menu-items", response_model=MenuItemOut, status_code=201, tags=["admin: menu"])
def create_menu_item(body: MenuItemCreateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.create_menu_item(db, body)


@router.patch("/menu-items/{item_id}", response_model=MenuItemOut, tags=["admin: menu"])
def update_menu_item(
    item_id: uuid.UUID, body: MenuItemUpdateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return menu_service.update_menu_item(db, item_id, body)


@router.put("/menu-items/{item_id}/availability", response_model=MenuItemOut, tags=["admin: menu"])
def set_availability(
    item_id: uuid.UUID, body: AvailabilityIn, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return menu_service.set_availability(db, item_id, body.is_available)


@router.delete("/menu-items/{item_id}", response_model=DeleteResult, tags=["admin: menu"])
def delete_menu_item(item_id: uuid.UUID, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return menu_service.delete_menu_item(db, item_id)


@router.post("/uploads/images", response_model=UploadOut, status_code=201, tags=["admin: menu"])
async def upload_image(file: UploadFile = File(...), _: User = Depends(require_admin)):
    return UploadOut(url=await upload_service.save_image(file))


# ---------- Orders (staff + admin) ----------
@router.get("/orders", response_model=Page[OrderSummaryOut], tags=["admin: orders"])
def list_orders(
    status: list[OrderStatus] | None = Query(default=None),
    include_unpaid: bool = False,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    search: str | None = Query(default=None, max_length=100),
    sort: str = Query(default="oldest", pattern="^(oldest|newest)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    orders, total = order_service.admin_list_orders(
        db,
        statuses=status,
        include_unpaid=include_unpaid or bool(status and OrderStatus.PENDING_PAYMENT in status),
        date_from=date_from,
        date_to=date_to,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[order_service.to_summary(o, with_customer=True) for o in orders],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/orders/{order_id}", response_model=OrderOut, tags=["admin: orders"])
def get_order(order_id: uuid.UUID, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    order = order_service.admin_get_order(db, order_id)
    return order_service.to_order_out(db, order, viewer=actor_role_for(user))


@router.post("/orders/{order_id}/status", response_model=OrderOut, tags=["admin: orders"])
def change_status(
    order_id: uuid.UUID, body: StatusChangeIn, user: User = Depends(require_staff), db: Session = Depends(get_db)
):
    order = order_service.admin_change_status(db, user, order_id, body.to_status, body.note)
    return order_service.to_order_out(db, order, viewer=actor_role_for(user))


@router.post("/orders/{order_id}/cancel", response_model=OrderOut, tags=["admin: orders"])
def cancel_order(
    order_id: uuid.UUID, body: AdminCancelIn, user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    order = order_service.admin_cancel(db, user, order_id, body.reason)
    return order_service.to_order_out(db, order, viewer=ActorRole.ADMIN)


# ---------- Dashboard (admin) ----------
@router.get("/dashboard/stats", response_model=DashboardStats, tags=["admin: dashboard"])
def stats(
    day: date | None = Query(default=None, alias="date"),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return dashboard_service.get_stats(db, day)


# ---------- Staff accounts (admin) ----------
@router.get("/staff", response_model=list[UserOut], tags=["admin: staff"])
def list_staff(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return auth_service.list_staff(db)


@router.post("/staff", response_model=UserOut, status_code=201, tags=["admin: staff"])
def create_staff(body: StaffCreateIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return auth_service.create_staff(db, body)


@router.patch("/staff/{user_id}", response_model=UserOut, tags=["admin: staff"])
def update_staff(
    user_id: uuid.UUID, body: StaffUpdateIn, user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return auth_service.set_staff_active(db, user_id, body.is_active, user)
