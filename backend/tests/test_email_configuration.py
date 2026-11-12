"""Backend email configuration must not depend on the server launch directory."""

import logging
import os
import smtplib
from unittest.mock import AsyncMock

import pytest

from app.config import BACKEND_ENV_FILES, Settings, settings
from app.email_notifications import send_contact_notification


@pytest.fixture
def isolated_email_settings(monkeypatch, tmp_path):
    for key in tuple(os.environ):
        if key.lower() in Settings.model_fields:
            monkeypatch.delenv(key)
    backend = tmp_path / "backend"
    backend.mkdir()
    paths = (backend / ".env", backend / ".env.local")
    monkeypatch.setitem(Settings.model_config, "env_file", paths)
    return tmp_path, paths


@pytest.mark.parametrize("launch_directory", [".", "backend", "elsewhere"])
def test_backend_email_files_are_loaded_independent_of_cwd(isolated_email_settings, monkeypatch, launch_directory):
    root, (_, local) = isolated_email_settings
    local.write_text(
        "SMTP_HOST=smtp.example.test\nSMTP_USERNAME=test-user\n"
        "SMTP_PASSWORD=test-password\nCONTACT_NOTIFICATION_EMAIL=owner@example.test\n",
        encoding="utf-8",
    )
    # Frontend credentials are deliberately unrelated and must never be selected.
    (root / ".env.local").write_text("SMTP_HOST=wrong.example.test\n", encoding="utf-8")
    cwd = root / launch_directory
    cwd.mkdir(exist_ok=True)
    monkeypatch.chdir(cwd)
    configured = Settings()
    assert configured.contact_email_configured is True
    assert configured.smtp_host == "smtp.example.test"
    assert configured.contact_notification_email == "owner@example.test"


def test_default_env_paths_are_absolute_backend_files():
    assert all(path.is_absolute() for path in BACKEND_ENV_FILES)
    assert [path.name for path in BACKEND_ENV_FILES] == [".env", ".env.local"]
    assert all(path.parent.name == "backend" for path in BACKEND_ENV_FILES)


def test_local_file_then_process_then_explicit_values_take_precedence(isolated_email_settings, monkeypatch):
    _, (base, local) = isolated_email_settings
    base.write_text("SMTP_HOST=base.example.test\n", encoding="utf-8")
    local.write_text("SMTP_HOST=local.example.test\n", encoding="utf-8")
    assert Settings().smtp_host == "local.example.test"
    monkeypatch.setenv("SMTP_HOST", "process.example.test")
    assert Settings().smtp_host == "process.example.test"
    assert Settings(smtp_host="explicit.example.test").smtp_host == "explicit.example.test"


def test_explicit_env_file_opt_out_still_works(isolated_email_settings):
    _, (_, local) = isolated_email_settings
    local.write_text("SMTP_HOST=smtp.example.test\n", encoding="utf-8")
    assert Settings(_env_file=None).smtp_host is None


@pytest.mark.asyncio
async def test_unconfigured_contact_transport_is_visible_without_customer_data(monkeypatch, caplog):
    monkeypatch.setattr(settings, "smtp_host", None)
    worker = AsyncMock()
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    with caplog.at_level(logging.WARNING, logger="app.email_notifications"):
        assert await send_contact_notification("Private name", "private@example.test", "Private topic", "Private body") is False
    worker.assert_not_awaited()
    assert "reason=transport_not_configured" in caplog.text
    assert "Private" not in caplog.text and "private@example.test" not in caplog.text


@pytest.mark.asyncio
async def test_contact_smtp_failure_logs_only_type_and_numeric_code(monkeypatch, caplog):
    for name, value in {
        "smtp_host": "smtp.example.test", "smtp_from_email": "sender@example.test",
        "smtp_username": "test-user", "smtp_password": "test-password",
    }.items():
        monkeypatch.setattr(settings, name, value)
    worker = AsyncMock(side_effect=smtplib.SMTPAuthenticationError(535, b"private@example.test secret-password"))
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    with caplog.at_level(logging.WARNING, logger="app.email_notifications"):
        assert await send_contact_notification("Private name", "private@example.test", "Private topic", "Private body") is False
    assert "exception_type=SMTPAuthenticationError smtp_status_code=535" in caplog.text
    assert "private@example.test" not in caplog.text and "secret-password" not in caplog.text


@pytest.mark.asyncio
async def test_contact_notification_returns_true_after_transport_acceptance(monkeypatch):
    for name, value in {
        "smtp_host": "smtp.example.test", "smtp_from_email": "sender@example.test",
        "smtp_username": None,
    }.items():
        monkeypatch.setattr(settings, name, value)
    worker = AsyncMock(return_value=None)
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    assert await send_contact_notification("Test", "customer@example.test", "Test topic", "Test body") is True
    worker.assert_awaited_once()