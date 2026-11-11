"""Shipment creation, partial quantities, tracking history and delivery confirmation."""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.models import Customer, EmailNotification, Order, OrderItem, Shipment, ShipmentEvent
from test_api import (add_product, csrf_token, seed_customer_session, test_client as test_client,
                      safe_auth_email_and_cookies as safe_auth_email_and_cookies)

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def shipment_case(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    _, variant_id = await add_product(factory, stock=10)
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        customer.role = "admin"
        order = Order(
            order_number="PNY-SHIPMENT-TEST", customer_id=customer_id, customer_email=customer.email,
            status="processing", payment_status="paid", fulfillment_status="supplier_confirmed",
            supplier_fulfillment_status="supplier_confirmed",
            total_amount=3000, currency="JPY", shipping_address={"countryCode": "JP"},
            shipping_method="standard", payment_method="card", payment_provider="stripe",
        )
        db.add(order)
        await db.flush()
        lines = [OrderItem(order_id=order.id, variant_id=variant_id, product_name="Bunny", supplier_name="Ponyo",
                           image_url="https://example.test/bunny.png", quantity=2, unit_price=1500, currency="JPY")]
        db.add_all(lines)
        await db.commit()
        order_id, item_id = order.id, lines[0].id
    return client, factory, customer_id, order_id, item_id


async def post(client, path, body):
    return await client.post(path, json=body, headers={"X-CSRF-Token": await csrf_token(client)})


async def test_multiple_partial_shipments_and_customer_delivery_confirmation(shipment_case):
    client, factory, customer_id, order_id, item_id = shipment_case
    endpoint = f"/v1/orders/{order_id}/shipments"
    first = await post(client, endpoint, {
        "carrier": "Japan Post", "trackingNumber": "JP-TRACK-1", "trackingUrl": "https://track.example.test/JP-TRACK-1",
        "estimatedDeliveryAt": "2026-12-01T10:00:00Z", "items": [{"orderItemId": str(item_id), "quantity": 1}],
    })
    assert first.status_code == 200, first.text
    first_id = first.json()["data"]["id"]
    second = await post(client, endpoint, {
        "carrier": "Yamato", "trackingNumber": "YT-TRACK-2", "items": [{"orderItemId": str(item_id), "quantity": 1}],
    })
    assert second.status_code == 200, second.text
    second_id = second.json()["data"]["id"]
    for shipment_id in (first_id, second_id):
        event_id = str(uuid4())
        status_url = f"/v1/orders/{order_id}/shipments/{shipment_id}/status"
        transit = await post(client, status_url, {"status": "in_transit", "eventId": event_id, "note": "Carrier scan"})
        assert transit.status_code == 200, transit.text
        replay = await post(client, status_url, {"status": "in_transit", "eventId": event_id, "note": "Carrier scan"})
        assert replay.status_code == 200
        conflict = await post(client, status_url, {"status": "in_transit", "eventId": event_id, "note": "Different scan"})
        assert conflict.status_code == 409
        delivered = await post(client, status_url, {"status": "delivered", "eventId": str(uuid4())})
        assert delivered.status_code == 200, delivered.text

    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        customer.role = "customer"
        await db.commit()
    for shipment_id in (first_id, second_id):
        confirmation = await post(client, f"/v1/orders/{order_id}/shipments/{shipment_id}/confirm-delivery", {})
        assert confirmation.status_code == 200, confirmation.text
        assert confirmation.json()["data"]["customerConfirmedAt"] is not None

    order_response = await client.get(f"/v1/orders/{order_id}")
    assert order_response.status_code == 200
    order = order_response.json()["data"]
    assert len(order["shipments"]) == 2
    assert {shipment["carrier"] for shipment in order["shipments"]} == {"Japan Post", "Yamato"}
    assert all(shipment["status"] == "delivered" and shipment["customerConfirmedAt"] for shipment in order["shipments"])
    assert order["fulfillmentStatus"] == "delivered"
    assert order["supplierFulfillmentStatus"] == "supplier_confirmed"
    async with factory() as db:
        assert await db.scalar(select(Order).where(Order.id == order_id).with_for_update()) is not None
        assert await db.scalar(select(ShipmentEvent.id).where(ShipmentEvent.shipment_id == UUID(first_id))) is not None
        notifications = (await db.scalars(select(EmailNotification).order_by(EmailNotification.template))).all()
        assert [row.template for row in notifications].count("shipping_notification") == 2
        assert [row.template for row in notifications].count("delivery_notification") == 2


async def test_prevents_over_shipment_and_rejects_non_https_tracking(shipment_case):
    client, factory, customer_id, order_id, item_id = shipment_case
    endpoint = f"/v1/orders/{order_id}/shipments"
    body = {"carrier": "Carrier", "trackingNumber": "TRACK-1", "items": [{"orderItemId": str(item_id), "quantity": 2}]}
    assert (await post(client, endpoint, body)).status_code == 200
    over = await post(client, endpoint, {**body, "trackingNumber": "TRACK-2"})
    assert over.status_code == 409
    invalid_url = await post(client, endpoint, {**body, "trackingNumber": "TRACK-3", "trackingUrl": "http://unsafe.example.test/track"})
    assert invalid_url.status_code == 422


async def test_non_admin_cannot_create_shipments(shipment_case):
    client, factory, customer_id, order_id, item_id = shipment_case
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        customer.role = "customer"
        await db.commit()
    response = await post(client, f"/v1/orders/{order_id}/shipments", {
        "carrier": "Carrier", "trackingNumber": "TRACK-1", "items": [{"orderItemId": str(item_id), "quantity": 1}],
    })
    assert response.status_code == 403


async def test_shipment_cannot_be_confirmed_before_marked_delivered(shipment_case):
    client, factory, customer_id, order_id, item_id = shipment_case
    created = await post(client, f"/v1/orders/{order_id}/shipments", {
        "carrier": "Carrier", "trackingNumber": "TRACK-1", "items": [{"orderItemId": str(item_id), "quantity": 1}],
    })
    shipment_id = created.json()["data"]["id"]
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        customer.role = "customer"
        await db.commit()
    response = await post(client, f"/v1/orders/{order_id}/shipments/{shipment_id}/confirm-delivery", {})
    assert response.status_code == 409
