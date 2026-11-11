import pytest
from pydantic import ValidationError

from app.config import Settings


def production_settings(**overrides):
    values = {
        "environment": "production",
        "storefront_base_url": "https://byponyo.com",
        "frontend_origins": "https://byponyo.com",
        "jwt_secret": "test-only-unique-signing-secret-not-for-deployment",
        "cookie_secure": True,
        "cookie_domain": ".byponyo.com",
        "stripe_secret_key": "sk_test_configuration",
        "stripe_webhook_secret": "whsec_test_configuration",
        "sqs_order_events_url": "https://sqs.example.test/orders",
        "database_url": "postgresql+asyncpg://test@example.test/ponyo",
        "redis_url": "rediss://cache.example.test:6379/0",
        "smtp_host": "smtp.example.test",
        "smtp_from_email": "hello@example.test",
        "smtp_username": "test-user",
        "smtp_password": "test-only-not-a-real-password",
    }
    return Settings(_env_file=None, **{**values, **overrides})


def test_production_accepts_public_verification_origin_and_configured_mail():
    configured = production_settings()
    assert configured.contact_email_configured is True
    assert configured.storefront_base_url == "https://byponyo.com"


@pytest.mark.parametrize("origin", [
    "http://localhost:3000", "http://byponyo.com", "https://other.example.test",
    "https://byponyo.com/path", "https://byponyo.com?redirect=elsewhere",
])
def test_production_rejects_unsafe_or_unapproved_verification_origins(origin):
    with pytest.raises(ValidationError, match="STOREFRONT_BASE_URL"):
        production_settings(storefront_base_url=origin)


@pytest.mark.parametrize("overrides", [
    {"smtp_host": None}, {"smtp_from_email": None, "smtp_username": None},
    {"smtp_password": None},
])
def test_production_requires_working_mail_configuration(overrides):
    with pytest.raises(ValidationError, match="SMTP transport"):
        production_settings(**overrides)