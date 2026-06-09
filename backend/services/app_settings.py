from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import SessionLocal
from backend.models.app_settings import AppSetting
from backend.utils.db import commit


def _bool_from_optional_setting(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    stripped = raw.strip()
    if not stripped:
        return default
    return stripped.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class EffectiveEmailSettings:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    use_tls: bool


@dataclass(frozen=True)
class EffectiveOAuthSettings:
    callback_base_url: str
    google_client_id: str
    google_client_secret: str
    github_client_id: str
    github_client_secret: str


class AppSettingsService:
    PUBLIC_FRONTEND_BASE_URL_KEY = "public_frontend_base_url"
    EMAIL_KEYS = {
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_password",
        "smtp_from",
        "smtp_use_tls",
    }
    OAUTH_KEYS = {
        "oauth_callback_base_url",
        "google_client_id",
        "google_client_secret",
        "github_client_id",
        "github_client_secret",
    }

    @staticmethod
    def get_values(db: Session, keys: set[str]) -> dict[str, str]:
        rows = db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()
        return {row.key: row.value or "" for row in rows}

    @staticmethod
    def set_values(db: Session, values: dict[str, str | None]) -> None:
        for key, value in values.items():
            row = db.query(AppSetting).filter(AppSetting.key == key).first()
            if row is None:
                row = AppSetting(key=key, value=value)
                db.add(row)
            else:
                row.value = value
        commit(db)

    @staticmethod
    def get_effective_email_settings(db: Session | None = None) -> EffectiveEmailSettings:
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        try:
            values = AppSettingsService.get_values(db, AppSettingsService.EMAIL_KEYS)
            host = (values.get("smtp_host") or "").strip() or settings.smtp_host
            username = (values.get("smtp_user") or "").strip() or settings.smtp_user
            password = (values.get("smtp_password") or "").strip() or settings.smtp_password
            from_email = (values.get("smtp_from") or "").strip() or settings.smtp_from
            port_raw = (values.get("smtp_port") or "").strip() or str(settings.smtp_port)
            try:
                port = int(port_raw)
            except (TypeError, ValueError):
                port = settings.smtp_port
            use_tls = _bool_from_optional_setting(values.get("smtp_use_tls"), True)
            return EffectiveEmailSettings(
                host=host,
                port=port,
                username=username,
                password=password,
                from_email=from_email,
                use_tls=use_tls,
            )
        finally:
            if close_db:
                db.close()

    @staticmethod
    def get_effective_frontend_base_url(db: Session | None = None) -> str:
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        try:
            values = AppSettingsService.get_values(db, {AppSettingsService.PUBLIC_FRONTEND_BASE_URL_KEY})
            raw = (values.get(AppSettingsService.PUBLIC_FRONTEND_BASE_URL_KEY) or "").strip()
            fallback = settings.frontend_url.strip() or ""
            merged = raw or fallback
            return merged.rstrip("/")
        finally:
            if close_db:
                db.close()

    @staticmethod
    def get_effective_oauth_settings(db: Session | None = None) -> EffectiveOAuthSettings:
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        try:
            values = AppSettingsService.get_values(db, AppSettingsService.OAUTH_KEYS)
            return EffectiveOAuthSettings(
                callback_base_url=values.get("oauth_callback_base_url", settings.public_api_url),
                google_client_id=values.get("google_client_id", settings.google_client_id),
                google_client_secret=values.get("google_client_secret", settings.google_client_secret),
                github_client_id=values.get("github_client_id", settings.github_client_id),
                github_client_secret=values.get("github_client_secret", settings.github_client_secret),
            )
        finally:
            if close_db:
                db.close()
