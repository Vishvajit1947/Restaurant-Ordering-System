"""Simulated payment gateway. Deterministic, so demos and tests are repeatable.

Outcome rules:
  * simulate="FAILURE"                -> declined
  * card number ending in 0002        -> "Card declined by issuer"
  * card number ending in 0069        -> "Card expired"
  * card number ending in 9995        -> "Insufficient funds"
  * UPI id "fail@sim" (any case)      -> "UPI request declined"
  * anything else                     -> success
"""

import secrets
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.models.enums import PaymentMethod

CARD_FAILURES = {
    "0002": "Card declined by issuer (simulated)",
    "0069": "Card expired (simulated)",
    "9995": "Insufficient funds (simulated)",
}


@dataclass(frozen=True)
class ChargeResult:
    success: bool
    reference: str | None
    failure_reason: str | None


class PaymentGateway(Protocol):
    def charge(
        self,
        amount: Decimal,
        currency: str,
        method: PaymentMethod,
        card_number: str | None = None,
        upi_id: str | None = None,
        simulate: str | None = None,
    ) -> ChargeResult: ...


class SimulatedGateway:
    def charge(
        self,
        amount: Decimal,
        currency: str,
        method: PaymentMethod,
        card_number: str | None = None,
        upi_id: str | None = None,
        simulate: str | None = None,
    ) -> ChargeResult:
        if simulate == "FAILURE":
            return ChargeResult(False, None, "Payment declined (simulated failure)")
        if method == PaymentMethod.CARD and card_number:
            reason = CARD_FAILURES.get(card_number[-4:])
            if reason:
                return ChargeResult(False, None, reason)
        if method == PaymentMethod.UPI and upi_id and upi_id.lower() == "fail@sim":
            return ChargeResult(False, None, "UPI request declined (simulated)")
        return ChargeResult(True, f"SIM-{secrets.token_hex(8).upper()}", None)


gateway: PaymentGateway = SimulatedGateway()
