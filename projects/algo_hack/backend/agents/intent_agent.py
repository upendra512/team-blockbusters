"""
Intent Agent — Gemini-powered conversational agent.

Conducts a natural chat to extract all shipment details from the user.
Maintains per-session state. Returns structured ShipmentIntent once complete.
"""
import json
import re
from datetime import date, timedelta
from typing import Optional

from groq import AsyncGroq

from backend.config import settings
from backend.models import ShipmentIntent

# ── Session state ──────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = {}

REQUIRED_FIELDS = [
    "user_type", "origin_pincode", "destination_pincode",
    "weight_kg", "length_cm", "width_cm", "height_cm",
    "package_type", "pickup_date", "max_budget_inr",
    "delivery_priority",
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
9. delivery_priority: Ask — "What matters most for this shipment?"
   - Reply "cheapest" if they say cost / budget / save money
   - Reply "fastest" if they say speed / urgent / next day / express
   - Reply "balanced" if they say reliable / standard / mix of both

Rules:
- Be conversational and friendly
- Ask follow-up questions if answers are unclear
- Validate pincodes (must be 6 digits, start with non-zero)
- Ask the delivery_priority question naturally, e.g.: "What matters most — lowest price, fastest delivery, or a balance of both?"
- Once you have ALL details including delivery_priority, respond with a JSON block like:
  ```json
  {"collected": true, "data": {"user_type": "...", "origin_pincode": "...", "delivery_priority": "cheapest", ...}}
  ```
- Before the JSON, give a friendly confirmation message
- Do NOT ask for more info after you have all fields
- delivery_priority must be one of: "cheapest", "balanced", "fastest"
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
    client = AsyncGroq(api_key=settings.groq_api_key)

    session = _get_or_create_session(session_id)

    if session["complete"]:
        return "All shipment details are already collected. Click 'Find Quotes' to proceed!", True, _build_intent(session["collected"])

    # Inject today's date so LLM never uses placeholder strings
    today_str = date.today().isoformat()          # e.g. "2026-04-15"
    tomorrow_str = (date.today() + timedelta(days=1)).isoformat()
    dated_system = SYSTEM_PROMPT + f"\n\nToday's date is {today_str}. Tomorrow is {tomorrow_str}. Always use real ISO dates (YYYY-MM-DD), never placeholders."

    messages = [{"role": "system", "content": dated_system}]
    for h in session["history"]:
        role = "assistant" if h["role"] == "model" else h["role"]
        messages.append({"role": role, "content": h["content"]})
    messages.append({"role": "user", "content": user_message})

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.7,
        max_tokens=1024,
    )
    reply = response.choices[0].message.content

    # Update history
    session["history"].append({"role": "user", "content": user_message})
    session["history"].append({"role": "model", "content": reply})

    # ── Parse completion JSON (code-fenced OR raw) ────────────────────────────
    intent = None
    is_complete = False

    def _try_parse(text: str) -> Optional[dict]:
        """Try to extract and parse a {collected: true, data: {...}} JSON object."""
        # 1. Code-fenced ```json ... ```
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            try:
                p = json.loads(m.group(1))
                if p.get("collected") and p.get("data"):
                    return p
            except json.JSONDecodeError:
                pass
        # 2. Raw JSON object anywhere in the reply
        for m in re.finditer(r"\{[^{}]*\"collected\"[^{}]*\}", text, re.DOTALL):
            try:
                p = json.loads(m.group(0))
                if p.get("collected") and p.get("data"):
                    return p
            except json.JSONDecodeError:
                continue
        return None

    parsed = _try_parse(reply)
    if parsed:
        try:
            session["collected"] = parsed["data"]
            session["complete"] = True
            is_complete = True
            intent = _build_intent(parsed["data"])
            # Strip raw JSON / code block from the displayed reply
            clean_reply = re.sub(r"```json\s*\{.*?\}\s*```", "", reply, flags=re.DOTALL)
            clean_reply = re.sub(r"\{[^{}]*\"collected\"[^{}]*\}", "", clean_reply, flags=re.DOTALL).strip()
            reply = clean_reply + "\n\n✅ All details collected! Click **Start Negotiation** to find the best carrier rates."
        except (json.JSONDecodeError, KeyError):
            pass

    return reply, is_complete, intent


def _build_intent(data: dict) -> ShipmentIntent:
    # Sanitise pickup_date — reject non-ISO placeholders from LLM
    raw_date = str(data.get("pickup_date", ""))
    try:
        date.fromisoformat(raw_date)
        pickup_date = raw_date
    except (ValueError, TypeError):
        pickup_date = (date.today() + timedelta(days=1)).isoformat()

    return ShipmentIntent(
        user_type=data.get("user_type", "individual"),
        origin_pincode=str(data.get("origin_pincode", "")),
        destination_pincode=str(data.get("destination_pincode", "")),
        weight_kg=float(data.get("weight_kg", 1)),
        length_cm=float(data.get("length_cm", 20)),
        width_cm=float(data.get("width_cm", 20)),
        height_cm=float(data.get("height_cm", 20)),
        package_type=str(data.get("package_type", "general")),
        pickup_date=pickup_date,
        max_budget_inr=float(data.get("max_budget_inr", 1000)),
        delivery_priority=str(data.get("delivery_priority", "cheapest")),
    )



def get_session_intent(session_id: str) -> Optional[ShipmentIntent]:
    session = _sessions.get(session_id)
    if session and session["complete"]:
        return _build_intent(session["collected"])
    return None


def clear_session(session_id: str):
    _sessions.pop(session_id, None)
