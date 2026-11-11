import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from app.config import settings

logger = logging.getLogger(__name__)


def ponyo_branded_email_html(
    *, eyebrow: str, title: str, intro: str, content_html: str = "",
    action_label: str | None = None, action_url: str | None = None, footnote: str | None = None,
) -> str:
    """Shared, email-client-safe Ponyo layout for account and order messages."""
    storefront = urlsplit(settings.storefront_base_url)
    logo_url = (
        f"{storefront.scheme}://{storefront.netloc}/ponyo-email-jellyfish.png"
        if storefront.scheme == "https" and storefront.netloc else None
    )
    logo = (
        f'<img src="{escape(logo_url, quote=True)}" width="42" height="42" alt="" '
        'style="display:block;width:42px;height:42px;border:0;border-radius:14px;">'
        if logo_url else '<span style="font-size:23px;line-height:42px">🪼</span>'
    )
    parsed_action = urlsplit(action_url or "")
    safe_action = bool(
        (parsed_action.scheme == "https" and parsed_action.netloc and not parsed_action.username and not parsed_action.password)
        or (parsed_action.scheme == "http" and parsed_action.hostname in {"localhost", "127.0.0.1"})
    )
    action = ""
    if action_label and action_url and (safe_action or parsed_action.scheme == "mailto"):
        action = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 8px"><tr>'
            '<td bgcolor="#ed713d" style="border-radius:999px;background:#ed713d">'
            f'<a href="{escape(action_url, quote=True)}" style="display:inline-block;padding:15px 25px;border:1px solid #ed713d;'
            'border-radius:999px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;'
            'font-weight:700;line-height:20px;text-decoration:none">'
            f'{escape(action_label)}</a></td></tr></table>'
        )
    safe_footnote = (
        f'<p style="margin:18px 0 0;color:#8b776c;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px">'
        f'{escape(footnote)}</p>' if footnote else ""
    )
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f7eee8;color:#3f302b;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7eee8">
<tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 10px 18px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="middle" style="padding-right:10px">{logo}</td>
<td valign="middle"><div style="color:#3f302b;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:4px;line-height:28px">PONYO</div>
<div style="color:#8b776c;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;line-height:16px">A LITTLE WORLD OF PLUSH &amp; JOY</div></td>
</tr></table></td></tr>
<tr><td style="padding:0 0 5px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #eadbd1;border-radius:22px;overflow:hidden">
<tr><td height="5" bgcolor="#ed713d" style="height:5px;background:#ed713d;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px 30px 30px">
<p style="margin:0 0 12px;color:#a2502f;font-size:10px;font-weight:800;letter-spacing:2px;line-height:16px;text-transform:uppercase">{escape(eyebrow)}</p>
<h1 style="margin:0 0 13px;color:#3f302b;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;letter-spacing:-.4px;line-height:38px">{escape(title)}</h1>
<p style="margin:0;color:#6b5950;font-size:15px;line-height:24px">{escape(intro)}</p>
{content_html}{action}{safe_footnote}
<p style="margin:25px 0 0;border-top:1px solid #eee4dc;padding-top:18px;color:#6b5950;font-size:14px;line-height:22px">With care,<br><strong style="color:#3f302b">The Ponyo team</strong></p>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:15px 12px 0;color:#8b776c;font-size:11px;line-height:18px">Thoughtfully found. Ready to be loved.<br>This message is about your Ponyo account or order.</td></tr>
</table></td></tr></table></body></html>'''


def build_verification_message(sender: str, email: str, verification_url: str, *, logo_url: str | None = None) -> EmailMessage:
    """Prefer a public HTTPS PNG for webmail; embed a CID fallback for local use."""
    message = EmailMessage()
    message["Subject"] = "Verify your Ponyo email"
    message["From"] = formataddr(("Ponyo", sender))
    message["To"] = email
    message.set_content(
        "Welcome to Ponyo!\n\n"
        "Please verify your email address to activate your Ponyo account.\n\n"
        f"Verify Email Address:\n{verification_url}\n\n"
        "This secure link expires in 24 hours and can only be used once.\n"
        "If you did not create a Ponyo account, you can safely ignore this email.\n\n"
        "With care,\nThe Ponyo team"
    )
    logo_cid = make_msgid(domain="byponyo.com")
    logo_source = escape(logo_url or f"cid:{logo_cid[1:-1]}", quote=True)
    safe_url = escape(verification_url, quote=True)
    safe_email = escape(email)
    message.add_alternative(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your Ponyo email</title></head>
<body style="margin:0;padding:0;background-color:#fff8f1;color:#3f302b;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">One little step to your Ponyo account. Verify your email to get started.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fff8f1;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:0 0 24px;">
<img src="{logo_source}" width="72" height="72" alt="Ponyo jellyfish" style="display:block;width:72px;height:72px;border:0;outline:none;text-decoration:none;margin:0 auto 8px;">
<div style="font-size:26px;line-height:34px;font-weight:800;letter-spacing:5px;color:#3f302b;">PONYO</div>
<div style="margin-top:7px;font-size:12px;line-height:20px;letter-spacing:1px;color:#78675e;">A LITTLE WORLD OF PLUSH &amp; JOY</div>
</td></tr>
<tr><td style="background-color:#ffffff;border:1px solid #eddfd3;border-radius:20px;padding:38px 28px;">
<p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:2px;color:#a2502f;">YOUR PONYO ACCOUNT</p>
<h1 style="margin:0 0 20px;font-size:30px;line-height:38px;letter-spacing:-1px;color:#3f302b;">Welcome to Ponyo.</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#65554d;">A little world of plush friends is waiting for you. There&rsquo;s just one step before you can make yourself at home.</p>
<p style="margin:0 0 28px;font-size:15px;line-height:25px;color:#65554d;">Please confirm <strong style="color:#3f302b;word-break:break-word;">{safe_email}</strong> to activate your account.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px;"><tr>
<td align="center" bgcolor="#ed713d" style="background-color:#ed713d;border-radius:12px;mso-padding-alt:17px 28px;">
<a href="{safe_url}" target="_blank" style="display:block;background-color:#ed713d;border:1px solid #ed713d;border-radius:12px;padding:17px 28px;font-size:16px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;text-align:center;">Verify Email Address</a>
</td></tr></table>
<p style="margin:0 0 22px;font-size:13px;line-height:21px;color:#78675e;">For your security, this link expires in <strong>24 hours</strong> and can only be used once.</p>
<div style="border-top:1px solid #eee4db;padding-top:22px;">
<p style="margin:0;font-size:13px;line-height:22px;color:#78675e;">Didn&rsquo;t create a Ponyo account? You can safely ignore this email. Your address won&rsquo;t be verified unless you confirm it.</p>
</div>
<p style="margin:26px 0 0;font-size:14px;line-height:23px;color:#65554d;">With care,<br><strong style="color:#3f302b;">The Ponyo team</strong></p>
</td></tr>
<tr><td align="center" style="padding:24px 12px 0;font-size:12px;line-height:20px;color:#8a776c;">Thoughtfully found. Ready to be loved.<br>This is an account verification email, not a marketing subscription.</td></tr>
</table></td></tr></table>
</body></html>""", subtype="html")
    if logo_url is None:
        html_part = message.get_payload()[-1]
        root_cid = make_msgid(domain="byponyo.com")
        html_part["Content-ID"] = root_cid
        html_part.add_related(
            Path(__file__).with_name("assets").joinpath("ponyo-jellyfish.png").read_bytes(),
            maintype="image", subtype="png", cid=logo_cid, disposition="inline",
        )
        html_part.set_param("type", "text/html")
        html_part.set_param("start", root_cid)
    return message


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
    message.add_alternative(ponyo_branded_email_html(
        eyebrow="A note from the Ponyo community",
        title="A customer reached out",
        intro="A customer has sent a new note to your Ponyo team email. The request is also stored in Ponyo for follow-up.",
        content_html=(
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="margin-top:22px;border:1px solid #f0dfd4;border-radius:15px;background:#fffaf6">'
            f'<tr><td style="padding:16px 18px;color:#6b5950;font-size:13px;line-height:21px">'
            f'<p style="margin:0 0 7px"><strong style="color:#3f302b">From</strong> · {escape(name)} '
            f'&lt;{escape(email)}&gt;</p><p style="margin:0 0 12px"><strong style="color:#3f302b">Topic</strong> · '
            f'{escape(safe_request_type)}</p><div style="border-top:1px solid #eee4dc;padding-top:12px;'
            f'color:#4d3b33;font-size:14px;line-height:23px;white-space:pre-wrap;word-break:break-word">'
            f'{escape(message_text)}</div></td></tr></table>'
        ),
        action_label="Reply to customer",
        action_url=f"mailto:{email}",
        footnote="The original message remains available in the contact request record for follow-up.",
    ), subtype="html")

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
    except Exception as error:
        logger.warning("Ponyo contact notification email failed exception_type=%s", type(error).__name__)
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
    message.add_alternative(ponyo_branded_email_html(
        eyebrow="Your Ponyo account",
        title="A fresh start is one click away.",
        intro="We received a request to reset the password for your Ponyo account.",
        content_html=(
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="margin-top:20px;border:1px solid #f0dfd4;border-radius:15px;background:#fffaf6">'
            '<tr><td style="padding:15px 18px;color:#6b5950;font-size:13px;line-height:21px">'
            '<strong style="color:#3f302b">For your security</strong><br>This private link works once and expires in one hour.'
            '</td></tr></table>'
        ),
        action_label="Reset my password",
        action_url=reset_url,
        footnote="If you didn’t ask for a password reset, you can safely ignore this message. Your password won’t change.",
    ), subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_password_reset_email(email: str, reset_url: str) -> bool:
    if settings.environment == "local" and not settings.smtp_host:
        logger.info("Local password-reset email skipped because SMTP is not configured")
        return False
    if not settings.contact_email_configured:
        return False
    try:
        await asyncio.to_thread(_send_password_reset_email, email, reset_url)
        return True
    except Exception as error:
        logger.warning("Ponyo password reset email failed exception_type=%s", type(error).__name__)
        return False


def _send_verification_email(email: str, verification_url: str) -> None:
    sender = settings.smtp_from_email or settings.smtp_username
    if not settings.smtp_host or not sender:
        raise RuntimeError("Verification email transport is not configured")

    storefront = urlsplit(settings.storefront_base_url)
    logo_url = (
        f"{storefront.scheme}://{storefront.netloc}/ponyo-email-jellyfish.png"
        if storefront.scheme == "https" else None
    )
    message = build_verification_message(sender, email, verification_url, logo_url=logo_url)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_verification_email(email: str, verification_url: str) -> bool:
    if settings.environment == "local" and not settings.smtp_host:
        logger.info("Local verification email skipped because SMTP is not configured")
        return False
    if not settings.contact_email_configured:
        return False
    try:
        await asyncio.to_thread(_send_verification_email, email, verification_url)
        return True
    except Exception as error:
        logger.warning("Ponyo verification email failed exception_type=%s", type(error).__name__)
        return False


def _send_transactional_email(recipient: str, subject: str, text_body: str, html_body: str, message_id: str) -> None:
    sender = settings.smtp_from_email or settings.smtp_username
    if not settings.contact_email_configured or not sender:
        raise RuntimeError("Transactional email transport is not configured")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("Ponyo", sender))
    message["To"] = recipient
    message["Message-ID"] = message_id
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)


async def send_transactional_email(
    recipient: str, subject: str, text_body: str, html_body: str, message_id: str,
) -> bool:
    """Send a prepared transactional notice without logging recipient or message content."""
    try:
        await asyncio.to_thread(
            _send_transactional_email, recipient, subject, text_body, html_body, message_id,
        )
        return True
    except Exception as error:
        logger.warning("Transactional email delivery failed exception_type=%s", type(error).__name__)
        return False
