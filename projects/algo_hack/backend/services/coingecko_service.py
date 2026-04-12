"""
CoinGecko Service — live ALGO/INR exchange rate.
Free API, no key required.
"""
import httpx

COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=algorand&vs_currencies=inr"
)

FALLBACK_ALGO_INR = 18.5  # fallback if API unavailable


async def get_algo_inr_rate() -> float:
    """Returns live ALGO price in INR."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(COINGECKO_URL)
            data = resp.json()
            rate = data["algorand"]["inr"]
            return float(rate)
    except Exception:
        return FALLBACK_ALGO_INR


def inr_to_micro_algo(inr_amount: float, algo_inr_rate: float) -> int:
    """Convert INR amount to microALGO using live rate."""
    algo = inr_amount / algo_inr_rate
    return int(algo * 1_000_000)


def micro_algo_to_inr(micro_algo: int, algo_inr_rate: float) -> float:
    """Convert microALGO to INR using live rate."""
    return (micro_algo / 1_000_000) * algo_inr_rate
