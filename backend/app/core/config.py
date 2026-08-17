"""Application settings loaded from environment / .env."""

from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.schedule_config import DEFAULT_CLINIC_TIMEZONE


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ut_scheduler"
    test_database_url: str | None = None
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_hours: int = 24
    algorithm: str = "HS256"
    cors_origins: str = "http://localhost:5173,https://YOUR_VERCEL_PROD_ORIGIN"
    clinic_timezone: str = DEFAULT_CLINIC_TIMEZONE

    @field_validator("clinic_timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        # Fail at boot rather than silently scheduling in the wrong zone.
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"CLINIC_TIMEZONE {value!r} is not a valid IANA timezone") from exc
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
