import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def _send_contact_email(name: str, email: str, request_type: str, message_text: str) -> None:
    sender = settings.smtp_from_email or settings.smtp_username
    if not settings.smtp_host or not sender:
        raise RuntimeError("Contact email transport is not configured")
    safe_request_type = " ".join(request_type.splitlines()).strip() or "Storefront request"

    message = EmailMessage()
    message["Subject"] = f"Ponyo request received: {safe_request_type}"
    message["From"] = sender
    message["To"] = settings.contact_notification_email
    message["Reply-To"] = email
    message.set_content(
        "A new request was submitted through the Ponyo storefront.\n\n"
        f"Request type: {safe_request_type}\n"
        f"Name: {name}\n"
        f"Customer email: {email}\n\n"
        "Message:\n"
        f"{message_text}\n"
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_contact_notification(name: str, email: str, request_type: str, message_text: str) -> bool:
    """Send the optional owner notification; database/outbox persistence is handled separately."""
    if not settings.contact_email_configured:
        return False
    try:
        await asyncio.to_thread(_send_contact_email, name, email, request_type, message_text)
        return True
    except Exception:
        logger.exception("Ponyo contact notification email failed")
        return False


def _send_password_reset_email(email: str, reset_url: str) -> None:
    sender = settings.smtp_from_email or settings.smtp_username
    if not settings.smtp_host or not sender:
        raise RuntimeError("Password reset email transport is not configured")

    message = EmailMessage()
    message["Subject"] = "Reset your Ponyo password"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        "We received a request to reset the password for your Ponyo account.\n\n"
        f"Choose a new password here (this link expires in one hour):\n{reset_url}\n\n"
        "If you did not ask for this, you can safely ignore this email."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_password_reset_email(email: str, reset_url: str) -> bool:
    if not settings.contact_email_configured:
        return False
    try:
        await asyncio.to_thread(_send_password_reset_email, email, reset_url)
        return True
    except Exception:
        logger.exception("Ponyo password reset email failed")
        return False
