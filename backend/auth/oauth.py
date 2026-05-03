from authlib.integrations.starlette_client import OAuth

from backend.services.app_settings import AppSettingsService

_oauth: OAuth | None = None


def reset_oauth() -> None:
    global _oauth
    _oauth = None


def get_oauth() -> OAuth:
    global _oauth
    if _oauth is None:
        oauth_settings = AppSettingsService.get_effective_oauth_settings()
        oauth = OAuth()

        if oauth_settings.google_client_id and oauth_settings.google_client_secret:
            oauth.register(
                name="google",
                client_id=oauth_settings.google_client_id,
                client_secret=oauth_settings.google_client_secret,
                server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
                client_kwargs={"scope": "openid email profile"},
            )

        if oauth_settings.github_client_id and oauth_settings.github_client_secret:
            oauth.register(
                name="github",
                client_id=oauth_settings.github_client_id,
                client_secret=oauth_settings.github_client_secret,
                authorize_url="https://github.com/login/oauth/authorize",
                access_token_url="https://github.com/login/oauth/access_token",
                api_base_url="https://api.github.com/",
                client_kwargs={"scope": "read:user user:email"},
            )

        _oauth = oauth
    return _oauth
