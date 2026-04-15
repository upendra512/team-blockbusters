"""
Negotiation Orchestrator — runs the full buyer ↔ seller negotiation.

Yields NegotiationMessage events for SSE streaming.
The buyer starts below the cheapest quote; both sides converge via LLM responses.
Max 5 rounds before forcing a deal at the current midpoint.
"""
import asyncio
from typing import AsyncGenerator

from backend.models import (
    CarrierQuote, ShipmentIntent, LiveMarketData,
    NegotiationMessage, NegotiationResult,
)
from backend.agents import buyer_agent, seller_agent
from backend.services.coingecko_service import inr_to_micro_algo


async def run_negotiation(
    quotes: list[CarrierQuote],
    intent: ShipmentIntent,
    market: LiveMarketData,
) -> AsyncGenerator[NegotiationMessage, None]:
    """
    Async generator that yields NegotiationMessage objects as the negotiation progresses.
    The last message will have status="accept" and carry the final agreed price.

    Usage:
        async for msg in run_negotiation(quotes, intent, market):
            yield msg  # stream to frontend via SSE
    """
    # Select target carrier based on buyer's delivery priority
    sorted_by_price = sorted(quotes, key=lambda q: q.price_inr)
    priority = getattr(intent, "delivery_priority", "cheapest")

    if priority == "fastest":
        # Pick the carrier with shortest ETA; break ties by price
        target = min(quotes, key=lambda q: (q.eta_days, q.price_inr))
    elif priority == "balanced":
        # Pick the middle-price option
        target = sorted_by_price[len(sorted_by_price) // 2]
    else:
        # "cheapest" (default) — lowest price
        target = sorted_by_price[0]

    # ── Round 0: system intro ─────────────────────────────────────────────────
    yield NegotiationMessage(
        round=0,
        sender="system",
        content=(
            f"Negotiation started between Buyer Agent and {target.carrier_name}. "
            f"Initial quote: ₹{target.price_inr:.0f} | "
            f"Route: {market.origin_city} → {market.destination_city} ({market.distance_km} km) | "
            f"Diesel: ₹{market.diesel_price_inr}/L"
        ),
        status="info",
    )
    await asyncio.sleep(0.4)

    buyer_offer = buyer_agent.get_opening_offer(target.price_inr)
    seller_price = target.price_inr
    history: list[dict] = []
    agreed = False
    final_price = seller_price

    # ── Round 0: buyer opening offer ──────────────────────────────────────────
    buyer_msg = await buyer_agent.generate_negotiation_message(
        buyer_offer, seller_price, 1, intent, market, accepting=False
    )
    history.append({"sender": "buyer", "content": buyer_msg, "price": buyer_offer})

    yield NegotiationMessage(
        round=1,
        sender="buyer",
        offer_price_inr=buyer_offer,
        content=buyer_msg,
        status="offer",
    )
    await asyncio.sleep(0.6)

    # ── Negotiation rounds ────────────────────────────────────────────────────
    for rnd in range(1, buyer_agent.MAX_ROUNDS + 1):
        # Seller responds
        seller_resp = await seller_agent.generate_negotiation_response(
            carrier_id=target.carrier_id,
            carrier_name=target.carrier_name,
            initial_quote=target.price_inr,
            buyer_offer=buyer_offer,
            round_num=rnd,
            intent=intent,
            market=market,
            history=history,
        )

        seller_price = seller_resp["counter_price"]
        history.append({"sender": target.carrier_name, "content": seller_resp["message"], "price": seller_price})

        yield NegotiationMessage(
            round=rnd,
            sender="seller",
            carrier_id=target.carrier_id,
            offer_price_inr=seller_price,
            content=seller_resp["message"],
            status="accept" if seller_resp["accept"] else "counter",
        )
        await asyncio.sleep(0.6)

        # Check acceptance
        if seller_resp["accept"] or buyer_agent.should_accept(buyer_offer, seller_price):
            final_price = seller_price if seller_resp["accept"] else (buyer_offer + seller_price) / 2
            agreed = True

            accept_msg = await buyer_agent.generate_negotiation_message(
                buyer_offer, final_price, rnd, intent, market, accepting=True
            )
            yield NegotiationMessage(
                round=rnd,
                sender="buyer",
                offer_price_inr=final_price,
                content=accept_msg,
                status="accept",
            )
            await asyncio.sleep(0.3)
            break

        # Buyer counter
        buyer_offer = buyer_agent.next_counter(buyer_offer, seller_price, rnd)
        buyer_msg = await buyer_agent.generate_negotiation_message(
            buyer_offer, seller_price, rnd + 1, intent, market, accepting=False
        )
        history.append({"sender": "buyer", "content": buyer_msg, "price": buyer_offer})

        yield NegotiationMessage(
            round=rnd,
            sender="buyer",
            offer_price_inr=buyer_offer,
            content=buyer_msg,
            status="counter",
        )
        await asyncio.sleep(0.5)

    # ── Force agreement if max rounds reached ────────────────────────────────
    if not agreed:
        final_price = round((buyer_offer + seller_price) / 2, 2)
        yield NegotiationMessage(
            round=buyer_agent.MAX_ROUNDS,
            sender="system",
            offer_price_inr=final_price,
            content=f"Max rounds reached. Deal struck at midpoint: ₹{final_price:.0f}",
            status="accept",
        )

    # ── Final agreement message ──────────────────────────────────────────────
    final_price_algo = inr_to_micro_algo(final_price, market.algo_inr_rate) / 1_000_000

    yield NegotiationMessage(
        round=99,
        sender="system",
        offer_price_inr=final_price,
        content=(
            f"DEAL AGREED ✓ | ₹{final_price:.0f} "
            f"({final_price_algo:.4f} ALGO at live rate ₹{market.algo_inr_rate}/ALGO) | "
            f"Carrier: {target.carrier_name}"
        ),
        status="info",
    )


async def collect_negotiation(
    quotes: list[CarrierQuote],
    intent: ShipmentIntent,
    market: LiveMarketData,
) -> NegotiationResult:
    """
    Run negotiation to completion and return the full result.
    Used by non-streaming endpoints.
    """
    messages = []
    final_price_inr = quotes[0].price_inr
    winning_carrier = quotes[0]

    async for msg in run_negotiation(quotes, intent, market):
        messages.append(msg)
        if msg.status == "accept" and msg.offer_price_inr:
            final_price_inr = msg.offer_price_inr
            if msg.carrier_id:
                match = next((q for q in quotes if q.carrier_id == msg.carrier_id), None)
                if match:
                    winning_carrier = match

    # Find winning carrier from messages
    for msg in reversed(messages):
        if msg.carrier_id:
            match = next((q for q in quotes if q.carrier_id == msg.carrier_id), None)
            if match:
                winning_carrier = match
                break

    final_price_algo = inr_to_micro_algo(final_price_inr, market.algo_inr_rate) / 1_000_000

    return NegotiationResult(
        agreed=True,
        final_price_inr=final_price_inr,
        final_price_algo=round(final_price_algo, 4),
        winning_carrier=winning_carrier,
        rounds=len([m for m in messages if m.sender in ("buyer", "seller")]),
        messages=messages,
    )
