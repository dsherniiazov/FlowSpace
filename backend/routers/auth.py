import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.auth.oauth import get_oauth
from backend.auth.security import create_access_token, get_password_hash, verify_password
from backend.config import settings
from backend.models.users import User
from backend.schemas.auth import (
    ForgotPasswordRequest,
    OAuthProvidersResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from backend.schemas.users import UserPublic
from backend.services.auth import append_token_to_redirect, get_or_create_oauth_user
from backend.services.email import send_password_reset_email
from backend.services.user import UserService
from backend.utils.dependencies import get_db
from backend.utils.errors import ValidationError

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "is_admin": bool(user.is_admin)})


@router.get("/oauth/providers", response_model=OAuthProvidersResponse)
def oauth_providers() -> OAuthProvidersResponse:
    return OAuthProvidersResponse(
        google=bool(settings.google_client_id.strip() and settings.google_client_secret.strip()),
        github=bool(settings.github_client_id.strip() and settings.github_client_secret.strip()),
    )


@router.post("/register", response_model=UserPublic)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if UserService.get_by_email(db, data.email):
        raise ValidationError("Email already registered")
    return UserService.create(
        db,
        email=data.email,
        name=data.name,
        last_name=data.last_name,
        password_hash=get_password_hash(data.password),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = UserService.get_by_email(db, form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=_build_token(user))


@router.post("/forgot-password", status_code=200)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict:
    # Always 200 so attackers can't probe which emails are registered.
    user = UserService.get_by_email(db, data.email)
    if user:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        UserService.update(db, user.id, {"reset_token": token, "reset_token_expires": expires})
        reset_link = f"{settings.frontend_url}/auth/reset-password?token={token}"
        send_password_reset_email(user.email, reset_link)
    return {"detail": "If this email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict:
    if len(data.new_password) < 6:
        raise ValidationError("Password must be at least 6 characters")

    user = db.query(User).filter(User.reset_token == data.token).first()
    expires = user.reset_token_expires if user else None
    if not user or expires is None:
        raise ValidationError("Invalid or expired reset token")
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise ValidationError("Invalid or expired reset token")

    UserService.update(db, user.id, {
        "password_hash": get_password_hash(data.new_password),
        "reset_token": None,
        "reset_token_expires": None,
    })
    return {"detail": "Password has been reset successfully"}


def _get_oauth_client(provider: str):
    client = get_oauth().create_client(provider)
    if client is None:
        raise ValidationError("OAuth provider not configured")
    return client


async def _extract_google_profile(client, token) -> dict:
    user_info = token.get("userinfo")
    if user_info:
        return user_info
    if token.get("id_token"):
        return await client.parse_id_token(None, token)
    response = await client.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        token=token,
    )
    if response.status_code >= 400:
        raise ValidationError("Failed to fetch Google userinfo")
    return response.json()


async def _extract_github_profile(client, token) -> dict:
    profile_resp = await client.get("user", token=token)
    if profile_resp.status_code >= 400:
        raise ValidationError("Failed to fetch GitHub profile")
    profile = profile_resp.json()
    email = profile.get("email")
    if not email:
        emails_resp = await client.get("user/emails", token=token)
        if emails_resp.status_code >= 400:
            raise ValidationError("Failed to fetch GitHub email")
        emails = emails_resp.json()
        if isinstance(emails, list) and emails:
            primary = next(
                (item for item in emails if item.get("primary") and item.get("verified")),
                None,
            )
            email = (primary or emails[0]).get("email")
    return {
        "email": email,
        "name": profile.get("name") or profile.get("login"),
    }


@router.get("/oauth/{provider}/login")
async def oauth_login(
    provider: str,
    request: Request,
    redirect_to: str | None = Query(default=None),
):
    client = _get_oauth_client(provider)
    if redirect_to:
        request.session["oauth_redirect_to"] = redirect_to
    redirect_uri = request.url_for("oauth_callback", provider=provider)
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/oauth/{provider}/callback", name="oauth_callback", response_model=TokenResponse)
async def oauth_callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    client = _get_oauth_client(provider)
    try:
        token = await client.authorize_access_token(request)
    except Exception:
        raise ValidationError("OAuth authorization failed")

    if provider == "google":
        info = await _extract_google_profile(client, token)
        email = info.get("email")
        user = get_or_create_oauth_user(
            db,
            email=email,
            full_name=info.get("name"),
            given_name=info.get("given_name"),
            family_name=info.get("family_name"),
        )
    elif provider == "github":
        info = await _extract_github_profile(client, token)
        user = get_or_create_oauth_user(
            db,
            email=info.get("email"),
            full_name=info.get("name"),
            given_name=None,
            family_name=None,
        )
    else:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider")

    access_token = _build_token(user)
    redirect_to = request.session.pop("oauth_redirect_to", None)
    if redirect_to:
        redirect_url = append_token_to_redirect(redirect_to, access_token, user.email)
        if redirect_url:
            return RedirectResponse(url=redirect_url)
    return TokenResponse(access_token=access_token)
