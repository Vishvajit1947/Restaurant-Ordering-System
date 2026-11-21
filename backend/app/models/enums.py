import enum

from sqlalchemy import Enum as SAEnum


class UserRole(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    STAFF = "STAFF"
    ADMIN = "ADMIN"


class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PLACED = "PLACED"
    PREPARING = "PREPARING"
    READY = "READY"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class PaymentMethod(str, enum.Enum):
    CARD = "CARD"
    UPI = "UPI"


class OrderType(str, enum.Enum):
    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class ActorRole(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    STAFF = "STAFF"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e], validate_strings=True)


user_role_enum = pg_enum(UserRole, "user_role")
order_status_enum = pg_enum(OrderStatus, "order_status")
payment_status_enum = pg_enum(PaymentStatus, "payment_status")
payment_method_enum = pg_enum(PaymentMethod, "payment_method")
order_type_enum = pg_enum(OrderType, "order_type")
