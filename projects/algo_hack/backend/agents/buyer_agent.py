"""
Buyer Agent — AI agent representing the shipper.

Makes pricing decisions using live market data:
- Knows fair price = f(distance, weight, live diesel price)
- Starts by offering 18% below cheapest carrier quote
- Uses Gemini to generate natural negotiation messages
- Accepts when gap ≤ 8% or max 5 rounds
"""
from groq import AsyncGroq

from backend.config import settings
from backend.models import CarrierQuote, ShipmentIntent, LiveMarketData
from backend.services.fuel_service import BASELINE_DIESEL_INR

# Buyer strategy constants
INITIAL_DISCOUNT_PCT = 0.18   # Start 18% below cheapest quote
ACCEPT_GAP_PCT = 0.08         # Accept if within 8% of current counter
MAX_ROUNDS = 5


def compute_fair_price(market: LiveMarketData, intent: ShipmentIntent) -> float:
    """
    Buyer's internal fair price estimate based on live market data.
    Used to set negotiation floor — buyer won't go above max_budget.
    """
    fuel_adj = market.diesel_price_inr / BASELINE_DIESEL_INR
    # Industry standard: ~₹8/km/ton at baseline diesel
    weight_ton = max(intent.weight_kg / 1000, 0.05)
    fair = 8.0 * market.distance_km * weight_ton * fuel_adj
    return max(fair, 150)


def get_opening_offer(cheapest_quote: float) -> float:
    return round(cheapest_quote * (1 - INITIAL_DISCOUNT_PCT), 2)


def should_accept(buyer_current_offer: float, seller_counter: float) -> bool:
    if seller_counter <= 0:
        return False
    gap = (seller_counter - buyer_current_offer) / seller_counter
    return gap <= ACCEPT_GAP_PCT


def next_counter(current_buyer: float, seller_counter: float, round_num: int) -> float:
    """Step up buyer's offer progressively each round."""
    step = (seller_counter - current_buyer) * (0.3 + round_num * 0.1)
    return round(min(current_buyer + step, seller_counter), 2)


async def generate_negotiation_message(
    buyer_offer: float,
    seller_counter: float,
    round_num: int,
    intent: ShipmentIntent,
    market: LiveMarketData,
    accepting: bool,
) -> str:
    """Generate a natural buyer negotiation message using Gemini."""
    client = AsyncGroq(api_key=settings.groq_api_key)

    system = f"""You are a buyer agent for a logistics company negotiating a freight deal.
You represent a shipper trying to get the best rate for their cargo.

Context:
- Shipment: {intent.weight_kg}kg from {market.origin_city} to {market.destination_city}
- Distance: {market.distance_km} km
- Live diesel: ₹{market.diesel_price_inr}/litre
- Your current offer: ₹{buyer_offer:.0f}
- Carrier's counter: ₹{seller_counter:.0f}
- Round: {round_num}
- Accepting this round: {accepting}

Write a professional, concise (max 50 words) negotiation message from the buyer's perspective.
If accepting, express satisfaction and confirm the deal.
If countering, justify your offer mentioning market rates or fuel prices.
Return ONLY the message text, no JSON.
"""

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": "Generate the buyer's next negotiation message."},
            ],
            temperature=0.7,
            max_tokens=128,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        if accepting:
            return f"Deal agreed at ₹{seller_counter:.0f}. Ready to proceed with escrow lock."
        return (
            f"Based on current diesel at ₹{market.diesel_price_inr}/L and "
            f"{market.distance_km}km distance, I can offer ₹{buyer_offer:.0f}."
        )
