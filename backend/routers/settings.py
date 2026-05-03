from email.utils import parseaddr
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_admin
from backend.auth.oauth import reset_oauth
from backend.models.users import User
from backend.schemas.settings import (
    EmailSettingsOut,
    EmailSettingsUpdate,
    EmailTestRequest,
    OAuthProviderSettingsOut,
    OAuthSettingsOut,
    OAuthSettingsUpdate,
)
from backend.services.app_settings import AppSettingsService
from backend.services.email import send_test_email
from backend.utils.dependencies import get_db
from backend.utils.errors import ValidationError

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(get_current_admin)])


def is_valid_email_address(value: str) -> bool:
    parsed_name, parsed_email = parseaddr(value)
    return not parsed_name and parsed_email == value and "@" in parsed_email and "." in parsed_email.rsplit("@", 1)[-1]


def _normalize_http_base_url(value: str, *, label: str) -> str:
    base_url = value.strip().rstrip("/")
    if not base_url:
        return ""
    if "://" not in base_url:
        base_url = f"https://{base_url}"
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValidationError(f"{label} must be a valid http(s) URL")
    if parsed.query or parsed.fragment:
        raise ValidationError(f"{label} must not include query parameters or a fragment")
    return base_url


def normalize_callback_base_url(value: str) -> str:
    return _normalize_http_base_url(value, label="OAuth callback base URL")


def normalize_public_frontend_base_url(value: str) -> str:
    return _normalize_http_base_url(value, label="Public frontend URL")


@router.get("/email", response_model=EmailSettingsOut)
def get_email_settings(db: Session = Depends(get_db)) -> EmailSettingsOut:
    effective = AppSettingsService.get_effective_email_settings(db)
    frontend_base = AppSettingsService.get_effective_frontend_base_url(db)
    return EmailSettingsOut(
        frontend_base_url=frontend_base,
        host=effective.host,
        port=effective.port,
        username=effective.username,
        password_configured=bool(effective.password),
        from_email=effective.from_email,
        use_tls=effective.use_tls,
    )


@router.put("/email", response_model=EmailSettingsOut)
def update_email_settings(data: EmailSettingsUpdate, db: Session = Depends(get_db)) -> EmailSettingsOut:
    host = data.host.strip()
    username = data.username.strip()
    if (host and not username) or (username and not host):
        raise ValidationError("SMTP host and username must both be set, or leave both empty to disable outbound mail")
    if data.port < 1 or data.port > 65535:
        raise ValidationError("SMTP port must be between 1 and 65535")

    values: dict[str, str | None] = {
        "public_frontend_base_url": normalize_public_frontend_base_url(data.frontend_base_url or ""),
        "smtp_host": host,
        "smtp_port": str(data.port),
        "smtp_user": username,
        "smtp_from": data.from_email.strip(),
        "smtp_use_tls": str(data.use_tls).lower(),
    }
    if data.password is not None and data.password != "":
        values["smtp_password"] = data.password
    AppSettingsService.set_values(db, values)
    return get_email_settings(db)


@router.post("/email/test")
def test_email_settings(
    data: EmailTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> dict[str, str]:
    recipient = (data.to_email or current_user.email).strip()
    if not recipient:
        raise ValidationError("Test recipient email is required")
    if not is_valid_email_address(recipient):
        raise ValidationError("Test recipient email must be a valid email address")
    try:
        email_settings = AppSettingsService.get_effective_email_settings(db)
        send_test_email(recipient, email_settings, db=db)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMTP test failed: {exc}") from exc
    return {"detail": f"Test email sent to {recipient}"}


@router.get("/oauth", response_model=OAuthSettingsOut)
def get_oauth_settings(db: Session = Depends(get_db)) -> OAuthSettingsOut:
    effective = AppSettingsService.get_effective_oauth_settings(db)
    return OAuthSettingsOut(
        callback_base_url=effective.callback_base_url,
        google=OAuthProviderSettingsOut(
            client_id=effective.google_client_id,
            client_secret_configured=bool(effective.google_client_secret),
        ),
        github=OAuthProviderSettingsOut(
            client_id=effective.github_client_id,
            client_secret_configured=bool(effective.github_client_secret),
        ),
    )


@router.put("/oauth", response_model=OAuthSettingsOut)
def update_oauth_settings(data: OAuthSettingsUpdate, db: Session = Depends(get_db)) -> OAuthSettingsOut:
    values: dict[str, str | None] = {
        "oauth_callback_base_url": normalize_callback_base_url(data.callback_base_url),
        "google_client_id": data.google.client_id.strip(),
        "github_client_id": data.github.client_id.strip(),
    }
    if data.google.client_secret is not None and data.google.client_secret != "":
        values["google_client_secret"] = data.google.client_secret
    if data.github.client_secret is not None and data.github.client_secret != "":
        values["github_client_secret"] = data.github.client_secret

    AppSettingsService.set_values(db, values)
    reset_oauth()
    return get_oauth_settings(db)
