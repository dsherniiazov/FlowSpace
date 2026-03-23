import secrets
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.config import settings
from backend.services.user import UserService
from backend.schemas.auth import OAuthProvidersResponse, RegisterRequest, TokenResponse
from backend.schemas.users import UserPublic
from backend.auth.security import get_password_hash, verify_password, create_access_token
from backend.auth.oauth import get_oauth
from backend.utils.dependencies import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/oauth/providers", response_model=OAuthProvidersResponse)
def oauth_providers() -> OAuthProvidersResponse:
    return OAuthProvidersResponse(
        google=bool(settings.google_client_id.strip() and settings.google_client_secret.strip()),
        github=bool(settings.github_client_id.strip() and settings.github_client_secret.strip()),
    )


@router.post("/register", response_model=UserPublic)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    existing = UserService.get_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

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

    access_token = create_access_token({"sub": str(user.id), "is_admin": bool(user.is_admin)})
    return TokenResponse(access_token=access_token)


def _split_name(full_name: str | None) -> tuple[str, str]:
    if not full_name:
        return "User", ""
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "User", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _get_or_create_oauth_user(
    db: Session,
    email: str | None,
    full_name: str | None,
    given_name: str | None,
    family_name: str | None,
):
    if not email:
        raise HTTPException(status_code=400, detail="Email not available from provider")

    user = UserService.get_by_email(db, email)
    if user:
        return user

    if given_name or family_name:
        name = given_name or "User"
        last_name = family_name or ""
    else:
        name, last_name = _split_name(full_name)

    password_hash = get_password_hash(secrets.token_urlsafe(32))
    return UserService.create(
        db,
        email=email,
        name=name,
        last_name=last_name,
        password_hash=password_hash,
    )


@router.get("/oauth/{provider}/login")
async def oauth_login(
    provider: str,
    request: Request,
    redirect_to: str | None = Query(default=None),
):
    oauth = get_oauth()
    client = oauth.create_client(provider)
    if client is None:
        raise HTTPException(status_code=400, detail="OAuth provider not configured")

    if redirect_to:
        request.session["oauth_redirect_to"] = redirect_to

    redirect_uri = request.url_for("oauth_callback", provider=provider)
    print("Redirect URI:", redirect_uri)
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/oauth/{provider}/callback", name="oauth_callback", response_model=TokenResponse)
async def oauth_callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    oauth = get_oauth()
    client = oauth.create_client(provider)
    if client is None:
        raise HTTPException(status_code=400, detail="OAuth provider not configured")

    try:
        token = await client.authorize_access_token(request)
    except Exception:
        raise HTTPException(status_code=400, detail="OAuth authorization failed")

    email = None
    full_name = None
    given_name = None
    family_name = None

    if provider == "google":
        user_info = token.get("userinfo")
        if not user_info:
            if token.get("id_token"):
                user_info = await client.parse_id_token(request, token)
            else:
                userinfo_resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    token=token,
                )
                if userinfo_resp.status_code >= 400:
                    raise HTTPException(status_code=400, detail="Failed to fetch Google userinfo")
                user_info = userinfo_resp.json()

        email = user_info.get("email")
        full_name = user_info.get("name")
        given_name = user_info.get("given_name")
        family_name = user_info.get("family_name")
    elif provider == "github":
        profile_resp = await client.get("user", token=token)
        if profile_resp.status_code >= 400:
            raise HTTPException(status_code=400, detail="Failed to fetch GitHub profile")
        profile = profile_resp.json()
        email = profile.get("email")
        full_name = profile.get("name") or profile.get("login")

        if not email:
            emails_resp = await client.get("user/emails", token=token)
            if emails_resp.status_code >= 400:
                raise HTTPException(status_code=400, detail="Failed to fetch GitHub email")
            emails = emails_resp.json()
            if isinstance(emails, list) and emails:
                primary = next(
                    (item for item in emails if item.get("primary") and item.get("verified")),
                    None,
                )
                email = (primary or emails[0]).get("email")
    else:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider")

    user = _get_or_create_oauth_user(
        db,
        email=email,
        full_name=full_name,
        given_name=given_name,
        family_name=family_name,
    )

    access_token = create_access_token({"sub": str(user.id), "is_admin": bool(user.is_admin)})

    redirect_to = request.session.pop("oauth_redirect_to", None)
    if redirect_to:
        parsed = urlparse(redirect_to)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            query = dict(parse_qsl(parsed.query, keep_blank_values=True))
            query["access_token"] = access_token
            query["email"] = user.email
            redirect_url = urlunparse(
                (
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    parsed.params,
                    urlencode(query),
                    parsed.fragment,
                )
            )
            return RedirectResponse(url=redirect_url)

    return TokenResponse(access_token=access_token)
