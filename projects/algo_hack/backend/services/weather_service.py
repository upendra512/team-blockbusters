"""
Weather Service — OpenWeatherMap API for route weather conditions.
Used by seller agents to assess ETA risk and by the buyer agent for route analysis.
"""
import httpx
from backend.config import settings

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"


async def get_weather(city: str, state: str) -> dict:
    """
    Returns weather dict with description, temp, wind, and an ETA risk flag.
    Falls back gracefully if API key missing or unavailable.
    """
    if not settings.openweathermap_api_key:
        return _fallback_weather(city)

    query = f"{city},{state},IN"
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(
                OWM_URL,
                params={
                    "q": query,
                    "appid": settings.openweathermap_api_key,
                    "units": "metric",
                },
            )
            data = resp.json()
            if resp.status_code == 200:
                weather_main = data["weather"][0]["main"]
                description = data["weather"][0]["description"]
                temp = data["main"]["temp"]
                wind_speed = data["wind"]["speed"]
                rain_mm = data.get("rain", {}).get("1h", 0)

                # Assess ETA risk
                high_risk = weather_main in ("Thunderstorm", "Tornado") or rain_mm > 10
                medium_risk = weather_main in ("Rain", "Snow", "Drizzle") or wind_speed > 15

                return {
                    "description": description,
                    "temperature_c": temp,
                    "wind_kmh": round(wind_speed * 3.6, 1),
                    "rain_mm": rain_mm,
                    "eta_risk": "HIGH" if high_risk else ("MEDIUM" if medium_risk else "LOW"),
                    "city": city,
                    "live": True,
                }
    except Exception:
        pass

    return _fallback_weather(city)


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
