"""Authoritative pricing and order lifecycle, isolated DB and mocked Stripe only."""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
from unittest.mock import Mock
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.checkout_pricing import allocate_discount, rounded_ratio
from app.config import settings
from app.models import Coupon, EmailNotification, Order, OrderItem, OrderStatusHistory, Product, ProductVariant
from app.order_management import transition_order
from test_api import add_product, checkout_payload, csrf_token, seed_customer_session
from test_api import test_client as test_client, safe_auth_email_and_cookies as safe_auth_email_and_cookies
from test_supplier_flow import mocked_services as mocked_services

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def flow(test_client, mocked_services, monkeypatch):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    product_id, variant_id = await add_product(factory, price=1501, stock=10)
    monkeypatch.setattr(settings, "checkout_tax_rates_bps", {"JP": 1000})
    monkeypatch.setattr(settings, "checkout_tax_shipping", False)
    return client, factory, customer_id, product_id, variant_id


async def post(client, route, payload):
    return await client.post(route, json=payload, headers={"X-CSRF-Token": await csrf_token(client)})


async def add_coupon(factory, **values):
    async with factory() as db:
        db.add(Coupon(code="WELCOME", discount_type="percentage", amount=1000, currency="JPY", **values))
        await db.commit()


async def test_quote_totals_no_stock_mutation_and_discount_rounding(flow, mocked_services):
    client, factory, _, _, variant = flow
    await add_coupon(factory)
    payload = checkout_payload(variant)
    payload.update(couponCode=" welcome ", shippingMethod="express")
    quote = await post(client, "/v1/checkout/quote", payload)
    assert quote.status_code == 200, quote.text
    assert quote.json()["data"] == {"subtotalAmount": 1501, "discountAmount": 150, "shippingAmount": 1200,
                                     "taxAmount": 135, "taxRateBps": 1000, "totalAmount": 2686,
                                     "currency": "JPY", "couponCode": "WELCOME"}
    mocked_services.create.assert_not_called()
    async with factory() as db:
        assert (await db.get(ProductVariant, variant)).stock_quantity == 10
        assert await db.scalar(select(func.count()).select_from(Order)) == 0


async def test_checkout_snapshots_and_stripe_sum_match(flow, mocked_services):
    client, factory, customer, product_id, variant = flow
    await add_coupon(factory)
    payload = checkout_payload(variant)
    payload.update(couponCode="WELCOME", shippingMethod="express", items=[{"variantId": str(variant), "quantity": 3}])
    response = await post(client, "/v1/checkout/sessions", payload)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    lines = mocked_services.create.call_args.kwargs["line_items"]
    assert sum(line["quantity"] * line["price_data"]["unit_amount"] for line in lines) == data["totalAmount"]
    async with factory() as db:
        order = await db.get(Order, UUID(data["orderId"]))
        assert order.customer_id == customer
        assert order.subtotal_amount == 4503 and order.discount_amount == 450
        item = await db.scalar(select(OrderItem).where(OrderItem.order_id == order.id))
        assert item.product_snapshot["productId"] == str(product_id)
        assert item.product_snapshot["sourceUnitPrice"] == 1501
        assert item.discount_amount == 450
        product = await db.get(Product, product_id)
        product.name = "Updated catalog"
        await db.commit()
    detail = await client.get(f"/v1/orders/{data['orderId']}")
    assert detail.json()["data"]["items"][0]["name"] == "Test-Bunny"
    assert detail.json()["data"]["subtotalAmount"] == 4503


@pytest.mark.parametrize("updates", [
    {"active": False}, {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)},
    {"starts_at": datetime.now(timezone.utc) + timedelta(days=1)}, {"minimum_subtotal": 9999},
    {"max_redemptions": 0}, {"per_customer_limit": 0},
])
async def test_invalid_coupon_does_not_reserve_or_create_payment(flow, mocked_services, updates):
    client, factory, _, _, variant = flow
    await add_coupon(factory, **updates)
    payload = checkout_payload(variant)
    payload["couponCode"] = "WELCOME"
    response = await post(client, "/v1/checkout/sessions", payload)
    assert response.status_code in {409, 422}
    mocked_services.create.assert_not_called()
    async with factory() as db:
        assert (await db.get(ProductVariant, variant)).stock_quantity == 10


async def test_coupon_pending_orders_reserve_redemption_and_quote_changes_rejected(flow, mocked_services):
    client, factory, _, _, variant = flow
    await add_coupon(factory, max_redemptions=1)
    payload = checkout_payload(variant)
    payload["expectedTotalAmount"] = 1
    assert (await post(client, "/v1/checkout/sessions", payload)).status_code == 409
    payload.pop("expectedTotalAmount")
    payload["couponCode"] = "WELCOME"
    first = await post(client, "/v1/checkout/sessions", payload)
    replay = await post(client, "/v1/checkout/sessions", payload)
    assert first.status_code == replay.status_code == 200
    assert first.json()["data"]["orderId"] == replay.json()["data"]["orderId"]
    assert mocked_services.create.call_count == 1
    changed = await post(client, "/v1/checkout/sessions", {**payload, "shippingMethod": "express"})
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "checkout_idempotency_conflict"


async def test_fixed_coupon_cap_and_shipping_tax(flow, monkeypatch):
    client, factory, _, _, variant = flow
    monkeypatch.setattr(settings, "checkout_tax_shipping", True)
    async with factory() as db:
        db.add(Coupon(code="FIXED", discount_type="fixed", amount=2000, currency="JPY", maximum_discount=500))
        await db.commit()
    payload = checkout_payload(variant)
    payload.update(couponCode="FIXED", shippingMethod="express")
    response = await post(client, "/v1/checkout/quote", payload)
    assert response.status_code == 200
    assert response.json()["data"]["discountAmount"] == 500
    assert response.json()["data"]["taxAmount"] == 220


async def test_quote_price_expectations_and_auth(flow):
    client, _, _, _, variant = flow
    payload = checkout_payload(variant)
    payload["items"][0]["expectedPriceAmount"] = 1
    assert (await post(client, "/v1/checkout/quote", payload)).status_code == 409
    client.cookies.clear()
    assert (await post(client, "/v1/checkout/quote", payload)).status_code == 401


async def create_order(flow):
    client, _, _, _, variant = flow
    result = await post(client, "/v1/checkout/sessions", checkout_payload(variant))
    assert result.status_code == 200, result.text
    return UUID(result.json()["data"]["orderId"])


async def test_customer_cancel_provider_confirmed_idempotent_and_audited(flow, monkeypatch):
    client, factory, _, _, variant = flow
    order_id = await create_order(flow)
    provider = Mock(return_value={"id": "cs_test_supplier", "status": "expired", "payment_status": "unpaid"})
    monkeypatch.setattr("app.routers.orders.provider_status", provider)
    for _ in range(2):
        result = await post(client, f"/v1/orders/{order_id}/cancel", {"reason": "Changed my mind"})
        assert result.status_code == 200, result.text
        assert result.json()["data"]["status"] == "cancelled"
    assert provider.call_count == 1
    async with factory() as db:
        assert (await db.get(ProductVariant, variant)).stock_quantity == 10
        assert await db.scalar(select(func.count()).select_from(OrderStatusHistory).where(
            OrderStatusHistory.order_id == order_id, OrderStatusHistory.to_status == "cancelled")) == 1
        cancellation_emails = (await db.scalars(select(EmailNotification).where(
            EmailNotification.template == "cancellation_notification"))).all()
        assert len(cancellation_emails) == 1
    history = await client.get(f"/v1/orders/{order_id}/history")
    assert [row["toStatus"] for row in history.json()["data"]] == ["pending_payment", "cancelled"]


@pytest.mark.parametrize("provider_result, expected", [
    ({"id": "cs_test_supplier", "status": "complete", "payment_status": "paid"}, 409),
    ({"id": "cs_wrong", "status": "expired", "payment_status": "unpaid"}, 409),
    (RuntimeError("offline"), 503),
])
async def test_cancel_fails_closed_when_payment_unconfirmed(flow, monkeypatch, provider_result, expected):
    client, factory, _, _, variant = flow
    order_id = await create_order(flow)
    monkeypatch.setattr("app.routers.orders.provider_status", Mock(
        side_effect=provider_result if isinstance(provider_result, Exception) else None,
        return_value=provider_result,
    ))
    result = await post(client, f"/v1/orders/{order_id}/cancel", {})
    assert result.status_code == expected
    async with factory() as db:
        assert (await db.get(ProductVariant, variant)).stock_quantity == 9
        assert (await db.get(Order, order_id)).status == "pending_payment"


async def test_order_ownership_paid_rejection_and_status_transitions(flow, monkeypatch):
    client, factory, _, _, _ = flow
    order_id = await create_order(flow)
    async with factory() as db:
        order = await db.get(Order, order_id)
        order.status, order.payment_status = "processing", "paid"
        await db.commit()
    assert (await post(client, f"/v1/orders/{order_id}/cancel", {})).status_code == 409
    async with factory() as db:
        with pytest.raises(HTTPException):
            await transition_order(db, order_id, "delivered")
        with pytest.raises(HTTPException):
            await transition_order(db, order_id, "shipped")
        await transition_order(db, order_id, "shipped", tracking_number="JP123", tracking_carrier="Japan Post")
        await transition_order(db, order_id, "delivered")
        await transition_order(db, order_id, "completed")
        await db.commit()
    await seed_customer_session(client, factory, email="other@example.com")
    assert (await client.get(f"/v1/orders/{order_id}/history")).status_code == 404
    assert (await post(client, f"/v1/orders/{order_id}/cancel", {})).status_code == 404


async def test_discount_allocation_reconciles_every_minor_unit():
    for amounts in ([1501, 1501, 1501], [1, 2, 3], [0, 5, 0]):
        for discount in range(sum(amounts) + 1):
            allocated = allocate_discount(list(amounts), discount)
            assert sum(allocated) == discount
            assert all(0 <= value <= amount for value, amount in zip(allocated, amounts))
    assert rounded_ratio(15, 1000) == 2


async def test_shipping_is_converted_from_jpy_not_catalog_currency(flow, monkeypatch):
    client, factory, _, _, variant = flow
    async with factory() as db:
        row = await db.get(ProductVariant, variant)
        row.currency = "USD"
        await db.commit()
    monkeypatch.setattr("app.routers.checkout.get_jpy_rates", AsyncMock(return_value={
        "base": "JPY", "rates": {"JPY": 1, "USD": 0.005},
    }))
    payload = checkout_payload(variant)
    payload.update(currency="USD", shippingMethod="express")
    quote = await post(client, "/v1/checkout/quote", payload)
    assert quote.status_code == 200, quote.text
    assert quote.json()["data"]["subtotalAmount"] == 1501
    assert quote.json()["data"]["shippingAmount"] == 600  # JPY 1200 -> USD 6.00 (600 cents)


async def test_checkout_quote_supports_south_korea_delivery(flow):
    client, _, _, _, variant = flow
    payload = checkout_payload(variant)
    payload["shippingAddress"]["countryCode"] = "KR"
    payload["shippingAddress"]["postalCode"] = "04524"
    response = await post(client, "/v1/checkout/quote", payload)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(("field", "value"), [
    ("postalCode", "not-a-postal-code"),
    ("phone", "letters only"),
    ("address1", "   "),
])
async def test_checkout_rejects_invalid_delivery_address(flow, field, value):
    client, _, _, _, variant = flow
    payload = checkout_payload(variant)
    payload["shippingAddress"][field] = value
    response = await post(client, "/v1/checkout/quote", payload)
    assert response.status_code == 422, response.text


async def test_coupon_failure_retains_retryable_reservation_and_unique_order_numbers(flow, mocked_services):
    import stripe

    client, factory, _, _, variant = flow
    await add_coupon(factory, max_redemptions=1)
    payload = checkout_payload(variant)
    payload["couponCode"] = "WELCOME"
    mocked_services.create.side_effect = stripe.APIConnectionError("offline")
    assert (await post(client, "/v1/checkout/sessions", payload)).status_code == 503
    async with factory() as db:
        pending = await db.scalar(select(Order).where(Order.checkout_idempotency_key == payload["idempotencyKey"]))
        assert pending is not None and pending.stripe_session_id is None
        assert (await db.get(ProductVariant, variant)).stock_quantity == 9
    mocked_services.create.side_effect = None
    retry = await post(client, "/v1/checkout/sessions", payload)
    assert retry.status_code == 200, retry.text
    first = UUID(retry.json()["data"]["orderId"])
    mocked_services.create.return_value.id = "cs_test_second"
    second = await create_order(flow)
    assert first != second
    async with factory() as db:
        orders = (await db.scalars(select(Order))).all()
        assert len({order.order_number for order in orders}) == 2


async def test_cancel_requires_csrf_and_quote_rechecks_supplier_stock(flow):
    from app.models import Supplier, SupplierInventory, SupplierOffer

    client, factory, _, _, variant = flow
    order_id = await create_order(flow)
    assert (await client.post(f"/v1/orders/{order_id}/cancel", json={})).status_code == 403
    async with factory() as db:
        supplier = Supplier(code="EMPTY", name="Empty", active=True)
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(supplier_id=supplier.id, variant_id=variant, supplier_sku="EMPTY", cost_amount=1, currency="JPY", active=True)
        db.add(offer)
        await db.flush()
        db.add(SupplierInventory(offer_id=offer.id, on_hand=0, reserved=0))
        await db.commit()
    quote = await post(client, "/v1/checkout/quote", checkout_payload(variant))
    assert quote.status_code == 409


async def test_fulfillment_status_api_requires_database_admin_role(flow):
    from app.models import Customer

    client, factory, customer_id, _, _ = flow
    order_id = await create_order(flow)
    payload = {"status": "shipped", "trackingNumber": "TRACK123", "trackingCarrier": "Japan Post"}
    assert (await post(client, f"/v1/orders/{order_id}/status", payload)).status_code == 403
    async with factory() as db:
        order = await db.get(Order, order_id)
        order.status, order.payment_status = "processing", "paid"
        customer = await db.get(Customer, customer_id)
        customer.role = "admin"
        await db.commit()
    result = await post(client, f"/v1/orders/{order_id}/status", payload)
    assert result.status_code == 200, result.text
    assert result.json()["data"]["status"] == "shipped"
    assert result.json()["data"]["trackingNumber"] == "TRACK123"
    assert (await post(client, f"/v1/orders/{order_id}/status", payload)).status_code == 409


@pytest.mark.parametrize("free_order", [True, False])
async def test_no_payment_required_only_settles_a_zero_total_order(flow, mocked_services, free_order):
    client, factory, _, _, variant = flow
    async with factory() as db:
        db.add(Coupon(code="FREE", discount_type="percentage", amount=10000, currency="JPY"))
        await db.commit()
    payload = checkout_payload(variant)
    if free_order:
        payload["couponCode"] = "FREE"
    result = await post(client, "/v1/checkout/sessions", payload)
    assert result.status_code == 200
    order_id = UUID(result.json()["data"]["orderId"])
    mocked_services.construct_event.side_effect = None
    mocked_services.construct_event.return_value = {
        "id": "evt_free_test", "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_test_supplier", "metadata": {"ponyo_order_id": str(order_id)},
                            "payment_status": "no_payment_required", "amount_total": result.json()["data"]["totalAmount"], "currency": "jpy"}},
    }
    response = await client.post("/v1/webhooks/stripe", content=b"test", headers={"stripe-signature": "test"})
    assert response.status_code == 200
    async with factory() as db:
        order = await db.get(Order, order_id)
        assert order.status == ("processing" if free_order else "pending_payment")
