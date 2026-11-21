"""The single source of truth for order status transitions (rule 13)."""

from app.core.exceptions import Conflict, Forbidden
from app.models.enums import ActorRole, OrderStatus

S = OrderStatus
A = ActorRole

# (from, to) -> roles allowed to perform it
TRANSITIONS: dict[tuple[OrderStatus, OrderStatus], frozenset[ActorRole]] = {
    (S.PENDING_PAYMENT, S.PLACED): frozenset({A.SYSTEM}),  # only via a successful payment
    (S.PENDING_PAYMENT, S.CANCELLED): frozenset({A.CUSTOMER, A.ADMIN, A.SYSTEM}),
    (S.PLACED, S.PREPARING): frozenset({A.STAFF, A.ADMIN}),
    (S.PLACED, S.CANCELLED): frozenset({A.ADMIN}),
    (S.PREPARING, S.READY): frozenset({A.STAFF, A.ADMIN}),
    (S.PREPARING, S.CANCELLED): frozenset({A.ADMIN}),
    (S.READY, S.DELIVERED): frozenset({A.STAFF, A.ADMIN}),
}

TERMINAL = frozenset({S.DELIVERED, S.CANCELLED})
ACTIVE_KITCHEN = (S.PLACED, S.PREPARING, S.READY)


def allowed_targets(current: OrderStatus, actor: ActorRole) -> list[OrderStatus]:
    return [to for (frm, to), roles in TRANSITIONS.items() if frm == current and actor in roles]


def assert_transition(current: OrderStatus, target: OrderStatus, actor: ActorRole) -> None:
    roles = TRANSITIONS.get((current, target))
    if roles is None:
        allowed = [to.value for (frm, to) in TRANSITIONS if frm == current]
        raise Conflict(
            f"Cannot change an order from {current.value} to {target.value}.",
            code="INVALID_STATUS_TRANSITION",
            details={"from": current.value, "to": target.value, "allowed": allowed},
        )
    if roles == {A.SYSTEM} and actor != A.SYSTEM:
        raise Conflict(
            f"An order becomes {target.value} only through a successful payment.",
            code="INVALID_STATUS_TRANSITION",
            details={"from": current.value, "to": target.value, "allowed": []},
        )
    if actor not in roles:
        raise Forbidden(
            f"Your role cannot change an order from {current.value} to {target.value}.",
            details={"from": current.value, "to": target.value},
        )
