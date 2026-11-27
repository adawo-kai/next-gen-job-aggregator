"""Transactional e-mail over SMTP (stdlib, run in a thread).

SMTP_URL format: smtps://user:password@smtp.host:465  or  smtp://user:password@host:587 (STARTTLS).
Works with any provider's free tier (Brevo, Resend SMTP, Mailjet, Yandex 360, Gmail app password).
Without SMTP_URL nothing is sent: the message is logged, so local dev still shows reset links.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from urllib.parse import unquote, urlparse

from app.config import get_settings
from app.observability import log


def _send_sync(to: str, subject: str, text: str, html: str | None) -> None:
    s = get_settings()
    u = urlparse(s.smtp_url or "")
    name, addr = parseaddr(s.mail_from)
    msg = EmailMessage()
    msg["From"] = formataddr((name or "JobRadar", addr))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if u.scheme == "smtps":
        server: smtplib.SMTP = smtplib.SMTP_SSL(u.hostname, u.port or 465, context=ctx, timeout=20)
    else:
        server = smtplib.SMTP(u.hostname, u.port or 587, timeout=20)
        server.starttls(context=ctx)
    try:
        if u.username:
            server.login(unquote(u.username), unquote(u.password or ""))
        server.send_message(msg)
    finally:
        server.quit()


async def send_mail(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not get_settings().smtp_url:
        log.warning("mail_not_configured", to=to, subject=subject, body=text)
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, text, html)
        log.info("mail_sent", to=to, subject=subject)
        return True
    except Exception as e:  # never leak SMTP errors to the client
        log.error("mail_failed", to=to, error=str(e)[:300])
        return False
