from __future__ import annotations

import asyncio
import hashlib
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Product, ProductTranslation


AWS_TRANSLATE_CODES = {
    "ar": "ar", "bg": "bg", "cs": "cs", "da": "da", "de": "de",
    "el": "el", "es": "es", "es-ES": "es", "fi": "fi", "fr": "fr",
    "he": "he", "hr": "hr", "hu": "hu", "id": "id", "it": "it",
    "ja": "ja", "ko": "ko", "lt": "lt", "nb": "no", "nl": "nl",
    "pl": "pl", "pt-BR": "pt", "pt-PT": "pt-PT", "ro": "ro", "ru": "ru",
    "sk": "sk", "sl": "sl", "sv": "sv", "th": "th", "tr": "tr",
    "ur": "ur", "vi": "vi", "zh-CN": "zh", "zh-TW": "zh-TW",
}


def source_hash(product: Product) -> str:
    source = json.dumps([product.name, product.description], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _translate_with_aws(text: str, target_language: str) -> str:
    import boto3

    response = boto3.client("translate", region_name=settings.aws_region).translate_text(
        Text=text,
        SourceLanguageCode="en",
        TargetLanguageCode=target_language,
    )
    return response["TranslatedText"]


async def _translate_product(product: Product, target_language: str) -> tuple[str, str] | None:
    if settings.translation_provider != "aws_translate":
        return None
    try:
        name, description = await asyncio.gather(
            asyncio.wait_for(
                asyncio.to_thread(_translate_with_aws, product.name, target_language),
                timeout=settings.translation_timeout_seconds,
            ),
            asyncio.wait_for(
                asyncio.to_thread(_translate_with_aws, product.description, target_language),
                timeout=settings.translation_timeout_seconds,
            ) if product.description else asyncio.sleep(0, result=""),
        )
        return name, description
    except Exception:
        # A provider outage should never make the storefront catalog unavailable.
        return None


async def get_product_translation(
    product: Product,
    locale: str,
    db: AsyncSession,
) -> ProductTranslation | None:
    target_language = AWS_TRANSLATE_CODES.get(locale)
    if not target_language:
        return None

    current_hash = source_hash(product)
    cached = await db.scalar(select(ProductTranslation).where(
        ProductTranslation.product_id == product.id,
        ProductTranslation.locale == locale,
    ))
    if cached and cached.source_hash == current_hash:
        return cached

    translated = await _translate_product(product, target_language)
    if translated is None:
        return None

    if cached is None:
        cached = ProductTranslation(product_id=product.id, locale=locale, source_hash=current_hash, provider="aws_translate")
        db.add(cached)
    cached.name, cached.description = translated
    cached.source_hash = current_hash
    cached.provider = "aws_translate"
    return cached