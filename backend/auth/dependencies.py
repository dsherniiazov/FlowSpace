from fastapi import Depends, HTTPException, status
from authlib.jose import jwt
from authlib.jose.errors import JoseError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.config import settings
from backend.services.user import UserService
from backend.utils.dependencies import get_db
from backend.utils.errors import DomainError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if not token and credentials:
        token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        claims = jwt.decode(token, settings.secret_key)
        header = getattr(claims, "header", {}) or {}
        if header.get("alg") != settings.algorithm:
            raise credentials_exception
        claims.validate()
        user_id = claims.get("sub")
        if user_id is None:
            raise credentials_exception
    except JoseError:
        raise credentials_exception

    try:
        user = UserService.get(db, int(user_id))
    except DomainError:
        raise credentials_exception
    return user


def get_current_admin(user=Depends(get_current_user)):
    if not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required",
        )
    return user
