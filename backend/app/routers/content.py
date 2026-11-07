from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import ContactRequest as ContactRequestModel
from app.models import NewsletterSubscription
from app.schemas import AcceptedOut, ContactRequest as ContactRequestIn, NewsletterRequest
from app.security import require_csrf

router = APIRouter(tags=["storefront forms"])


@router.post("/newsletter/subscriptions", response_model=dict)
async def subscribe_newsletter(payload: NewsletterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    email = str(payload.email).lower().strip()
    existing = await db.scalar(select(NewsletterSubscription).where(NewsletterSubscription.email == email))
    if existing:
        return {"data": AcceptedOut().model_dump()}
    db.add(NewsletterSubscription(email=email))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    # TODO: publish a consented subscription event to the configured email provider.
    return {"data": AcceptedOut().model_dump()}


@router.post("/contact/requests", response_model=dict)
async def create_contact_request(payload: ContactRequestIn, request: Request, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    contact = ContactRequestModel(
        name=payload.name.strip(),
        email=str(payload.email).lower().strip(),
        message=payload.message.strip(),
        request_type=payload.requestType,
    )
    db.add(contact)
    await db.commit()
    # TODO: publish a notification to SQS/EventBridge; do not call suppliers inline.
    return {"data": AcceptedOut().model_dump()}
