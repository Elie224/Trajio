"""Outbound email. Failures never change the HTTP contract (anti-enumeration)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("trajio.mail")


def _send(to_email: str, subject: str, body: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("SMTP_HOST unset: email skipped to a recipient (subject=%s)", subject)
        return
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)


def deliver_password_reset(to_email: str, token: str) -> None:
    link = f"{settings.PUBLIC_WEB_BASE_URL.rstrip('/')}/reset-password?token={token}"
    try:
        _send(
            to_email,
            "Réinitialisation de votre mot de passe Trajio",
            "Vous avez demandé à réinitialiser votre mot de passe.\n\n"
            f"Lien (valable 30 minutes) : {link}\n\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
        )
    except Exception:
        logger.exception("password reset email failed")


def deliver_email_verification(to_email: str, token: str) -> None:
    link = f"{settings.PUBLIC_WEB_BASE_URL.rstrip('/')}/login?verify={token}"
    try:
        _send(
            to_email,
            "Vérifiez votre adresse email Trajio",
            "Bienvenue sur Trajio.\n\n"
            f"Confirmez votre adresse : {link}\n\n"
            "Si vous n'avez pas créé de compte, ignorez ce message.",
        )
    except Exception:
        logger.exception("verification email failed")
