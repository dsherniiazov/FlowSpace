import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from backend.config import settings


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """Send a password reset email. Silently skips if SMTP is not configured."""
    if not settings.smtp_host or not settings.smtp_user:
        # SMTP not configured — log and skip instead of crashing
        print(f"[email] SMTP not configured. Reset link for {to_email}: {reset_link}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "FlowSpace — password reset"
    msg["From"] = settings.smtp_from or settings.smtp_user
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

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(msg["From"], [to_email], msg.as_string())
