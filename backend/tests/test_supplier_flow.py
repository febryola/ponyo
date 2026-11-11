"""Supplier/catalog integration against isolated SQLite; never contact SMTP or Stripe."""

import json
import smtplib
import socket
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest
import stripe
from sqlalchemy import func, select

from app.config import settings
from app.models import (
    Brand, Order, OrderItem, OrderStatusHistory, OutboxEvent, ProcessedWebhook,
    Product, ProductCategory, ProductImage, ProductVariant, Supplier,
    SupplierInventory, SupplierOffer,
)
from app.storefront_data import link_demo_catalog
from test_api import (
    add_product, checkout_payload, csrf_token, seed_customer_session,
    safe_auth_email_and_cookies as safe_auth_email_and_cookies,
    test_client as test_client,
)


pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def mocked_services(monkeypatch, safe_auth_email_and_cookies):
    """Explicitly register the imported safety fixture and fail closed on network I/O."""
    blocked = Mock(side_effect=AssertionError("External network calls are forbidden"))
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(smtplib, "SMTP", blocked)
    monkeypatch.setattr(smtplib, "SMTP_SSL", blocked)
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "frontend_origins", "http://localhost:3000")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_supplier_dummy")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_supplier_dummy")
    monkeypatch.setattr(settings, "translation_provider", "disabled")
    monkeypatch.setattr(stripe, "api_key", None)
    monkeypatch.setattr(
        "app.routers.checkout.get_jpy_rates",
        AsyncMock(side_effect=AssertionError("JPY checkout must not request exchange rates")),
    )
    create = Mock(return_value=SimpleNamespace(
        id="cs_test_supplier",
        url="https://checkout.stripe.test/supplier",
        expires_at=int(datetime.now(timezone.utc).timestamp()) + 1800,
    ))
    monkeypatch.setattr(stripe.checkout.Session, "create", create)
    monkeypatch.setattr(stripe.checkout.Session, "expire", blocked)
    construct_event = Mock(side_effect=AssertionError("A test must supply its webhook event"))
    monkeypatch.setattr(stripe.Webhook, "construct_event", construct_event)
    return SimpleNamespace(create=create, construct_event=construct_event)


async def link_catalog(session_factory):
    async with session_factory() as db:
        await link_demo_catalog(db)
        await db.commit()


async def test_demo_linker_rejects_production(test_client, monkeypatch):
    _, session_factory = test_client
    monkeypatch.setattr(settings, "environment", "production")
    async with session_factory() as db:
        with pytest.raises(RuntimeError, match="production"):
            await link_demo_catalog(db)
        assert await db.scalar(select(func.count()).select_from(Supplier)) == 0


@pytest.fixture
async def supplier_checkout(test_client):
    client, session_factory = test_client
    customer_id = await seed_customer_session(client, session_factory, verified=True)
    product_id, variant_id = await add_product(session_factory, stock=4)
    await link_catalog(session_factory)
    async with session_factory() as db:
        offer = (await db.scalars(select(SupplierOffer))).one()
        offer_id = offer.id
    return SimpleNamespace(
        client=client, session_factory=session_factory, customer_id=customer_id,
        product_id=product_id, variant_id=variant_id, offer_id=offer_id,
    )


async def start_checkout(flow, *, items=None):
    payload = checkout_payload(flow.variant_id)
    payload["currency"] = "JPY"
    if items is not None:
        payload["items"] = items
    return await flow.client.post(
        "/v1/checkout/sessions", json=payload,
        headers={"X-CSRF-Token": await csrf_token(flow.client)},
    )


async def deliver_event(flow, services, order_id, event_id, event_type, *, paid=False):
    async with flow.session_factory() as db:
        order = await db.get(Order, order_id)
        session_data = {
            "id": order.stripe_session_id,
            "metadata": {"ponyo_order_id": str(order.id)},
            "client_reference_id": str(order.id),
            "amount_total": order.total_amount,
            "currency": order.currency.lower(),
            "payment_status": "paid" if paid else "unpaid",
        }
    event = {"id": event_id, "type": event_type, "data": {"object": session_data}}
    body = json.dumps(event).encode()
    services.construct_event.side_effect = None
    services.construct_event.return_value = event
    response = await flow.client.post(
        "/v1/webhooks/stripe", content=body,
        headers={"stripe-signature": "supplier-test-signature"},
    )
    services.construct_event.assert_called_with(
        body, "supplier-test-signature", "whsec_supplier_dummy",
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"received": True}


async def assert_stock(flow, *, variant, on_hand, reserved):
    # New sessions are intentional: assert persisted values, not stale identity-map state.
    async with flow.session_factory() as db:
        stored_variant = await db.get(ProductVariant, flow.variant_id)
        inventory = (await db.scalars(
            select(SupplierInventory).where(SupplierInventory.offer_id == flow.offer_id)
        )).one()
        assert stored_variant.stock_quantity == variant
        assert (inventory.on_hand, inventory.reserved) == (on_hand, reserved)


async def test_link_demo_catalog_links_every_product_and_variant_idempotently(test_client):
    _, session_factory = test_client
    first_id, _ = await add_product(session_factory, slug="small-bunny", stock=4)
    second_id, _ = await add_product(session_factory, slug="giant-bunny", stock=7)
    async with session_factory() as db:
        second = await db.get(Product, second_id)
        second.category_name = "Giant plush"
        second.supplier_name = "Domina"
        second.published = False  # Backfill is not limited to publicly listed products.
        db.add(ProductVariant(
            product_id=first_id, title="Spare size", currency="JPY",
            price_amount=1900, stock_quantity=2, active=False,
        ))
        await db.commit()

    await link_catalog(session_factory)
    models = (ProductCategory, Brand, ProductImage, Supplier, SupplierOffer, SupplierInventory)
    async with session_factory() as db:
        before = {
            model.__tablename__: set((await db.scalars(select(model.id))).all())
            for model in models
        }
        products = (await db.scalars(select(Product))).all()
        assert len(products) == 2
        for product in products:
            category = await db.get(ProductCategory, product.category_id)
            brand = await db.get(Brand, product.brand_id)
            assert category.name == product.category_name
            assert brand.name == product.supplier_name
            assert brand.is_demo is True
            images = (await db.scalars(
                select(ProductImage).where(ProductImage.product_id == product.id)
            )).all()
            assert [(image.url, image.alt, image.sort_order) for image in images] == [
                (product.image_url, product.image_alt, 0),
            ]
        variants = (await db.scalars(select(ProductVariant))).all()
        assert len(variants) == 3
        for variant in variants:
            offer = (await db.scalars(
                select(SupplierOffer).where(SupplierOffer.variant_id == variant.id)
            )).one()
            inventory = (await db.scalars(
                select(SupplierInventory).where(SupplierInventory.offer_id == offer.id)
            )).one()
            assert offer.currency == variant.currency
            assert (inventory.on_hand, inventory.reserved) == (variant.stock_quantity, 0)
            assert offer.supplier_sku.startswith("DEMO-")
        suppliers = (await db.scalars(select(Supplier))).all()
        assert {supplier.code for supplier in suppliers} == {"DEMO-PLUSH", "DEMO-XL"}
        for supplier in suppliers:
            assert supplier.is_demo is True
            assert supplier.name.startswith("Demo ")
            assert supplier.contact_email.endswith("@suppliers.example")
            assert supplier.name not in {product.supplier_name for product in products}

    await link_catalog(session_factory)
    await link_catalog(session_factory)
    async with session_factory() as db:
        after = {
            model.__tablename__: set((await db.scalars(select(model.id))).all())
            for model in models
        }
        assert after == before


async def test_link_demo_catalog_preserves_inventory_and_supplier_edits(supplier_checkout):
    flow = supplier_checkout
    async with flow.session_factory() as db:
        offer = await db.get(SupplierOffer, flow.offer_id)
        offer.supplier_sku = "PRIVATE-EDITED-SKU"
        offer.cost_amount = 321
        offer.lead_time_days = 12
        offer.active = False
        inventory = (await db.scalars(select(SupplierInventory))).one()
        inventory.on_hand = 2
        inventory.reserved = 1
        supplier = await db.get(Supplier, offer.supplier_id)
        supplier.name = "Demo Edited Supply"
        supplier.contact_email = "edited@suppliers.example"
        await db.commit()

    await link_catalog(flow.session_factory)
    await link_catalog(flow.session_factory)
    await assert_stock(flow, variant=4, on_hand=2, reserved=1)
    async with flow.session_factory() as db:
        offer = (await db.scalars(select(SupplierOffer))).one()
        assert (offer.supplier_sku, offer.cost_amount, offer.lead_time_days, offer.active) == (
            "PRIVATE-EDITED-SKU", 321, 12, False,
        )
        supplier = await db.get(Supplier, offer.supplier_id)
        assert (supplier.name, supplier.contact_email) == (
            "Demo Edited Supply", "edited@suppliers.example",
        )


async def test_catalog_exposes_links_and_images_but_no_supplier_secrets(supplier_checkout):
    flow = supplier_checkout
    async with flow.session_factory() as db:
        product = await db.get(Product, flow.product_id)
        category_id, brand_id = str(product.category_id), str(product.brand_id)
        offer = await db.get(SupplierOffer, flow.offer_id)
        supplier = await db.get(Supplier, offer.supplier_id)
        private_values = [offer.supplier_sku, supplier.contact_email]

    def assert_public(value):
        if isinstance(value, dict):
            for key, nested in value.items():
                normalized = key.replace("_", "").lower()
                assert "cost" not in normalized
                assert "contact" not in normalized
                assert normalized not in {"suppliersku", "supplieroffers", "offers", "supplierid"}
                assert_public(nested)
        elif isinstance(value, list):
            for nested in value:
                assert_public(nested)

    for path in ("/v1/products", f"/v1/products/{flow.product_id}"):
        response = await flow.client.get(path)
        assert response.status_code == 200, response.text
        payload = response.json()
        product = payload["data"][0] if isinstance(payload["data"], list) else payload["data"]
        assert product["categoryId"] == category_id
        assert product["brandId"] == brand_id
        assert product["brandName"] == "Ponyo"
        assert len(product["images"]) == 1
        assert product["images"][0] == {"url": product["image"], "alt": "Bunny"}
        assert_public(payload)
        for secret in private_values:
            assert secret not in response.text


async def test_checkout_reserves_variant_and_supplier_and_records_pending_history(
    supplier_checkout, mocked_services,
):
    flow = supplier_checkout
    response = await start_checkout(flow)
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    assert response.json()["data"]["checkoutUrl"] == "https://checkout.stripe.test/supplier"
    await assert_stock(flow, variant=3, on_hand=4, reserved=1)
    mocked_services.create.assert_called_once()
    kwargs = mocked_services.create.call_args.kwargs
    assert kwargs["metadata"] == {"ponyo_order_id": str(order_id)}
    assert kwargs["client_reference_id"] == str(order_id)
    assert kwargs["line_items"][0]["quantity"] == 1
    assert kwargs["line_items"][0]["price_data"]["currency"] == "jpy"
    assert kwargs["line_items"][0]["price_data"]["unit_amount"] == 1500
    async with flow.session_factory() as db:
        order = await db.get(Order, order_id)
        assert order.customer_id == flow.customer_id
        assert (order.status, order.payment_status, order.currency, order.total_amount) == (
            "pending_payment", "unpaid", "JPY", 1500,
        )
        assert order.stripe_session_id == "cs_test_supplier"
        item = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).one()
        assert (item.variant_id, item.supplier_offer_id, item.quantity) == (
            flow.variant_id, flow.offer_id, 1,
        )
        history = (await db.scalars(select(OrderStatusHistory))).one()
        assert (history.order_id, history.to_status, history.source, history.event_key) == (
            order_id, "pending_payment", "checkout", "checkout.created",
        )


@pytest.mark.parametrize("event_type", [
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
])
async def test_paid_webhook_settles_supplier_stock_exactly_once(
    supplier_checkout, mocked_services, event_type,
):
    flow = supplier_checkout
    response = await start_checkout(flow)
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    for event_id in ("evt_supplier_paid", "evt_supplier_paid", "evt_supplier_paid_duplicate"):
        await deliver_event(flow, mocked_services, order_id, event_id, event_type, paid=True)
        await assert_stock(flow, variant=3, on_hand=3, reserved=0)
    async with flow.session_factory() as db:
        order = await db.get(Order, order_id)
        assert (order.status, order.payment_status, order.fulfillment_status) == (
            "processing", "paid", "queued",
        )
        histories = (await db.scalars(select(OrderStatusHistory))).all()
        assert len(histories) == 2
        processing = next(row for row in histories if row.to_status == "processing")
        assert (processing.from_status, processing.payment_status, processing.source) == (
            "pending_payment", "paid", "stripe",
        )
        assert processing.event_key == "evt_supplier_paid"
        assert await db.scalar(select(func.count()).select_from(ProcessedWebhook)) == 2
        outbox = (await db.scalars(select(OutboxEvent))).one()
        assert outbox.event_type == "order.payment_succeeded"
        assert outbox.payload["orderId"] == str(order_id)


@pytest.mark.parametrize("event_type", [
    "checkout.session.expired", "checkout.session.async_payment_failed",
])
async def test_cancelled_webhook_releases_both_reservations_only_once(
    supplier_checkout, mocked_services, event_type,
):
    flow = supplier_checkout
    response = await start_checkout(flow)
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    await assert_stock(flow, variant=3, on_hand=4, reserved=1)
    for event_id in ("evt_supplier_cancelled", "evt_supplier_cancelled", "evt_supplier_cancel_duplicate"):
        await deliver_event(flow, mocked_services, order_id, event_id, event_type)
        await assert_stock(flow, variant=4, on_hand=4, reserved=0)
    async with flow.session_factory() as db:
        order = await db.get(Order, order_id)
        assert (order.status, order.payment_status) == ("cancelled", "failed")
        histories = (await db.scalars(select(OrderStatusHistory))).all()
        assert len(histories) == 2
        cancelled = next(row for row in histories if row.to_status == "cancelled")
        assert (cancelled.from_status, cancelled.source, cancelled.event_key) == (
            "pending_payment", "stripe", "evt_supplier_cancelled",
        )
        assert await db.scalar(select(func.count()).select_from(OutboxEvent)) == 0


async def test_paid_after_cancelled_does_not_consume_released_supplier_stock(
    supplier_checkout, mocked_services,
):
    flow = supplier_checkout
    response = await start_checkout(flow)
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    await deliver_event(
        flow, mocked_services, order_id, "evt_supplier_expired", "checkout.session.expired",
    )
    await deliver_event(
        flow, mocked_services, order_id, "evt_supplier_late_paid", "checkout.session.completed", paid=True,
    )
    await assert_stock(flow, variant=4, on_hand=4, reserved=0)
    async with flow.session_factory() as db:
        order = await db.get(Order, order_id)
        assert (order.status, order.payment_status) == ("cancelled", "failed")
        assert await db.scalar(select(func.count()).select_from(OrderStatusHistory)) == 2
        assert await db.scalar(select(func.count()).select_from(OutboxEvent)) == 0


async def test_stripe_creation_failure_rolls_back_all_reservations(supplier_checkout, mocked_services):
    flow = supplier_checkout
    mocked_services.create.side_effect = stripe.StripeError("Simulated provider failure")
    response = await start_checkout(flow)
    assert response.status_code == 503, response.text
    mocked_services.create.assert_called_once()
    await assert_stock(flow, variant=4, on_hand=4, reserved=0)
    async with flow.session_factory() as db:
        for model in (Order, OrderItem, OrderStatusHistory, OutboxEvent):
            assert await db.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.parametrize("earlier_item", [False, True], ids=["single-item", "rollback-earlier-item"])
async def test_supplier_scarcity_returns_409_without_order_or_reservations(
    supplier_checkout, mocked_services, earlier_item,
):
    flow = supplier_checkout
    async with flow.session_factory() as db:
        inventory = (await db.scalars(select(SupplierInventory))).one()
        inventory.on_hand = 1
        inventory.reserved = 1  # Variant stock is four, but supplier availability is zero.
        await db.commit()
    items = [{"variantId": str(flow.variant_id), "quantity": 1}]
    other_variant_id = None
    if earlier_item:
        _, other_variant_id = await add_product(flow.session_factory, slug="other-bunny", stock=4)
        await link_catalog(flow.session_factory)
        items.insert(0, {"variantId": str(other_variant_id), "quantity": 1})
    response = await start_checkout(flow, items=items)
    assert response.status_code == 409, response.text
    mocked_services.create.assert_not_called()
    await assert_stock(flow, variant=4, on_hand=1, reserved=1)
    async with flow.session_factory() as db:
        for model in (Order, OrderItem, OrderStatusHistory, OutboxEvent):
            assert await db.scalar(select(func.count()).select_from(model)) == 0
        if other_variant_id is not None:
            variant = await db.get(ProductVariant, other_variant_id)
            assert variant.stock_quantity == 4
            other_inventory = (await db.scalars(
                select(SupplierInventory).join(SupplierOffer).where(
                    SupplierOffer.variant_id == other_variant_id,
                )
            )).one()
            assert (other_inventory.on_hand, other_inventory.reserved) == (4, 0)


@pytest.mark.parametrize("preferred_available", [True, False], ids=["fastest-offer", "fallback-offer"])
async def test_multiple_suppliers_can_offer_same_variant_and_checkout_selects_stock(
    supplier_checkout, mocked_services, preferred_available,
):
    flow = supplier_checkout
    async with flow.session_factory() as db:
        supplier = Supplier(
            code="DEMO-ALTERNATE", name="Demo Alternate Supply",
            contact_email="alternate@suppliers.example", is_demo=True,
        )
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(
            supplier_id=supplier.id, variant_id=flow.variant_id,
            supplier_sku="PRIVATE-ALTERNATE-SKU", cost_amount=777, currency="JPY",
            lead_time_days=1,
        )
        db.add(offer)
        await db.flush()
        preferred_id = offer.id
        db.add(SupplierInventory(offer_id=offer.id, on_hand=2 if preferred_available else 0, reserved=0))
        await db.commit()
    await link_catalog(flow.session_factory)
    response = await start_checkout(flow)
    assert response.status_code == 200, response.text
    async with flow.session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(SupplierOffer)) == 2
        item = (await db.scalars(select(OrderItem))).one()
        assert item.supplier_offer_id == (preferred_id if preferred_available else flow.offer_id)
        for offer_id, expected in (
            (preferred_id, (2, 1) if preferred_available else (0, 0)),
            (flow.offer_id, (4, 0) if preferred_available else (4, 1)),
        ):
            inventory = (await db.scalars(
                select(SupplierInventory).where(SupplierInventory.offer_id == offer_id)
            )).one()
            assert (inventory.on_hand, inventory.reserved) == expected
        variant = await db.get(ProductVariant, flow.variant_id)
        assert variant.stock_quantity == 3
    mocked_services.create.assert_called_once()