from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "dev-secret-change-me-in-production-please-32b"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: str = "dev"
    DATABASE_URL: str = "postgresql+psycopg://restaurant:restaurant@localhost:5433/restaurant"
    TEST_DATABASE_URL: str = "postgresql+psycopg://restaurant:restaurant@localhost:5433/restaurant_test"

    JWT_SECRET: str = DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    COOKIE_NAME: str = "access_token"
    COOKIE_SECURE: bool = False

    # Comma-separated list of allowed origins (only needed when the browser calls the API directly).
    CORS_ORIGINS: str = "http://localhost:3000"

    MEDIA_DIR: str = "media"
    MAX_UPLOAD_BYTES: int = 2 * 1024 * 1024

    TIMEZONE: str = "Asia/Kolkata"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _normalise_database_url(self) -> "Settings":
        # Hosting providers (Render, Railway, Heroku) hand out postgres:// URLs; SQLAlchemy needs the driver name.
        for field in ("DATABASE_URL", "TEST_DATABASE_URL"):
            url: str = getattr(self, field)
            for prefix in ("postgres://", "postgresql://"):
                if url.startswith(prefix):
                    setattr(self, field, "postgresql+psycopg://" + url[len(prefix) :])
        return self

    @model_validator(mode="after")
    def _refuse_default_secret_in_prod(self) -> "Settings":
        if self.ENV not in ("dev", "test") and self.JWT_SECRET == DEFAULT_SECRET:
            raise ValueError("JWT_SECRET must be set to a strong value outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
