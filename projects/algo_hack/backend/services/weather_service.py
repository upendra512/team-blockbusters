"""
Weather Service — Open-Meteo API (completely free, no API key required).
Geocodes city to lat/lon via Nominatim, then fetches current weather.
"""
import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "A2A-Freight-Demo/1.0"}


async def _get_coords(city: str, state: str) -> tuple[float, float] | None:
    """Get lat/lon for a city using Nominatim (free, no key)."""
    try:
        async with httpx.AsyncClient(timeout=6, headers=HEADERS) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={"q": f"{city}, {state}, India", "format": "json", "limit": 1},
            )
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception:
        pass
    return None


async def get_weather(city: str, state: str) -> dict:
    """
    Returns live weather using Open-Meteo (no API key needed).
    Falls back gracefully if unavailable.
    """
    coords = await _get_coords(city, state)
    if not coords:
        return _fallback_weather(city)

    lat, lon = coords
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(
                OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,wind_speed_10m,precipitation,weather_code",
                    "wind_speed_unit": "kmh",
                },
            )
            data = resp.json()
            current = data.get("current", {})

            temp = current.get("temperature_2m", 30.0)
            wind_kmh = current.get("wind_speed_10m", 10.0)
            rain_mm = current.get("precipitation", 0.0)
            wmo_code = current.get("weather_code", 0)

            description = _wmo_to_description(wmo_code)
            high_risk = wmo_code >= 80 or rain_mm > 10
            medium_risk = wmo_code >= 51 or wind_kmh > 50

            return {
                "description": description,
                "temperature_c": temp,
                "wind_kmh": round(wind_kmh, 1),
                "rain_mm": rain_mm,
                "eta_risk": "HIGH" if high_risk else ("MEDIUM" if medium_risk else "LOW"),
                "city": city,
                "live": True,
            }
    except Exception:
        pass

    return _fallback_weather(city)


def _wmo_to_description(code: int) -> str:
    """Convert WMO weather code to human-readable string."""
    if code == 0:
        return "clear sky"
    elif code <= 3:
        return "partly cloudy"
    elif code <= 48:
        return "foggy"
    elif code <= 57:
        return "drizzle"
    elif code <= 67:
        return "rain"
    elif code <= 77:
        return "snow"
    elif code <= 82:
        return "rain showers"
    elif code <= 86:
        return "snow showers"
    elif code <= 99:
        return "thunderstorm"
    return "unknown"


def _fallback_weather(city: str) -> dict:
    return {
        "description": "partly cloudy",
        "temperature_c": 32.0,
        "wind_kmh": 12.0,
        "rain_mm": 0,
        "eta_risk": "LOW",
        "city": city,
        "live": False,
    }
