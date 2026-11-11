"""Request-level checkout idempotency contracts."""

import pytest
from sqlalchemy import func, select

from app.models import Order, OrderItem, PaymentTransaction, ProductVariant
from test_api import add_product, checkout_payload, csrf_token, seed_customer_session
from test_api import test_client as test_client, safe_auth_email_and_cookies as safe_auth_email_and_cookies
from test_supplier_flow import mocked_services as mocked_services

pytestmark = pytest.mark.asyncio


async def test_same_checkout_key_replays_one_order_without_second_reservation(test_client, mocked_services):
    client, factory = test_client
    customer = await seed_customer_session(client, factory)
    _, variant_id = await add_product(factory, stock=5)
    payload = checkout_payload(variant_id)
    headers = {"X-CSRF-Token": await csrf_token(client)}

    first = await client.post("/v1/checkout/sessions", json=payload, headers=headers)
    second = await client.post("/v1/checkout/sessions", json=payload, headers=headers)

    assert first.status_code == second.status_code == 200
    first_data, second_data = first.json()["data"], second.json()["data"]
    assert first_data["orderId"] == second_data["orderId"]
    assert first_data["checkoutUrl"] == second_data["checkoutUrl"]
    assert mocked_services.create.call_count == 1
    async with factory() as db:
        orders = (await db.scalars(select(Order))).all()
        assert len(orders) == 1 and orders[0].customer_id == customer
        assert orders[0].checkout_request_hash
        assert orders[0].checkout_request == {
            "successUrl": payload["successUrl"], "cancelUrl": payload["cancelUrl"],
        }
        assert await db.scalar(select(func.count()).select_from(OrderItem)) == 1
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 4
        assert await db.scalar(select(func.count()).select_from(PaymentTransaction)) == 1


async def test_key_reuse_with_changed_payload_is_conflict(test_client, mocked_services):
    client, factory = test_client
    await seed_customer_session(client, factory)
    _, variant_id = await add_product(factory, stock=5)
    payload = checkout_payload(variant_id)
    headers = {"X-CSRF-Token": await csrf_token(client)}
    assert (await client.post("/v1/checkout/sessions", json=payload, headers=headers)).status_code == 200

    changed = {**payload, "shippingMethod": "express"}
    response = await client.post("/v1/checkout/sessions", json=changed, headers=headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "checkout_idempotency_conflict"
    assert mocked_services.create.call_count == 1
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(Order)) == 1
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 4


async def test_same_key_is_scoped_to_customer(test_client, mocked_services):
    client, factory = test_client
    first_customer = await seed_customer_session(client, factory, email="one@example.com")
    _, variant_id = await add_product(factory, stock=5)
    payload = checkout_payload(variant_id, email="one@example.com")
    headers = {"X-CSRF-Token": await csrf_token(client)}
    first = await client.post("/v1/checkout/sessions", json=payload, headers=headers)
    assert first.status_code == 200
    mocked_services.create.return_value.id = "cs_test_supplier_other_customer"
    client.cookies.clear()
    second_customer = await seed_customer_session(client, factory, email="two@example.com")
    second_payload = {**payload, "email": "two@example.com"}
    headers = {"X-CSRF-Token": await csrf_token(client)}
    second = await client.post("/v1/checkout/sessions", json=second_payload, headers=headers)
    assert second.status_code == 200
    assert second.json()["data"]["orderId"] != first.json()["data"]["orderId"]
    assert first_customer != second_customer
    assert mocked_services.create.call_count == 2
