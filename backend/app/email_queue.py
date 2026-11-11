"""Transactional email enqueueing and retry worker."""

import asyncio
import hashlib
import html
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.currency import CURRENCY_DIGITS
from app.db import SessionLocal
from app.email_notifications import ponyo_branded_email_html, send_transactional_email
from app.models import EmailNotification, OutboxEvent, utc_now

logger = logging.getLogger("ponyo.email_queue")
MAX_ATTEMPTS = 10
LEASE_SECONDS = 300


def enqueue_email_notification(
    db: AsyncSession, event: OutboxEvent, *, template: str, recipient: str, payload: dict,
) -> None:
    """Store a notification in the same DB transaction as its business event."""
    from uuid import uuid4

    if event.id is None:
        event.id = uuid4()
    db.add(event)
    db.add(EmailNotification(
        outbox_event_id=event.id,
        notification_key=f"{event.id}:{template}",
        recipient=recipient,
        template=template,
        payload=payload,
    ))


def _money(amount: int, currency: str) -> str:
    code = currency.upper()
    digits = CURRENCY_DIGITS.get(code, 2)
    value = Decimal(amount) / (10 ** digits)
    return f"{value:,.{digits}f} {code}"


def _detail_panel(rows: list[tuple[str, str]]) -> str:
    row_html = "".join(
        '<tr><td style="padding:11px 15px;border-bottom:1px solid #eee4dc;color:#88766b;'
        'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px">'
        f"{html.escape(label)}</td><td align=\"right\" style=\"padding:11px 15px;border-bottom:1px solid #eee4dc;"
        f'color:#3f302b;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:19px">'
        f"{html.escape(value)}</td></tr>"
        for label, value in rows
    )
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="margin-top:22px;border:1px solid #eedfd5;border-radius:15px;background:#fffaf6">'
        f"{row_html}</table>"
    )


def _content(notification: EmailNotification) -> tuple[str, str, str]:
    payload = notification.payload
    template = notification.template
    order_number = str(payload.get("orderNumber", "your order"))
    order_url = str(payload.get("orderUrl", ""))
    lines: list[str]
    rows: list[tuple[str, str]] = []
    title: str
    eyebrow = "A little Ponyo update"
    intro = "Here’s a little update from Ponyo."
    panel = ""
    action_label = "View your order"
    action_url = order_url
    footnote = "Thank you for letting Ponyo be part of your world."
    if template == "order_confirmation":
        eyebrow = "A new plush adventure"
        title = "Your order is in good hands."
        intro = f"Thank you for choosing Ponyo. We’ve received order {order_number} and are getting it ready."
        currency = str(payload.get("currency", "JPY"))
        for index, item in enumerate(payload.get("items", []), start=1):
            name = str(item.get("name", "Ponyo plush"))
            quantity = int(item.get("quantity", 0))
            lines_for_item = f"{name} × {quantity}"
            rows.append((f"Plush friend {index}", lines_for_item))
        rows.append(("Order total", _money(int(payload.get("totalAmount", 0)), currency)))
        panel = _detail_panel(rows)
        lines = [f"Your Ponyo order {order_number} is confirmed."]
        lines.extend(f"• {name} × {int(item.get('quantity', 0))}" for item in payload.get("items", [])
                     for name in [str(item.get("name", "Ponyo plush"))])
        lines.append(f"Order total: {_money(int(payload.get('totalAmount', 0)), currency)}")
        footnote = "We’ll send another note as your parcel begins its journey."
    elif template == "payment_confirmation":
        eyebrow = "Payment received"
        title = "Thank you, it’s all set."
        intro = f"Payment for order {order_number} has been confirmed securely."
        amount = _money(int(payload.get("amount", 0)), str(payload.get("currency", "JPY")))
        panel = _detail_panel([("Order number", order_number), ("Paid", amount)])
        lines = [f"Payment confirmed for order {order_number}.", f"Amount: {amount}"]
    elif template == "shipping_notification":
        eyebrow = "A little parcel is on its way"
        title = "Your plush has left the nest."
        intro = f"Order {order_number} is on its way to you. You can follow its journey below."
        carrier = str(payload.get("carrier", "Carrier"))
        tracking_number = str(payload.get("trackingNumber", "Not provided"))
        rows = [("Delivery partner", carrier), ("Tracking number", tracking_number)]
        if payload.get("estimatedDeliveryAt"):
            rows.append(("Estimated delivery", str(payload["estimatedDeliveryAt"])))
        panel = _detail_panel(rows)
        tracking_url = str(payload.get("trackingUrl") or "")
        if tracking_url.startswith("https://"):
            action_label, action_url = "Track your parcel", tracking_url
        lines = [f"Order {order_number} is on its way.", f"Carrier: {carrier}", f"Tracking number: {tracking_number}"]
        if payload.get("estimatedDeliveryAt"):
            lines.append(f"Estimated delivery: {payload['estimatedDeliveryAt']}")
        footnote = "Tracking scans can take a little while to appear after dispatch."
    elif template == "delivery_notification":
        eyebrow = "A happy arrival"
        title = "Your new friend is home."
        carrier = str(payload.get("carrier", "Your delivery partner"))
        intro = f"{carrier} marked order {order_number} as delivered. We hope your new plush brings a little joy."
        tracking_number = str(payload.get("trackingNumber", ""))
        rows = [("Order number", order_number), ("Delivery partner", carrier)]
        if tracking_number:
            rows.append(("Tracking number", tracking_number))
        panel = _detail_panel(rows)
        lines = [intro]
        footnote = "Need a hand? Reply to this email and our little team will help."
    elif template == "cancellation_notification":
        eyebrow = "Order update"
        title = "Your order has been cancelled."
        intro = f"Order {order_number} is no longer active. If you have questions, our team is here to help."
        reason = str(payload.get("reason") or "Cancellation confirmed by Ponyo.")
        panel = _detail_panel([("Order number", order_number), ("Update", reason)])
        lines = [intro, f"Reason: {reason}"]
        footnote = "If this doesn’t look right, contact Ponyo and we’ll take a closer look."
    elif template == "refund_notification":
        eyebrow = "A little money update"
        title = "Your refund is on its way."
        amount = _money(int(payload.get("amount", 0)), str(payload.get("currency", "JPY")))
        intro = f"A refund for order {order_number} has been processed."
        panel = _detail_panel([("Order number", order_number), ("Refund amount", amount)])
        lines = [intro, f"Refund amount: {amount}", "Your bank or card provider may need extra time to post the funds."]
        footnote = "The time it takes to appear depends on your bank or card provider."
    else:
        raise ValueError("Unsupported transactional email template")

    lines.append("With care, The Ponyo team")
    text = "\n\n".join(lines)
    html_body = ponyo_branded_email_html(
        eyebrow=eyebrow, title=title, intro=intro, content_html=panel,
        action_label=action_label if action_url else None, action_url=action_url if action_url else None,
        footnote=footnote,
    )
    return title, text, html_body


async def send_one(db: AsyncSession) -> bool:
    now = utc_now()
    notification = await db.scalar(
        select(EmailNotification)
        .where(
            or_(
                (EmailNotification.status == "pending") &
                (EmailNotification.next_attempt_at.is_(None) | (EmailNotification.next_attempt_at <= now)),
                (EmailNotification.status == "processing") & (EmailNotification.lease_until <= now),
            )
        )
        .order_by(EmailNotification.created_at, EmailNotification.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if notification is None:
        return False
    notification.status = "processing"
    notification.attempts += 1
    notification.lease_until = now + timedelta(seconds=LEASE_SECONDS)
    await db.commit()
    try:
        subject, text_body, html_body = _content(notification)
        message_digest = hashlib.sha256(notification.notification_key.encode()).hexdigest()
        message_id = f"<{message_digest}@mail.byponyo.com>"
        sent = await send_transactional_email(
            notification.recipient, subject, text_body, html_body, message_id,
        )
    except Exception as error:
        logger.warning("Email notification preparation failed id=%s exception_type=%s",
                       notification.notification_key, type(error).__name__)
        sent = False
        error_name = type(error).__name__
    else:
        error_name = "DeliveryFailed"
    current = await db.get(EmailNotification, notification.id, populate_existing=True)
    if sent:
        current.status = "sent"
        current.sent_at = datetime.now(timezone.utc)
        current.last_error = None
        current.lease_until = None
    elif current.attempts >= MAX_ATTEMPTS:
        current.status = "failed"
        current.last_error = error_name[:80]
        current.lease_until = None
        logger.error("Email notification exhausted retries id=%s", current.notification_key)
    else:
        current.status = "pending"
        current.last_error = error_name[:80]
        current.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(3600, 15 * (2 ** (current.attempts - 1))))
        current.lease_until = None
        logger.warning("Email notification scheduled retry id=%s attempt=%s",
                       current.notification_key, current.attempts)
    await db.commit()
    return True


async def transactional_email_worker() -> None:
    while True:
        try:
            async with SessionLocal() as db:
                processed = await send_one(db)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("Email notification worker iteration failed exception_type=%s", type(error).__name__)
            processed = False
        if not processed:
            await asyncio.sleep(2)
