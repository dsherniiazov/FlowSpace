from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    db_url: str
    RUN_MIGRATIONS: bool = False
    secret_key: str = "CHANGE_ME"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 300
    db_echo: bool = False  # Set to True for SQL query log
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
