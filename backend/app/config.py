from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env.local", ".env"), extra="ignore")

    environment: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_origins: str = "http://localhost:3000,http://localhost:3003"
    database_url: str = "postgresql+asyncpg://ponyo:ponyo@localhost:5433/ponyo"
    redis_url: str = "redis://localhost:6379/0"

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
    s3_bucket: str | None = None
    sqs_order_events_url: str | None = None
    eventbridge_bus_name: str | None = None

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.environment == "production":
            if self.jwt_secret == "development-only-change-me-32-characters":
                raise ValueError("JWT_SECRET must be set to a unique production secret.")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production.")
            if not self.frontend_origins.strip():
                raise ValueError("FRONTEND_ORIGINS must contain the deployed storefront origin.")
            if "*" in self.frontend_origins:
                raise ValueError("FRONTEND_ORIGINS cannot contain wildcard origins in production.")
            if self.cookie_samesite == "none" and not self.cookie_secure:
                raise ValueError("SameSite=None cookies require COOKIE_SECURE=true.")
            if not self.stripe_secret_key or not self.stripe_webhook_secret:
                raise ValueError("Stripe secret and webhook keys are required in production.")
        return self


@lru_cache

def get_settings() -> Settings:
    return Settings()


settings = get_settings()
