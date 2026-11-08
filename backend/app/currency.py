import asyncio
import json
import time
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

SUPPORTED_CURRENCIES = {"JPY", "USD", "EUR", "GBP", "AUD", "CAD", "IDR"}
CURRENCY_DIGITS = {"JPY": 0, "USD": 2, "EUR": 2, "GBP": 2, "AUD": 2, "CAD": 2, "IDR": 0}
_RATE_CACHE_SECONDS = 3600
_cached_rates: dict[str, Any] | None = None
_cached_at = 0.0
_cache_lock = asyncio.Lock()


def _fetch_jpy_rates() -> dict[str, Any]:
    url = "https://api.frankfurter.dev/v1/latest?base=JPY&symbols=USD,EUR,GBP,AUD,CAD,IDR"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Ponyo-Storefront/1.0"})
    with urlopen(request, timeout=5) as response:
        payload = json.loads(response.read())
    rates = payload.get("rates")
    if payload.get("base") != "JPY" or not isinstance(rates, dict):
        raise ValueError("Invalid FX response")
    if any(code not in rates or not isinstance(rates[code], (int, float)) or rates[code] <= 0 for code in SUPPORTED_CURRENCIES - {"JPY"}):
        raise ValueError("Incomplete FX response")
    return {"base": "JPY", "date": payload.get("date"), "rates": {"JPY": 1, **rates}}


async def get_jpy_rates() -> dict[str, Any]:
    global _cached_rates, _cached_at
    if _cached_rates is not None and time.monotonic() - _cached_at < _RATE_CACHE_SECONDS:
        return _cached_rates
    async with _cache_lock:
        if _cached_rates is not None and time.monotonic() - _cached_at < _RATE_CACHE_SECONDS:
            return _cached_rates
        try:
            _cached_rates = await asyncio.to_thread(_fetch_jpy_rates)
            _cached_at = time.monotonic()
        except (OSError, URLError, TimeoutError, ValueError, json.JSONDecodeError):
            if _cached_rates is None:
                raise
        return _cached_rates


def convert_minor_amount(amount: int, source_currency: str, target_currency: str, rates: dict[str, Any]) -> int:
    source = source_currency.upper()
    target = target_currency.upper()
    if source not in SUPPORTED_CURRENCIES or target not in SUPPORTED_CURRENCIES:
        raise ValueError("Unsupported currency")
    if source == target:
        return amount
    rate_table = rates.get("rates", rates)
    source_rate = rate_table.get(source)
    target_rate = rate_table.get(target)
    if not isinstance(source_rate, (int, float)) or not isinstance(target_rate, (int, float)) or source_rate <= 0:
        raise ValueError("Exchange rate unavailable")
    source_major = amount / (10 ** CURRENCY_DIGITS[source])
    target_major = source_major / source_rate * target_rate
    return round(target_major * (10 ** CURRENCY_DIGITS[target]))
