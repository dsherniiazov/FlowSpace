from pydantic import BaseModel, field_validator


class RegisterRequest(BaseModel):
    email: str
    name: str
    last_name: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OAuthProvidersResponse(BaseModel):
    google: bool
    github: bool


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def strip_email(cls, value: str) -> str:
        return value.strip()


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
