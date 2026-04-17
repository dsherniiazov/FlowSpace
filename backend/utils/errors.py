from fastapi import Request, status
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST


class NotFoundError(DomainError):
    status_code = status.HTTP_404_NOT_FOUND


class AccessDeniedError(DomainError):
    status_code = status.HTTP_403_FORBIDDEN


class ConflictError(DomainError):
    status_code = status.HTTP_409_CONFLICT


class ValidationError(DomainError):
    status_code = status.HTTP_400_BAD_REQUEST


async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})
