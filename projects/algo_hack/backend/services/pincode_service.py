"""
Pincode Service — India Post API (free, no auth required).
Resolves an Indian pincode to city + state and validates its format.
"""
import re
import httpx

INDIA_POST_URL = "https://api.postalpincode.in/pincode/{}"


def is_valid_pincode(pincode: str) -> bool:
    return bool(re.fullmatch(r"[1-9][0-9]{5}", pincode))


async def resolve_pincode(pincode: str) -> dict:
    """
    Returns {"city": str, "state": str, "valid": bool}.
    Falls back gracefully if the API is unavailable.
    """
    if not is_valid_pincode(pincode):
        return {"city": "Unknown", "state": "Unknown", "valid": False}

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(INDIA_POST_URL.format(pincode))
            data = resp.json()
            if data and data[0]["Status"] == "Success":
                post_office = data[0]["PostOffice"][0]
                return {
                    "city": post_office.get("District", post_office.get("Name", "Unknown")),
                    "state": post_office.get("State", "Unknown"),
                    "valid": True,
                }
    except Exception:
        pass

    return {"city": f"City-{pincode}", "state": "India", "valid": True}
