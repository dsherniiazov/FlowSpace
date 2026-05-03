from pydantic import BaseModel


class EmailSettingsOut(BaseModel):
    frontend_base_url: str
    host: str
    port: int
    username: str
    password_configured: bool
    from_email: str
    use_tls: bool


class EmailSettingsUpdate(BaseModel):
    frontend_base_url: str = ""
    host: str = ""
    port: int = 587
    username: str = ""
    password: str | None = None
    from_email: str = ""
    use_tls: bool = True


class EmailTestRequest(BaseModel):
    to_email: str | None = None


class OAuthProviderSettingsOut(BaseModel):
    client_id: str
    client_secret_configured: bool


class OAuthProviderSettingsUpdate(BaseModel):
    client_id: str = ""
    client_secret: str | None = None


class OAuthSettingsOut(BaseModel):
    callback_base_url: str
    google: OAuthProviderSettingsOut
    github: OAuthProviderSettingsOut


class OAuthSettingsUpdate(BaseModel):
    callback_base_url: str = ""
    google: OAuthProviderSettingsUpdate
    github: OAuthProviderSettingsUpdate
