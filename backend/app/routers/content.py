from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.email_notifications import send_contact_notification
from app.models import ContactRequest as ContactRequestModel
from app.models import NewsletterSubscription, OutboxEvent
from app.rate_limit import enforce_rate_limit
from app.schemas import AcceptedOut, ContactRequest as ContactRequestIn, NewsletterRequest
from app.security import require_csrf

router = APIRouter(tags=["storefront forms"])


@router.post("/newsletter/subscriptions", response_model=dict)
async def subscribe_newsletter(payload: NewsletterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "newsletter", 5, 3600)
    email = str(payload.email).lower().strip()
    existing = await db.scalar(select(NewsletterSubscription).where(NewsletterSubscription.email == email))
    if existing:
        return {"data": AcceptedOut().model_dump()}
    db.add(NewsletterSubscription(email=email))
    db.add(OutboxEvent(event_type="newsletter.subscription_created", payload={"email": email}))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    # The outbox records consent; an email-marketing consumer/provider still needs configuration.
    return {"data": AcceptedOut().model_dump()}


@router.post("/contact/requests", response_model=dict)
async def create_contact_request(payload: ContactRequestIn, request: Request, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "contact-request", 5, 3600)
    contact = ContactRequestModel(
        name=payload.name.strip(),
        email=str(payload.email).lower().strip(),
        message=payload.message.strip(),
        request_type=payload.requestType,
    )
    db.add(contact)
    db.add(OutboxEvent(
        event_type="contact.request_received",
        payload={"name": contact.name, "email": contact.email, "requestType": contact.request_type, "message": contact.message},
    ))
    await db.commit()
    # Persist first. A missing or unavailable SMTP service must never discard the customer request.
    notification_sent = await send_contact_notification(
        contact.name,
        contact.email,
        contact.request_type or "Storefront request",
        contact.message,
    )
    return {"data": {
        **AcceptedOut().model_dump(),
        "emailNotificationSent": notification_sent,
        "notificationEmail": settings.contact_notification_email,
    }}
