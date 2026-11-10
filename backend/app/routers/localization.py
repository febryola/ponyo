from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.currency import SUPPORTED_CURRENCIES, get_jpy_rates
from app.db import get_db
from app.models import AppTranslation
from app.rate_limit import enforce_rate_limit
from app.schemas import TranslationBatchRequest
from app.translations import AWS_TRANSLATE_CODES, get_app_translations

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


@router.post("/translations", response_model=dict)
async def translate_app_copy(
    payload: TranslationBatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if payload.locale not in AWS_TRANSLATE_CODES:
        raise HTTPException(status_code=422, detail="The requested language is not supported.")
    await enforce_rate_limit(request, "ui-translation", 12, 60)
    translations = await get_app_translations(
        [(entry.key, entry.text) for entry in payload.entries],
        payload.locale,
        db,
    )
    if translations:
        try:
            await db.commit()
        except IntegrityError:
            # Concurrent first visits may race to populate the same cache entry.
            await db.rollback()
            rows = await db.scalars(
                select(AppTranslation).where(
                    AppTranslation.locale == payload.locale,
                    AppTranslation.translation_key.in_(list(translations)),
                )
            )
            translations = {row.translation_key: row.translated_text for row in rows}
    return {"data": {"translations": translations}}
