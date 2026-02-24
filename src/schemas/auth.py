from pydantic import BaseModel


class RegisterRequest(BaseModel):
    email: str
    name: str
    last_name: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
