from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus, urlparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ENV_FILES = tuple(Path(__file__).resolve().parents[1] / name for name in (".env", ".env.local"))


class Settings(BaseSettings):
    # Never depend on uvicorn's working directory or read frontend-only env files.
    # Explicit Settings values and process variables still override these files.
    model_config = SettingsConfigDict(env_file=BACKEND_ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    environment: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    storefront_base_url: str = "http://localhost:3000"
    frontend_origins: str = "http://localhost:3000,http://localhost:3003"
    database_url: str = "sqlite+aiosqlite:///./ponyo-local.db"
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
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "none"
    session_ttl_seconds: int = 60 * 60 * 24 * 7

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_capture_method: Literal["automatic", "manual"] = "automatic"
    stripe_success_url: str = "http://localhost:3000/orders?checkout=success"
    stripe_cancel_url: str = "http://localhost:3000/checkout?checkout=cancelled"
    # Explicit, merchant-reviewed rates in basis points. Empty means no tax collected.
    checkout_tax_rates_bps: dict[str, int] = {}
    checkout_tax_shipping: bool = False
    checkout_standard_shipping_jpy: int = 0
    checkout_express_shipping_jpy: int = 1200

    aws_region: str = "ap-northeast-1"
    translation_provider: Literal["disabled", "aws_translate"] = "aws_translate"
    translation_timeout_seconds: int = 8
    s3_bucket: str | None = None
    sqs_order_events_url: str | None = None
    eventbridge_bus_name: str | None = None
    supplier_forwarding_enabled: bool = False
    # Backend-only trusted provider config keyed by Supplier.code; never accept URLs/tokens from request bodies.
    supplier_integrations: dict[str, dict[str, str]] = Field(default_factory=dict, repr=False)
    supplier_max_attempts: int = 5
    supplier_retry_base_seconds: int = 60
    supplier_confirmation_timeout_seconds: int = 86400

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
        if not 1 <= self.supplier_max_attempts <= 10 or not 10 <= self.supplier_retry_base_seconds <= 3600:
            raise ValueError("Supplier retry limits must be 1–10 attempts and 10–3600 base seconds.")
        if not 300 <= self.supplier_confirmation_timeout_seconds <= 604800:
            raise ValueError("Supplier confirmation timeout must be 300–604800 seconds.")
        for integration in self.supplier_integrations.values():
            endpoint = urlparse(integration.get("url", ""))
            if endpoint.scheme != "https" or not endpoint.netloc or endpoint.username or endpoint.password or endpoint.fragment:
                raise ValueError("Supplier integrations require trusted HTTPS URLs without embedded credentials.")
            if not integration.get("token") or integration.get("idempotent") != "true":
                raise ValueError("Supplier integrations require a secret token and an explicit idempotent=true contract.")
        if any(len(country) != 2 or not country.isupper() or not 0 <= rate <= 10000
               for country, rate in self.checkout_tax_rates_bps.items()):
            raise ValueError("CHECKOUT_TAX_RATES_BPS requires uppercase country codes and rates from 0 to 10000.")
        if self.checkout_standard_shipping_jpy < 0 or self.checkout_express_shipping_jpy < 0:
            raise ValueError("Shipping fees cannot be negative.")
        if self.cookie_domain == "":
            self.cookie_domain = None
        if self.environment == "local" and any("localhost" in origin for origin in self.cors_origins):
            self.cookie_samesite = "none"
            self.cookie_secure = True
        if self.database_host and self.database_name and self.database_user and self.database_password:
            self.database_url = (
                f"postgresql+asyncpg://{quote_plus(self.database_user)}:{quote_plus(self.database_password)}"
                f"@{self.database_host}:{self.database_port}/{quote_plus(self.database_name)}?ssl=require"
            )
        if self.redis_host and self.redis_password:
            self.redis_url = f"rediss://:{quote_plus(self.redis_password)}@{self.redis_host}:{self.redis_port}/0"
        if self.environment == "production":
            storefront = urlparse(self.storefront_base_url)
            if storefront.scheme != "https" or not storefront.netloc or storefront.username or storefront.password or storefront.path not in {"", "/"} or storefront.query or storefront.fragment or self.storefront_base_url.rstrip("/") not in self.cors_origins:
                raise ValueError("STOREFRONT_BASE_URL must be an allowed HTTPS storefront origin in production.")
            if not self.contact_email_configured:
                raise ValueError("SMTP transport must be configured for account verification in production.")
            if not self.smtp_starttls:
                raise ValueError("SMTP_STARTTLS must be enabled for production transactional email.")
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
