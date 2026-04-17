import secrets
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.orm import Session

from backend.auth.security import get_password_hash
from backend.models.users import User
from backend.services.user import UserService
from backend.utils.errors import ValidationError


def split_full_name(full_name: str | None) -> tuple[str, str]:
    parts = [part for part in (full_name or "").strip().split() if part]
    if not parts:
        return "User", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def get_or_create_oauth_user(
    db: Session,
    email: str | None,
    full_name: str | None,
    given_name: str | None,
    family_name: str | None,
) -> User:
    if not email:
        raise ValidationError("Email not available from provider")

    user = UserService.get_by_email(db, email)
    if user:
        return user

    if given_name or family_name:
        name = given_name or "User"
        last_name = family_name or ""
    else:
        name, last_name = split_full_name(full_name)

    return UserService.create(
        db,
        email=email,
        name=name,
        last_name=last_name,
        password_hash=get_password_hash(secrets.token_urlsafe(32)),
    )


def append_token_to_redirect(redirect_to: str, access_token: str, email: str) -> str | None:
    parsed = urlparse(redirect_to)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["access_token"] = access_token
    query["email"] = email
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(query),
            parsed.fragment,
        )
    )
