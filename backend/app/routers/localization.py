from fastapi import APIRouter, HTTPException, Query

from app.currency import SUPPORTED_CURRENCIES, get_jpy_rates

router = APIRouter(prefix="/localization", tags=["localization"])


@router.get("/rates", response_model=dict)
async def exchange_rates(symbols: str | None = Query(default=None, max_length=64)):
    requested = {code.strip().upper() for code in (symbols or "").split(",") if code.strip()}
    requested.discard("JPY")
    if requested - SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=422, detail="One or more currencies are not supported.")
    try:
        rates = await get_jpy_rates()
    except Exception:
        raise HTTPException(status_code=503, detail="Exchange rates are temporarily unavailable.") from None
    if requested:
        rates = {**rates, "rates": {code: rate for code, rate in rates["rates"].items() if code == "JPY" or code in requested}}
    return {"data": rates}
