"""Application settings loaded from environment / .env."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ut_scheduler"
    test_database_url: str | None = None
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_hours: int = 24
    algorithm: str = "HS256"
    cors_origins: str = "http://localhost:5173,https://YOUR_VERCEL_PROD_ORIGIN"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
