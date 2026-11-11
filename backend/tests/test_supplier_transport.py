"""Trusted supplier HTTP contract tests. No network connections or secrets."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.supplier_forwarding import NoRedirects, send_purchase_order


@pytest.mark.parametrize("result", [
    {"idempotencyKey": "key", "status": "accepted", "supplierOrderId": "EXT1"},
    {"idempotencyKey": "key", "status": "confirmed", "supplierOrderId": "EXT1"},
    {"idempotencyKey": "key", "status": "rejected", "reason": "inventory_unavailable"},
])
def test_supplier_request_auth_key_and_response_contract(monkeypatch, result):
    from app import supplier_forwarding
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps(result).encode()
    opener = MagicMock()
    opener.open.return_value = response
    monkeypatch.setattr(supplier_forwarding, "build_opener", lambda handler: opener)
    payload = {"idempotencyKey": "key", "items": [], "shippingAddress": {"city": "Tokyo"}}
    assert send_purchase_order({"url": "https://supplier.example.test/orders", "token": "test-secret"}, payload) == result
    request = opener.open.call_args.args[0]
    assert request.get_header("Authorization") == "Bearer test-secret"
    assert request.get_header("Idempotency-key") == "key"
    assert json.loads(request.data) == payload
    assert opener.open.call_args.kwargs["timeout"] == 10
    assert NoRedirects().redirect_request(None, None, 302, "", {}, "https://other.invalid") is None


@pytest.mark.parametrize("result", [
    {"idempotencyKey": "different", "status": "accepted", "supplierOrderId": "EXT1"},
    {"idempotencyKey": "key", "status": "accepted"},
    {"idempotencyKey": "key", "status": "unknown"},
    {"idempotencyKey": "key", "status": "confirmed", "supplierOrderId": "X" * 181},
    {"idempotencyKey": "key", "status": "rejected", "reason": "X" * 501},
])
def test_invalid_response_cannot_be_treated_as_acceptance_or_rejection(monkeypatch, result):
    from app import supplier_forwarding
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps(result).encode()
    monkeypatch.setattr(supplier_forwarding, "build_opener", lambda handler: SimpleNamespace(open=lambda *args, **kwargs: response))
    with pytest.raises(ValueError):
        send_purchase_order({"url": "https://supplier.example.test/orders", "token": "test-secret"}, {"idempotencyKey": "key"})


@pytest.mark.parametrize("integration", [
    {"url": "http://supplier.test/orders", "token": "secret", "idempotent": "true"},
    {"url": "https://user:pass@supplier.test/orders", "token": "secret", "idempotent": "true"},
    {"url": "https://supplier.test/orders", "token": "secret"},
    {"url": "https://supplier.test/orders", "idempotent": "true"},
])
def test_supplier_configuration_requires_https_credentials_and_idempotency_contract(integration):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, supplier_integrations={"SUPPLIER": integration})


def test_supplier_tokens_are_not_in_settings_representation():
    config = Settings(_env_file=None, supplier_integrations={"SUPPLIER": {
        "url": "https://supplier.test/orders", "token": "private-test-token", "idempotent": "true",
    }})
    assert "private-test-token" not in repr(config)
