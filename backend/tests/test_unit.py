"""Pure unit tests: pricing, state machine, simulated gateway, card validation."""

from decimal import Decimal

import pytest

from app.core.exceptions import Conflict, Forbidden
from app.models.enums import ActorRole, OrderStatus, OrderType, PaymentMethod
from app.schemas.order import luhn_valid
from app.services import order_state_machine as sm
from app.services.payment_gateway import SimulatedGateway
from app.services.pricing import compute_totals, line_total

S, A = OrderStatus, ActorRole


# ---------- Pricing ----------
def test_line_total_uses_decimal():
    assert line_total(Decimal("249.00"), 3) == Decimal("747.00")


def test_totals_pickup_has_no_delivery_fee():
    t = compute_totals(
        [(Decimal("249.00"), 2), (Decimal("129.00"), 1)], Decimal("0.05"), Decimal("40"), OrderType.PICKUP
    )
    assert t.subtotal == Decimal("627.00")
    assert t.tax_amount == Decimal("31.35")
    assert t.delivery_fee == Decimal("0.00")
    assert t.total == Decimal("658.35")


def test_totals_delivery_adds_fee():
    t = compute_totals([(Decimal("100.00"), 1)], Decimal("0.05"), Decimal("40"), OrderType.DELIVERY)
    assert (t.subtotal, t.tax_amount, t.delivery_fee, t.total) == (
        Decimal("100.00"),
        Decimal("5.00"),
        Decimal("40.00"),
        Decimal("145.00"),
    )


def test_tax_rounds_half_up():
    # 10.10 * 0.05 = 0.505 -> 0.51 (half-up), not banker's rounding 0.50
    t = compute_totals([(Decimal("10.10"), 1)], Decimal("0.05"), Decimal("0"), OrderType.PICKUP)
    assert t.tax_amount == Decimal("0.51")


# ---------- State machine ----------
VALID = [
    (S.PENDING_PAYMENT, S.PLACED, A.SYSTEM),
    (S.PENDING_PAYMENT, S.CANCELLED, A.CUSTOMER),
    (S.PLACED, S.PREPARING, A.STAFF),
    (S.PREPARING, S.READY, A.STAFF),
    (S.READY, S.DELIVERED, A.STAFF),
    (S.PLACED, S.CANCELLED, A.ADMIN),
    (S.PREPARING, S.CANCELLED, A.ADMIN),
]


@pytest.mark.parametrize("frm,to,actor", VALID)
def test_valid_transitions(frm, to, actor):
    sm.assert_transition(frm, to, actor)


INVALID_PAIRS = [(frm, to) for frm in S for to in S if (frm, to) not in sm.TRANSITIONS]


@pytest.mark.parametrize("frm,to", INVALID_PAIRS)
def test_every_unlisted_transition_is_rejected(frm, to):
    with pytest.raises(Conflict) as exc:
        sm.assert_transition(frm, to, A.ADMIN)
    assert exc.value.code == "INVALID_STATUS_TRANSITION"


def test_placed_only_reachable_by_system():
    for actor in (A.CUSTOMER, A.STAFF, A.ADMIN):
        with pytest.raises(Conflict):
            sm.assert_transition(S.PENDING_PAYMENT, S.PLACED, actor)


def test_staff_cannot_cancel_paid_orders():
    with pytest.raises(Forbidden):
        sm.assert_transition(S.PLACED, S.CANCELLED, A.STAFF)


def test_terminal_states_have_no_exits():
    for actor in A:
        assert sm.allowed_targets(S.DELIVERED, actor) == []
        assert sm.allowed_targets(S.CANCELLED, actor) == []


# ---------- Gateway ----------
@pytest.mark.parametrize(
    "card,simulate,ok",
    [
        ("4242424242424242", None, True),
        ("4000000000000002", None, False),
        ("4000000000000069", None, False),
        ("4242424242424242", "FAILURE", False),
    ],
)
def test_simulated_gateway_is_deterministic(card, simulate, ok):
    r = SimulatedGateway().charge(Decimal("10"), "INR", PaymentMethod.CARD, card_number=card, simulate=simulate)
    assert r.success is ok
    assert (r.reference is not None) is ok
    assert (r.failure_reason is None) is ok


def test_upi_failure_id():
    gw = SimulatedGateway()
    assert gw.charge(Decimal("1"), "INR", PaymentMethod.UPI, upi_id="fail@sim").success is False
    assert gw.charge(Decimal("1"), "INR", PaymentMethod.UPI, upi_id="riya@okbank").success is True


def test_luhn():
    assert luhn_valid("4242424242424242")
    assert not luhn_valid("4242424242424241")
