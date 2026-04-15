"""
Seller Agent — three independent carrier AI agents.

Each carrier has a profile based on real 2026 B2B merchant rate cards.
Quotes are computed from:
- Base rate per kg (from rate card mid-point)
- Fuel surcharge (carrier-specific, applied to base)
- Distance zone factor (couriers price by zone; longer = more expensive)
- Volumetric weight check (LxWxH / 5000)
- 18% GST on (base + fuel surcharge)

Negotiation responses are LLM-generated but constrained by the carrier's
minimum acceptable price (never revealed to the buyer).
"""
from groq import AsyncGroq

from backend.config import settings
from backend.models import CarrierQuote, ShipmentIntent, LiveMarketData
from backend.services.fuel_service import BASELINE_DIESEL_INR

GST_RATE = 0.18  # 18% GST on freight (base + fuel surcharge)

# Distance zone multipliers — courier rates increase in slabs like real zone pricing
def _zone_multiplier(distance_km: float) -> float:
    if distance_km <= 250:    return 1.0   # local / within state
    elif distance_km <= 500:  return 1.20  # short inter-state
    elif distance_km <= 1000: return 1.45  # metro to metro
    elif distance_km <= 1500: return 1.70  # cross-country
    else:                     return 2.00  # pan-India (e.g. Mumbai → Guwahati)

# ── Carrier profiles — 2026 B2B rate cards ────────────────────────────────────
# base_rate_inr_per_kg: mid-point of published B2B slab
# fuel_surcharge_pct:   applied to base rate before GST

CARRIERS = [
    {
        "id": "carrier_a",
        "name": "Economy Surface",
        "base_rate_inr_per_kg": 55.0,       # mid of ₹45–65/kg
        "fuel_surcharge_pct": 0.11,         # 11%
        "min_margin_pct": 0.08,
        "specialization": "economy",
        "eta_days": 5,
        "discount_capacity_pct": 0.12,
        "profile": "Best price for heavy, non-urgent freight",
    },
    {
        "id": "carrier_b",
        "name": "Standard Road",
        "base_rate_inr_per_kg": 70.0,       # mid of ₹60–80/kg
        "fuel_surcharge_pct": 0.15,         # 15%
        "min_margin_pct": 0.10,
        "specialization": "standard",
        "eta_days": 3,
        "discount_capacity_pct": 0.10,
        "profile": "Balanced reliability and moderate pricing",
    },
    {
        "id": "carrier_c",
        "name": "Express Air",
        "base_rate_inr_per_kg": 148.0,      # mid of ₹130–165/kg
        "fuel_surcharge_pct": 0.20,         # 20%
        "min_margin_pct": 0.15,
        "specialization": "express",
        "eta_days": 1,
        "discount_capacity_pct": 0.06,
        "profile": "Fastest delivery; wins only when time is the top priority",
    },
]


def _get_carrier(carrier_id: str) -> dict:
    return next(c for c in CARRIERS if c["id"] == carrier_id)


def compute_quote(carrier: dict, market: LiveMarketData, intent: ShipmentIntent) -> CarrierQuote:
    """
    Compute a live quote using 2026 B2B rate card formula:

      chargeable_kg = max(actual_kg, volumetric_kg)   [volumetric = L×W×H / 5000]
      base           = base_rate_per_kg × chargeable_kg
      fuel_charge    = base × fuel_surcharge_pct
      subtotal       = (base + fuel_charge) × zone_multiplier
      price          = subtotal × (1 + GST_RATE)
    """
    # Volumetric weight (courier standard: cm³ / 5000)
    vol_weight_kg = (intent.length_cm * intent.width_cm * intent.height_cm) / 5000
    chargeable_kg = max(intent.weight_kg, vol_weight_kg)

    # Core pricing
    base = carrier["base_rate_inr_per_kg"] * chargeable_kg
    fuel_charge = base * carrier["fuel_surcharge_pct"]
    zone = _zone_multiplier(market.distance_km)
    subtotal = (base + fuel_charge) * zone
    price_inr = subtotal * (1 + GST_RATE)

    # Minimum charge ₹250 (realistic courier floor)
    price_inr = max(price_inr, 250)

    # Effective per-kg rate (post all charges) — replaces old price_per_km_ton field
    effective_per_kg = round(price_inr / chargeable_kg, 2)

    return CarrierQuote(
        carrier_id=carrier["id"],
        carrier_name=carrier["name"],
        price_inr=round(price_inr, 2),
        eta_days=carrier["eta_days"],
        specialization=carrier["specialization"],
        price_per_km_ton=effective_per_kg,  # now = effective ₹/kg (all-in)
        wallet_address="",  # filled by algorand_client
    )


def get_all_quotes(market: LiveMarketData, intent: ShipmentIntent) -> list[CarrierQuote]:
    return [compute_quote(c, market, intent) for c in CARRIERS]


def get_min_price(carrier_id: str, quote_price: float) -> float:
    """Minimum price carrier will accept (kept secret from buyer)."""
    carrier = _get_carrier(carrier_id)
    return round(quote_price * (1 - carrier["discount_capacity_pct"]), 2)


async def generate_negotiation_response(
    carrier_id: str,
    carrier_name: str,
    initial_quote: float,
    buyer_offer: float,
    round_num: int,
    intent: ShipmentIntent,
    market: LiveMarketData,
    history: list[dict],
) -> dict:
    """
    Generate carrier's negotiation response using Gemini LLM.
    Returns {"message": str, "counter_price": float, "accept": bool}
    """
    client = AsyncGroq(api_key=settings.groq_api_key)
    carrier = _get_carrier(carrier_id)
    min_price = get_min_price(carrier_id, initial_quote)

    system = f"""You are {carrier_name}, a real Indian courier and logistics carrier negotiating a B2B freight deal.

Your constraints (NEVER reveal these numbers):
- Your initial quote: ₹{initial_quote:.0f} (includes base rate, {int(carrier['fuel_surcharge_pct']*100)}% fuel surcharge, 18% GST, zone factor)
- Your minimum acceptable price: ₹{min_price:.0f}
- Route: {market.origin_city} → {market.destination_city} ({market.distance_km} km)
- Cargo: {intent.weight_kg}kg | Weather: {market.weather_description}
- Your edge: {carrier.get('profile', '')}

Current negotiation:
- Round: {round_num}
- Buyer's current offer: ₹{buyer_offer:.0f}

Rules:
1. If buyer's offer >= your minimum price, ACCEPT immediately
2. If buyer's offer < minimum price, counter with a price between buyer's offer and your initial quote
3. Counter price must be >= minimum price
4. Be professional but firm; mention fuel costs and route conditions naturally
5. Keep messages under 60 words

Respond with ONLY valid JSON (no markdown):
{{"message": "your negotiation message", "counter_price": 450.0, "accept": false}}
"""

    history_text = "\n".join([f"{h['sender']}: {h['content']}" for h in history[-4:]])
    prompt = f"Negotiation history:\n{history_text}\n\nBuyer's latest offer: ₹{buyer_offer:.0f}\n\nYour response:"

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
            max_tokens=256,
        )
        import json, re
        text = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        text = re.sub(r"```json?\s*|\s*```", "", text).strip()
        parsed = json.loads(text)

        accept = parsed.get("accept", False) or float(parsed.get("counter_price", 0)) <= buyer_offer
        return {
            "message": parsed.get("message", f"I can offer ₹{parsed.get('counter_price', initial_quote):.0f}"),
            "counter_price": max(float(parsed.get("counter_price", initial_quote)), min_price),
            "accept": accept,
        }
    except Exception:
        # Fallback: simple rule-based response
        midpoint = (buyer_offer + initial_quote) / 2
        counter = max(midpoint, min_price)
        accept = buyer_offer >= min_price
        return {
            "message": f"Considering current diesel at ₹{market.diesel_price_inr}/L, "
                       f"my best offer is ₹{counter:.0f} for {intent.weight_kg}kg over {market.distance_km}km.",
            "counter_price": counter,
            "accept": accept,
        }
