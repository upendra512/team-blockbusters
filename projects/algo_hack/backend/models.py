from pydantic import BaseModel
from typing import Optional


# ── Chat / Intent ─────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str          # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: str

class ChatResponse(BaseModel):
    reply: str
    session_id: str
    shipment_ready: bool = False        # True when all info collected
    shipment_intent: Optional["ShipmentIntent"] = None


# ── Shipment ──────────────────────────────────────────────────────────────────

class ShipmentIntent(BaseModel):
    user_type: str                      # "business" | "individual"
    origin_pincode: str
    destination_pincode: str
    weight_kg: float
    length_cm: float
    width_cm: float
    height_cm: float
    package_type: str                   # clothing, electronics, documents, etc.
    pickup_date: str                    # ISO date string
    max_budget_inr: float


# ── Carrier / Quotes ──────────────────────────────────────────────────────────

class LiveMarketData(BaseModel):
    distance_km: float
    diesel_price_inr: float
    weather_description: str
    origin_city: str
    destination_city: str
    algo_inr_rate: float                # live ALGO/INR from CoinGecko

class CarrierQuote(BaseModel):
    carrier_id: str
    carrier_name: str
    price_inr: float
    eta_days: int
    specialization: str
    price_per_km_ton: float             # computed from live diesel price
    wallet_address: str

class QuotesResponse(BaseModel):
    quotes: list[CarrierQuote]
    market_data: LiveMarketData
    buyer_analysis: str                 # LLM note on best choice


# ── Negotiation ───────────────────────────────────────────────────────────────

class NegotiationMessage(BaseModel):
    round: int
    sender: str                         # "buyer" | "seller" | "system"
    carrier_id: Optional[str] = None
    offer_price_inr: Optional[float] = None
    content: str
    status: str                         # "offer" | "counter" | "accept" | "info"

class NegotiationResult(BaseModel):
    agreed: bool
    final_price_inr: float
    final_price_algo: float
    winning_carrier: CarrierQuote
    rounds: int
    messages: list[NegotiationMessage]


# ── Escrow ────────────────────────────────────────────────────────────────────

class EscrowCreateRequest(BaseModel):
    session_id: str
    negotiation_result: NegotiationResult
    shipment_intent: ShipmentIntent

class EscrowCreateResponse(BaseModel):
    app_id: int
    app_address: str
    amount_micro_algo: int
    amount_algo: float
    deploy_tx_id: str
    fund_tx_id: str
    deal_tx_id: str
    explorer_url: str
    status: str = "LOCKED"


# ── Delivery ──────────────────────────────────────────────────────────────────

class DeliveryReceipt(BaseModel):
    truck_number: str                   # Indian format: AA00AA0000
    driver_name: str
    carrier_name: str
    pickup_timestamp: str              # ISO datetime
    origin_pincode: str
    destination_pincode: str
    weight_kg: float
    route_distance_km: float
    estimated_delivery: str            # ISO datetime
    agreed_price_inr: float

class DeliverRequest(BaseModel):
    app_id: int
    carrier_id: str
    shipment_intent: ShipmentIntent
    negotiation_result: NegotiationResult

class DeliverResponse(BaseModel):
    delivery_receipt: DeliveryReceipt
    delivery_hash: str
    tx_id: str
    explorer_url: str


# ── Verification ──────────────────────────────────────────────────────────────

class VerificationCheck(BaseModel):
    name: str
    passed: bool
    expected: str
    actual: str

class VerificationResult(BaseModel):
    passed: bool
    score: int                         # out of 5
    checks: list[VerificationCheck]
    summary: str

class VerifyReleaseRequest(BaseModel):
    app_id: int
    delivery_receipt: DeliveryReceipt
    shipment_intent: ShipmentIntent
    negotiation_result: NegotiationResult
    market_data: LiveMarketData

class VerifyReleaseResponse(BaseModel):
    verification: VerificationResult
    released: bool
    release_tx_id: Optional[str] = None
    refund_tx_id: Optional[str] = None
    explorer_url: Optional[str] = None


# ── Escrow Status ─────────────────────────────────────────────────────────────

class EscrowStatus(BaseModel):
    app_id: int
    status_code: int
    status_label: str
    amount_micro_algo: int
    buyer_address: str
    seller_address: str
