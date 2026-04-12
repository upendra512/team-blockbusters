"""
Route Service — OpenRouteService API for live distance calculation.
Converts Indian pincodes → geocoordinates via Nominatim, then fetches road distance.
"""
import httpx
from backend.config import settings

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-hgv"

HEADERS = {"User-Agent": "A2A-Freight-Demo/1.0"}


async def pincode_to_coords(pincode: str, city: str, state: str) -> tuple[float, float] | None:
    """Convert pincode to (lat, lon) using Nominatim."""
    params = {
        "postalcode": pincode,
        "country": "India",
        "format": "json",
        "limit": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=8, headers=HEADERS) as client:
            resp = await client.get(NOMINATIM_URL, params=params)
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass

    # Fallback: geocode by city + state
    try:
        params = {"q": f"{city}, {state}, India", "format": "json", "limit": 1}
        async with httpx.AsyncClient(timeout=8, headers=HEADERS) as client:
            resp = await client.get(NOMINATIM_URL, params=params)
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass

    return None


async def get_road_distance(
    origin_pincode: str,
    dest_pincode: str,
    origin_city: str,
    dest_city: str,
    origin_state: str,
    dest_state: str,
) -> float:
    """
    Returns road distance in km between two Indian pincodes.
    Falls back to straight-line × 1.3 if ORS fails.
    """
    origin_coords = await pincode_to_coords(origin_pincode, origin_city, origin_state)
    dest_coords = await pincode_to_coords(dest_pincode, dest_city, dest_state)

    if not origin_coords or not dest_coords:
        # haversine fallback (approximate straight-line × road factor)
        return _haversine_fallback(origin_pincode, dest_pincode)

    if not settings.openrouteservice_api_key:
        # No ORS key — use Euclidean × road factor
        return _coords_distance_km(origin_coords, dest_coords) * 1.35

    try:
        payload = {
            "coordinates": [
                [origin_coords[1], origin_coords[0]],  # ORS uses [lon, lat]
                [dest_coords[1], dest_coords[0]],
            ]
        }
        headers = {
            "Authorization": settings.openrouteservice_api_key,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(ORS_DIRECTIONS_URL, json=payload, headers=headers)
            data = resp.json()
            distance_m = data["routes"][0]["summary"]["distance"]
            return round(distance_m / 1000, 1)
    except Exception:
        return _coords_distance_km(origin_coords, dest_coords) * 1.35


def _coords_distance_km(c1: tuple, c2: tuple) -> float:
    import math
    R = 6371
    lat1, lon1 = math.radians(c1[0]), math.radians(c1[1])
    lat2, lon2 = math.radians(c2[0]), math.radians(c2[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _haversine_fallback(pin1: str, pin2: str) -> float:
    """Very rough distance using first 2 digits of pincode as zone proxy."""
    z1, z2 = int(pin1[:2]), int(pin2[:2])
    return abs(z1 - z2) * 45 + 200  # rough km estimate
