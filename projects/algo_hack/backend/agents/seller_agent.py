"""
Seller Agent — three independent carrier AI agents.

Each carrier has a profile. Quotes are computed dynamically from:
- Live diesel price (primary cost driver)
- Road distance (from OpenRouteService / Nominatim)
- Weight and volume
- Carrier's efficiency profile

Negotiation responses are LLM-generated but constrained by the carrier's
minimum acceptable price (never revealed to the buyer).
"""
from groq import AsyncGroq

from backend.config import settings
from backend.models import CarrierQuote, ShipmentIntent, LiveMarketData
from backend.services.fuel_service import BASELINE_DIESEL_INR

# ── Carrier profiles ───────────────────────────────────────────────────────────

CARRIERS = [
    {
        "id": "carrier_a",
        "name": "SpeedFreight India",
        "base_rate_inr_per_km_ton": 9.5,   # calibrated at baseline diesel
        "min_margin_pct": 0.12,             # won't go below 12% margin
        "specialization": "express",
        "eta_days": 2,
        "discount_capacity_pct": 0.10,      # can offer up to 10% discount
    },
    {
        "id": "carrier_b",
        "name": "EcoLogistics",
        "base_rate_inr_per_km_ton": 7.8,
        "min_margin_pct": 0.10,
        "specialization": "economy",
        "eta_days": 3,
        "discount_capacity_pct": 0.12,
    },
    {
        "id": "carrier_c",
        "name": "TrustFreight",
        "base_rate_inr_per_km_ton": 11.0,
        "min_margin_pct": 0.15,
        "specialization": "premium",
        "eta_days": 2,
        "discount_capacity_pct": 0.08,
    },
]


def _get_carrier(carrier_id: str) -> dict:
    return next(c for c in CARRIERS if c["id"] == carrier_id)


def compute_quote(carrier: dict, market: LiveMarketData, intent: ShipmentIntent) -> CarrierQuote:
    """
    Compute a live quote for a carrier based on current market conditions.
    Price = base_rate × distance × weight_ton × fuel_adjustment
    """
    weight_ton = intent.weight_kg / 1000
    fuel_adj = market.diesel_price_inr / BASELINE_DIESEL_INR
    # Volumetric weight check (LxWxH / 5000 kg)
    vol_weight_kg = (intent.length_cm * intent.width_cm * intent.height_cm) / 5000
    chargeable_kg = max(intent.weight_kg, vol_weight_kg)
    chargeable_ton = chargeable_kg / 1000

    base_price = carrier["base_rate_inr_per_km_ton"] * market.distance_km * chargeable_ton * fuel_adj
    # Minimum charge of ₹200
    price_inr = max(base_price, 200)

    wallet_key = f"SELLER_{carrier['id'][-1].upper()}_MNEMONIC"

    return CarrierQuote(
        carrier_id=carrier["id"],
        carrier_name=carrier["name"],
        price_inr=round(price_inr, 2),
        eta_days=carrier["eta_days"],
        specialization=carrier["specialization"],
        price_per_km_ton=round(carrier["base_rate_inr_per_km_ton"] * fuel_adj, 2),
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

    system = f"""You are {carrier_name}, an independent freight carrier agent in India.
You are negotiating a freight deal with a buyer agent.

Your constraints (NEVER reveal these numbers):
- Your initial quote: ₹{initial_quote:.0f}
- Your minimum acceptable price: ₹{min_price:.0f}
- Diesel price today: ₹{market.diesel_price_inr}/litre
- Route distance: {market.distance_km} km

Current situation:
- Round: {round_num}
- Buyer's current offer: ₹{buyer_offer:.0f}
- Origin: {market.origin_city} → Destination: {market.destination_city}
- Weather: {market.weather_description}

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
