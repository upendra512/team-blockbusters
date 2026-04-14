"""
FastAPI Backend — A2A P2P Freight Commerce Demo

Endpoints:
  POST /api/chat/message             — intent agent chat
  POST /api/freight/quotes           — fetch live carrier quotes
  GET  /api/freight/negotiate/stream — SSE negotiation stream
  POST /api/freight/escrow/create    — deploy + fund escrow on Algorand
  POST /api/freight/escrow/{app_id}/deliver       — carrier submits delivery
  POST /api/freight/escrow/{app_id}/verify-release — verify + auto-release/refund
  GET  /api/freight/escrow/{app_id}/status        — poll contract state
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from backend.config import settings
from backend.models import (
    ChatRequest, ChatResponse,
    ShipmentIntent,
    QuotesResponse, LiveMarketData,
    NegotiationMessage,
    EscrowCreateRequest, EscrowCreateResponse,
    DeliverRequest, DeliverResponse, DeliveryReceipt,
    VerifyReleaseRequest, VerifyReleaseResponse,
    EscrowStatus,
)
from backend.agents import intent_agent, seller_agent
from backend.agents.seller_agent import get_all_quotes
from backend import negotiation as neg_module
from backend import verification as verif_module
from backend import algorand_client as algo
from backend.services import (
    pincode_service, route_service, fuel_service,
    weather_service, coingecko_service,
)

app = FastAPI(title="A2A Freight Commerce API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store for market data + negotiation results
_session_data: dict[str, dict] = {}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Chat / Intent Agent ───────────────────────────────────────────────────────

@app.post("/api/chat/message", response_model=ChatResponse)
async def chat_message(req: ChatRequest):
    """Process one user message via the intent agent."""
    if not settings.groq_api_key:
        raise HTTPException(503, "GROQ_API_KEY not configured")

    reply, is_complete, intent = await intent_agent.process_message(
        req.session_id, req.message
    )
    return ChatResponse(
        reply=reply,
        session_id=req.session_id,
        shipment_ready=is_complete,
        shipment_intent=intent,
    )


# ── Live Quotes ───────────────────────────────────────────────────────────────

@app.post("/api/freight/quotes", response_model=QuotesResponse)
async def get_quotes(intent: ShipmentIntent):
    """
    Fetch live market data and compute carrier quotes.
    All prices are dynamic — driven by live APIs.
    """
    session_id = str(uuid.uuid4())

    # Resolve pincodes in parallel
    origin_info, dest_info = await asyncio.gather(
        pincode_service.resolve_pincode(intent.origin_pincode),
        pincode_service.resolve_pincode(intent.destination_pincode),
    )

    # Fetch all live data in parallel
    distance, diesel_price, origin_weather, algo_rate = await asyncio.gather(
        route_service.get_road_distance(
            intent.origin_pincode, intent.destination_pincode,
            origin_info["city"], dest_info["city"],
            origin_info["state"], dest_info["state"],
        ),
        fuel_service.get_diesel_price_inr(),
        weather_service.get_weather(origin_info["city"], origin_info["state"]),
        coingecko_service.get_algo_inr_rate(),
    )

    market = LiveMarketData(
        distance_km=round(distance, 1),
        diesel_price_inr=round(diesel_price, 2),
        weather_description=origin_weather["description"],
        origin_city=origin_info["city"],
        destination_city=dest_info["city"],
        algo_inr_rate=round(algo_rate, 2),
    )

    # Get quotes from all carrier agents
    quotes = get_all_quotes(market, intent)

    # Attach wallet addresses
    for q in quotes:
        q.wallet_address = algo.get_seller_address(q.carrier_id)

    # Buyer analysis
    fair_price = seller_agent.compute_quote.__wrapped__ if hasattr(seller_agent.compute_quote, "__wrapped__") else None
    sorted_q = sorted(quotes, key=lambda x: x.price_inr)
    buyer_analysis = (
        f"Best quote: {sorted_q[0].carrier_name} at ₹{sorted_q[0].price_inr:.0f} "
        f"({sorted_q[0].eta_days}d). Route: {market.origin_city}→{market.destination_city}, "
        f"{market.distance_km}km. Diesel today: ₹{market.diesel_price_inr}/L. "
        f"ALGO rate: ₹{market.algo_inr_rate}/ALGO."
    )

    # Store for later use
    _session_data[session_id] = {"market": market, "quotes": quotes, "intent": intent}

    return QuotesResponse(
        quotes=quotes,
        market_data=market,
        buyer_analysis=buyer_analysis,
    )


# ── Negotiation SSE Stream ────────────────────────────────────────────────────

@app.get("/api/freight/negotiate/stream")
async def negotiate_stream(
    origin_pincode: str,
    destination_pincode: str,
    weight_kg: float,
    max_budget_inr: float,
    pickup_date: str = "2026-04-15",
    length_cm: float = 30,
    width_cm: float = 30,
    height_cm: float = 30,
    package_type: str = "general",
    user_type: str = "business",
):
    """
    SSE endpoint — streams negotiation messages in real time.
    Each event: data: {NegotiationMessage JSON}
    Final event data will contain status="info" with "DEAL AGREED".
    """
    intent = ShipmentIntent(
        user_type=user_type,
        origin_pincode=origin_pincode,
        destination_pincode=destination_pincode,
        weight_kg=weight_kg,
        length_cm=length_cm,
        width_cm=width_cm,
        height_cm=height_cm,
        package_type=package_type,
        pickup_date=pickup_date,
        max_budget_inr=max_budget_inr,
    )

    # Resolve pincodes + live data
    origin_info, dest_info = await asyncio.gather(
        pincode_service.resolve_pincode(origin_pincode),
        pincode_service.resolve_pincode(destination_pincode),
    )
    distance, diesel_price, weather, algo_rate = await asyncio.gather(
        route_service.get_road_distance(
            origin_pincode, destination_pincode,
            origin_info["city"], dest_info["city"],
            origin_info["state"], dest_info["state"],
        ),
        fuel_service.get_diesel_price_inr(),
        weather_service.get_weather(origin_info["city"], origin_info["state"]),
        coingecko_service.get_algo_inr_rate(),
    )

    market = LiveMarketData(
        distance_km=round(distance, 1),
        diesel_price_inr=round(diesel_price, 2),
        weather_description=weather["description"],
        origin_city=origin_info["city"],
        destination_city=dest_info["city"],
        algo_inr_rate=round(algo_rate, 2),
    )
    quotes = get_all_quotes(market, intent)

    async def event_generator():
        # Send market data first
        yield {
            "event": "market",
            "data": json.dumps(market.model_dump()),
        }
        yield {
            "event": "quotes",
            "data": json.dumps([q.model_dump() for q in quotes]),
        }

        # Stream negotiation
        async for msg in neg_module.run_negotiation(quotes, intent, market):
            yield {
                "event": "message",
                "data": json.dumps(msg.model_dump()),
            }
            await asyncio.sleep(0.05)

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())


# ── Escrow Create ─────────────────────────────────────────────────────────────

@app.post("/api/freight/escrow/create", response_model=EscrowCreateResponse)
async def create_escrow(req: EscrowCreateRequest):
    """
    Deploy CommerceEscrow contract, fund it, and call create_deal.
    Locks the negotiated ALGO amount on Algorand Testnet.
    """
    result = req.negotiation_result
    intent = req.shipment_intent

    # Convert INR to microALGO using live rate
    micro_algo = coingecko_service.inr_to_micro_algo(
        result.final_price_inr, result.final_price_algo * 1_000_000 / result.final_price_inr
        if result.final_price_inr > 0 else 1
    )
    # Use the already-computed algo amount
    micro_algo = int(result.final_price_algo * 1_000_000)

    seller_address = algo.get_seller_address(result.winning_carrier.carrier_id)
    service_hash = algo.hash_content(json.dumps({
        "origin": intent.origin_pincode,
        "destination": intent.destination_pincode,
        "weight_kg": intent.weight_kg,
        "price_inr": result.final_price_inr,
    }, sort_keys=True))

    try:
        # 1. Deploy contract
        app_id, app_address, deploy_tx_id = algo.deploy_escrow()

        # 2. Fund with min balance (0.2 ALGO)
        fund_tx_id = algo.fund_app(app_address, amount_algo=0.2)

        # 3. Lock funds via create_deal (atomic: payment + app call)
        deal_tx_id = algo.create_deal(
            app_id=app_id,
            app_address=app_address,
            seller_address=seller_address,
            service_hash=service_hash,
            amount_micro_algo=micro_algo,
        )

    except Exception as e:
        raise HTTPException(500, f"Blockchain error: {str(e)}")

    return EscrowCreateResponse(
        app_id=app_id,
        app_address=app_address,
        amount_micro_algo=micro_algo,
        amount_algo=round(micro_algo / 1_000_000, 4),
        deploy_tx_id=deploy_tx_id,
        fund_tx_id=fund_tx_id,
        deal_tx_id=deal_tx_id,
        explorer_url=algo.explorer_app_url(app_id),
        status="LOCKED",
    )


# ── Deliver ───────────────────────────────────────────────────────────────────

@app.post("/api/freight/escrow/{app_id}/deliver", response_model=DeliverResponse)
async def deliver(app_id: int, req: DeliverRequest):
    """
    Carrier agent submits delivery receipt.
    Generates a realistic receipt and stores hash on-chain.
    """
    intent = req.shipment_intent
    result = req.negotiation_result
    carrier = result.winning_carrier

    # Resolve pincodes
    origin_info, dest_info = await asyncio.gather(
        pincode_service.resolve_pincode(intent.origin_pincode),
        pincode_service.resolve_pincode(intent.destination_pincode),
    )
    distance, _ = await asyncio.gather(
        route_service.get_road_distance(
            intent.origin_pincode, intent.destination_pincode,
            origin_info["city"], dest_info["city"],
            origin_info["state"], dest_info["state"],
        ),
        asyncio.sleep(0),
    )

    # Generate delivery receipt
    now = datetime.now(timezone.utc)
    eta_dt = now.replace(hour=now.hour + carrier.eta_days * 24 % 24)

    # Truck numbers by carrier
    truck_numbers = {
        "carrier_a": "MH04AB5678",
        "carrier_b": "DL01CD9012",
        "carrier_c": "KA03EF3456",
    }

    receipt = DeliveryReceipt(
        truck_number=truck_numbers.get(carrier.carrier_id, "MH01AA0001"),
        driver_name=["Ramesh Kumar", "Suresh Singh", "Prakash Patel"][
            ["carrier_a", "carrier_b", "carrier_c"].index(carrier.carrier_id)
        ],
        carrier_name=carrier.carrier_name,
        pickup_timestamp=now.isoformat(),
        origin_pincode=intent.origin_pincode,
        destination_pincode=intent.destination_pincode,
        weight_kg=intent.weight_kg,
        route_distance_km=round(distance, 1),
        estimated_delivery=eta_dt.isoformat(),
        agreed_price_inr=result.final_price_inr,
    )

    delivery_hash = algo.hash_content(receipt.model_dump_json())

    try:
        tx_id = algo.submit_delivery(app_id, carrier.carrier_id, delivery_hash)
    except Exception as e:
        raise HTTPException(500, f"Blockchain error: {str(e)}")

    return DeliverResponse(
        delivery_receipt=receipt,
        delivery_hash=delivery_hash,
        tx_id=tx_id,
        explorer_url=algo.explorer_tx_url(tx_id),
    )


# ── Verify & Release ──────────────────────────────────────────────────────────

@app.post("/api/freight/escrow/{app_id}/verify-release", response_model=VerifyReleaseResponse)
async def verify_and_release(app_id: int, req: VerifyReleaseRequest):
    """
    Run programmatic delivery verification.
    If all checks pass → release_payment() on-chain.
    If any check fails → refund_buyer() on-chain.
    """
    escrow_created_at = algo.get_escrow_created_at(app_id)

    verification = verif_module.verify_delivery(
        receipt=req.delivery_receipt,
        intent=req.shipment_intent,
        result=req.negotiation_result,
        market=req.market_data,
        escrow_created_at=escrow_created_at,
    )

    try:
        if verification.passed:
            tx_id = algo.release_payment(app_id)
            return VerifyReleaseResponse(
                verification=verification,
                released=True,
                release_tx_id=tx_id,
                explorer_url=algo.explorer_tx_url(tx_id),
            )
        else:
            tx_id = algo.refund_buyer(app_id)
            return VerifyReleaseResponse(
                verification=verification,
                released=False,
                refund_tx_id=tx_id,
                explorer_url=algo.explorer_tx_url(tx_id),
            )
    except Exception as e:
        raise HTTPException(500, f"Blockchain error: {str(e)}")


# ── Escrow Status ─────────────────────────────────────────────────────────────

@app.get("/api/freight/escrow/{app_id}/status", response_model=EscrowStatus)
async def escrow_status(app_id: int):
    """Poll current on-chain contract state."""
    try:
        state = algo.get_app_state(app_id)
    except Exception as e:
        raise HTTPException(404, f"App not found: {str(e)}")

    status_code = state.get("status", 0)
    status_label = algo.STATUS_LABELS.get(status_code, "UNKNOWN")

    return EscrowStatus(
        app_id=app_id,
        status_code=status_code,
        status_label=status_label,
        amount_micro_algo=state.get("amount", 0),
        buyer_address=state.get("buyer", ""),
        seller_address=state.get("seller", ""),
    )


# ── Setup / Wallet Util ───────────────────────────────────────────────────────

@app.get("/api/setup/wallets")
async def list_wallet_addresses():
    """Returns configured wallet addresses for funding via testnet dispenser."""
    try:
        buyer_addr = algo.get_buyer_address()
        seller_a = algo.get_seller_address("carrier_a")
        seller_b = algo.get_seller_address("carrier_b")
        seller_c = algo.get_seller_address("carrier_c")
        return {
            "buyer": buyer_addr,
            "carrier_a_SpeedFreight": seller_a,
            "carrier_b_EcoLogistics": seller_b,
            "carrier_c_TrustFreight": seller_c,
            "dispenser": "https://bank.testnet.algorand.network/",
        }
    except Exception as e:
        return {"error": str(e), "hint": "Set wallet mnemonics in .env file"}
