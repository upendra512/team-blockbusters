"""
Verification Module — programmatic delivery receipt checker.

No LLM required. Each check is deterministic:
1. Truck number format valid (Indian RTO format)
2. Pickup timestamp after escrow creation
3. Route distance matches live OpenRouteService ±15%
4. Origin + destination pincodes match agreed shipment
5. Agreed price matches the escrow amount ±1%
"""
import re
from datetime import datetime

from backend.models import (
    DeliveryReceipt, ShipmentIntent, NegotiationResult,
    LiveMarketData, VerificationCheck, VerificationResult,
)

# Indian RTO vehicle registration: AA00AA0000 or AA00A0000
TRUCK_NUMBER_RE = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$")


def verify_delivery(
    receipt: DeliveryReceipt,
    intent: ShipmentIntent,
    result: NegotiationResult,
    market: LiveMarketData,
    escrow_created_at: str,  # ISO datetime string
) -> VerificationResult:
    checks: list[VerificationCheck] = []

    # ── Check 1: Truck number format ─────────────────────────────────────────
    truck_clean = receipt.truck_number.upper().replace("-", "").replace(" ", "")
    truck_valid = bool(TRUCK_NUMBER_RE.match(truck_clean))
    checks.append(VerificationCheck(
        name="Truck Number Format",
        passed=truck_valid,
        expected="Indian RTO format (e.g. MH04AB1234)",
        actual=receipt.truck_number,
    ))

    # ── Check 2: Pickup after escrow lock ────────────────────────────────────
    try:
        pickup_dt = datetime.fromisoformat(receipt.pickup_timestamp)
        escrow_dt = datetime.fromisoformat(escrow_created_at)
        time_valid = pickup_dt >= escrow_dt
    except Exception:
        time_valid = False
    checks.append(VerificationCheck(
        name="Pickup After Escrow Lock",
        passed=time_valid,
        expected=f"Pickup >= {escrow_created_at}",
        actual=receipt.pickup_timestamp,
    ))

    # ── Check 3: Route distance within 15% of live data ──────────────────────
    live_dist = market.distance_km
    receipt_dist = receipt.route_distance_km
    dist_tolerance = live_dist * 0.15
    dist_valid = abs(receipt_dist - live_dist) <= dist_tolerance
    checks.append(VerificationCheck(
        name="Route Distance Match",
        passed=dist_valid,
        expected=f"{live_dist} km ±15% (range: {live_dist - dist_tolerance:.0f}–{live_dist + dist_tolerance:.0f})",
        actual=f"{receipt_dist} km",
    ))

    # ── Check 4: Pincodes match agreed shipment ──────────────────────────────
    pincode_valid = (
        receipt.origin_pincode == intent.origin_pincode and
        receipt.destination_pincode == intent.destination_pincode
    )
    checks.append(VerificationCheck(
        name="Origin & Destination Pincodes",
        passed=pincode_valid,
        expected=f"{intent.origin_pincode} → {intent.destination_pincode}",
        actual=f"{receipt.origin_pincode} → {receipt.destination_pincode}",
    ))

    # ── Check 5: Price matches agreed amount ±1% ────────────────────────────
    agreed = result.final_price_inr
    receipt_price = receipt.agreed_price_inr
    price_valid = abs(receipt_price - agreed) / agreed <= 0.01
    checks.append(VerificationCheck(
        name="Agreed Price Match",
        passed=price_valid,
        expected=f"₹{agreed:.2f} ±1%",
        actual=f"₹{receipt_price:.2f}",
    ))

    passed_count = sum(1 for c in checks if c.passed)
    all_passed = passed_count == len(checks)

    if all_passed:
        summary = f"All {len(checks)} checks passed ✓ — Payment release authorised."
    else:
        failed = [c.name for c in checks if not c.passed]
        summary = f"{passed_count}/{len(checks)} checks passed. Failed: {', '.join(failed)}. Refund triggered."

    return VerificationResult(
        passed=all_passed,
        score=passed_count,
        checks=checks,
        summary=summary,
    )
