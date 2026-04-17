from pydantic import BaseModel


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


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
