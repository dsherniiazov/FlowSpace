import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from sqlalchemy.orm import Session

from backend.services.app_settings import AppSettingsService, EffectiveEmailSettings


logger = logging.getLogger(__name__)


def _smtp_outbound_ready(settings: EffectiveEmailSettings) -> bool:
    return bool(settings.host and settings.username and settings.password)


def send_password_reset_email(
    to_email: str,
    reset_link: str,
    *,
    db: Session | None = None,
) -> None:
    email_settings = AppSettingsService.get_effective_email_settings(db)
    if not _smtp_outbound_ready(email_settings):
        logger.warning(
            "SMTP not ready for outbound mail (host=%s user=%s password_set=%s); password reset skipped for %s",
            bool(email_settings.host),
            bool(email_settings.username),
            bool(email_settings.password),
            to_email,
        )
        logger.info("Password reset link for %s: %s", to_email, reset_link)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "FlowSpace: password reset"
    msg["From"] = email_settings.from_email or email_settings.username
    msg["To"] = to_email

    text_body = (
        f"You requested a password reset for your FlowSpace account.\n\n"
        f"Click the link below to set a new password:\n{reset_link}\n\n"
        f"This link expires in 1 hour.\n\n"
        f"If you did not request a password reset, you can safely ignore this email."
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827;">
      <h2 style="margin:0 0 16px;font-size:20px;">Reset your FlowSpace password</h2>
      <p style="margin:0 0 24px;color:#374151;">
        You requested a password reset. Click the button below to set a new password.
      </p>
      <a href="{reset_link}"
         style="display:inline-block;padding:12px 24px;background:#0050ff;color:#fff;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Reset password
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
        This link expires in 1 hour. If you did not request a reset, ignore this email.
      </p>
    </div>
    """

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    _send_message(to_email, msg, db=db)


def send_review_notification_email(
    to_email: str,
    system_title: str,
    reviewer_name: str | None,
    body: str | None,
    *,
    db: Session | None = None,
) -> None:
    email_settings = AppSettingsService.get_effective_email_settings(db)
    if not _smtp_outbound_ready(email_settings):
        logger.warning(
            "SMTP not ready for outbound mail; review notification skipped for %s",
            to_email,
        )
        return

    reviewer_text = reviewer_name or "A teacher"
    safe_reviewer_text = escape(reviewer_text)
    safe_system_title = escape(system_title)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f'FlowSpace: "{system_title}" was reviewed'
    msg["From"] = email_settings.from_email or email_settings.username
    msg["To"] = to_email

    comment_text = body.strip() if body else "No comment was added."
    safe_comment_text = escape(comment_text)
    text_body = (
        f'{reviewer_text} reviewed your FlowSpace system "{system_title}".\n\n'
        f"{comment_text}\n\n"
        f"Open FlowSpace to view the notification and continue working."
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827;">
      <h2 style="margin:0 0 16px;font-size:20px;">Your system was reviewed</h2>
      <p style="margin:0 0 12px;color:#374151;">
        {safe_reviewer_text} reviewed <strong>{safe_system_title}</strong>.
      </p>
      <p style="margin:0;color:#374151;white-space:pre-wrap;">{safe_comment_text}</p>
    </div>
    """
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    _send_message(to_email, msg, db=db)


def send_test_email(to_email: str, email_settings=None, db: Session | None = None) -> None:
    email_settings = email_settings or AppSettingsService.get_effective_email_settings(db)
    if not _smtp_outbound_ready(email_settings):
        raise RuntimeError(
            "SMTP is incomplete. Save host, username, and password, then try again."
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "FlowSpace: SMTP test"
    msg["From"] = email_settings.from_email or email_settings.username
    msg["To"] = to_email
    msg.attach(MIMEText("FlowSpace SMTP settings are working.", "plain", "utf-8"))
    msg.attach(MIMEText("<p>FlowSpace SMTP settings are working.</p>", "html", "utf-8"))
    _send_message(to_email, msg, email_settings, db=db)


def _send_message(
    to_email: str,
    msg: MIMEMultipart,
    email_settings: EffectiveEmailSettings | None = None,
    *,
    db: Session | None = None,
) -> None:
    email_settings = email_settings or AppSettingsService.get_effective_email_settings(db)
    with smtplib.SMTP(email_settings.host, email_settings.port) as server:
        server.ehlo()
        if email_settings.use_tls:
            server.starttls()
            server.ehlo()
        server.login(email_settings.username, email_settings.password)
        server.sendmail(msg["From"], [to_email], msg.as_string())
