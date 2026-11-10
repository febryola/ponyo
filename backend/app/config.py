from functools import lru_cache
from typing import Literal
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env.local", ".env"), extra="ignore")

    environment: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    storefront_base_url: str = "http://localhost:3000"
    frontend_origins: str = "http://localhost:3000,http://localhost:3003"
    database_url: str = "postgresql+asyncpg://ponyo:ponyo@localhost:5433/ponyo"
    database_host: str | None = None
    database_port: int = 5432
    database_name: str | None = None
    database_user: str | None = None
    database_password: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    redis_host: str | None = None
    redis_port: int = 6379
    redis_password: str | None = None

    jwt_secret: str = "development-only-change-me-32-characters"
    jwt_issuer: str = "ponyo-api"
    session_cookie_name: str = "ponyo_session"
    csrf_cookie_name: str = "ponyo_csrf"
    cookie_domain: str | None = None
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_ttl_seconds: int = 60 * 60 * 24 * 7

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_success_url: str = "http://localhost:3000/orders?checkout=success"
    stripe_cancel_url: str = "http://localhost:3000/checkout?checkout=cancelled"

    aws_region: str = "ap-northeast-1"
    translation_provider: Literal["disabled", "aws_translate"] = "disabled"
    translation_timeout_seconds: int = 8
    s3_bucket: str | None = None
    sqs_order_events_url: str | None = None
    eventbridge_bus_name: str | None = None

    contact_notification_email: str = "febryola0402@gmail.com"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = 8

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)

    @property
    def contact_email_configured(self) -> bool:
        return bool(
            self.smtp_host
            and (self.smtp_from_email or self.smtp_username)
            and (not self.smtp_username or self.smtp_password)
        )

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.cookie_domain == "":
            self.cookie_domain = None
        if self.database_host and self.database_name and self.database_user and self.database_password:
            self.database_url = (
                f"postgresql+asyncpg://{quote_plus(self.database_user)}:{quote_plus(self.database_password)}"
                f"@{self.database_host}:{self.database_port}/{quote_plus(self.database_name)}?ssl=require"
            )
        if self.redis_host and self.redis_password:
            self.redis_url = f"rediss://:{quote_plus(self.redis_password)}@{self.redis_host}:{self.redis_port}/0"
        if self.environment == "production":
            if self.jwt_secret == "development-only-change-me-32-characters":
                raise ValueError("JWT_SECRET must be set to a unique production secret.")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production.")
            if not self.cookie_domain:
                raise ValueError("COOKIE_DOMAIN must be the shared storefront/API parent domain in production.")
            if not self.frontend_origins.strip():
                raise ValueError("FRONTEND_ORIGINS must contain the deployed storefront origin.")
            if "*" in self.frontend_origins:
                raise ValueError("FRONTEND_ORIGINS cannot contain wildcard origins in production.")
            if self.cookie_samesite == "none" and not self.cookie_secure:
                raise ValueError("SameSite=None cookies require COOKIE_SECURE=true.")
            if not self.stripe_secret_key or not self.stripe_webhook_secret:
                raise ValueError("Stripe secret and webhook keys are required in production.")
            if not self.sqs_order_events_url:
                raise ValueError("SQS_ORDER_EVENTS_URL is required in production for transactional event delivery.")
            if "localhost" in self.database_url or "localhost" in self.redis_url:
                raise ValueError("Production database and Redis endpoints must be explicitly configured.")
        return self


@lru_cache

def get_settings() -> Settings:
    return Settings()


settings = get_settings()
