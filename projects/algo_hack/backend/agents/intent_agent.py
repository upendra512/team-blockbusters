"""
Intent Agent — Gemini-powered conversational agent.

Conducts a natural chat to extract all shipment details from the user.
Maintains per-session state. Returns structured ShipmentIntent once complete.
"""
import json
import re
from typing import Optional

import google.generativeai as genai

from backend.config import settings
from backend.models import ShipmentIntent

# ── Session state ──────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = {}

REQUIRED_FIELDS = [
    "user_type", "origin_pincode", "destination_pincode",
    "weight_kg", "length_cm", "width_cm", "height_cm",
    "package_type", "pickup_date", "max_budget_inr",
]

SYSTEM_PROMPT = """You are a friendly freight booking assistant for an AI-powered shipping platform.
Your job is to collect shipment details from the user through natural conversation.

You need to collect these details (ask one or two at a time, naturally):
1. user_type: Is this shipment for a "business" or "individual"?
2. origin_pincode: 6-digit Indian pincode of pickup location
3. destination_pincode: 6-digit Indian pincode of delivery location
4. weight_kg: Total weight in kg
5. length_cm, width_cm, height_cm: Package dimensions in cm
6. package_type: Type of goods (clothing, electronics, documents, fragile, general, etc.)
7. pickup_date: Preferred pickup date (YYYY-MM-DD)
8. max_budget_inr: Maximum budget in INR

Rules:
- Be conversational and friendly
- Ask follow-up questions if answers are unclear
- Validate pincodes (must be 6 digits, start with non-zero)
- Once you have ALL details, respond with a JSON block like:
  ```json
  {"collected": true, "data": {"user_type": "...", "origin_pincode": "...", ...}}
  ```
- Before the JSON, give a friendly confirmation message
- Do NOT ask for more info after you have all fields
"""


def _get_or_create_session(session_id: str) -> dict:
    if session_id not in _sessions:
        _sessions[session_id] = {
            "history": [],
            "collected": {},
            "complete": False,
        }
    return _sessions[session_id]


async def process_message(session_id: str, user_message: str) -> tuple[str, bool, Optional[ShipmentIntent]]:
    """
    Process one user message.
    Returns (reply_text, is_complete, shipment_intent_or_None).
    """
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash", system_instruction=SYSTEM_PROMPT)

    session = _get_or_create_session(session_id)

    if session["complete"]:
        return "All shipment details are already collected. Click 'Find Quotes' to proceed!", True, _build_intent(session["collected"])

    # Build conversation history for Gemini
    history = [
        {"role": h["role"], "parts": [h["content"]]}
        for h in session["history"]
    ]

    chat = model.start_chat(history=history)
    response = await chat.send_message_async(user_message)
    reply = response.text

    # Update history
    session["history"].append({"role": "user", "content": user_message})
    session["history"].append({"role": "model", "content": reply})

    # Check if all fields collected (parse JSON block if present)
    intent = None
    is_complete = False

    json_match = re.search(r"```json\s*(\{.*?\})\s*```", reply, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group(1))
            if parsed.get("collected") and parsed.get("data"):
                session["collected"] = parsed["data"]
                session["complete"] = True
                is_complete = True
                intent = _build_intent(parsed["data"])
        except (json.JSONDecodeError, KeyError):
            pass

    return reply, is_complete, intent


def _build_intent(data: dict) -> ShipmentIntent:
    return ShipmentIntent(
        user_type=data.get("user_type", "individual"),
        origin_pincode=str(data.get("origin_pincode", "")),
        destination_pincode=str(data.get("destination_pincode", "")),
        weight_kg=float(data.get("weight_kg", 1)),
        length_cm=float(data.get("length_cm", 20)),
        width_cm=float(data.get("width_cm", 20)),
        height_cm=float(data.get("height_cm", 20)),
        package_type=str(data.get("package_type", "general")),
        pickup_date=str(data.get("pickup_date", "2026-04-15")),
        max_budget_inr=float(data.get("max_budget_inr", 1000)),
    )


def get_session_intent(session_id: str) -> Optional[ShipmentIntent]:
    session = _sessions.get(session_id)
    if session and session["complete"]:
        return _build_intent(session["collected"])
    return None


def clear_session(session_id: str):
    _sessions.pop(session_id, None)
