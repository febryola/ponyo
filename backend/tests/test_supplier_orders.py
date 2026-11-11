"""Supplier split/forward/reject/retry behavior, isolated DB and fake transport."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.config import settings
from app.models import (Customer, Order, OrderItem, ProductVariant, Supplier, SupplierAccount,
                        SupplierConfirmation, SupplierInventory, SupplierOffer,
                        SupplierPurchaseOrder, SupplierPurchaseOrderItem)
from app.supplier_forwarding import dispatch_purchase_order, run_supplier_iteration
from app.supplier_orders import generate_purchase_orders, load_order
from test_api import add_product, checkout_payload, csrf_token, seed_customer_session
from test_api import test_client as test_client, safe_auth_email_and_cookies as safe_auth_email_and_cookies
from test_supplier_flow import mocked_services as mocked_services

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def flow(test_client, mocked_services, monkeypatch):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    variants = [(await add_product(factory, slug=f"po-item-{i}", stock=10, price=1500))[1] for i in range(2)]
    async with factory() as db:
        a, b, alt = [Supplier(code=code, name=code, active=True, is_demo=False) for code in ("PRIMARY-A", "PRIMARY-B", "ALTERNATIVE")]
        db.add_all([a, b, alt])
        await db.flush()
        offers = []
        for supplier, variant, cost, lead in ((a, variants[0], 500, 1), (b, variants[1], 600, 1), (alt, variants[0], 400, 2)):
            offer = SupplierOffer(supplier_id=supplier.id, variant_id=variant, supplier_sku=f"SKU-{len(offers)}",
                                  cost_amount=cost, currency="JPY", lead_time_days=lead, minimum_order_quantity=1, active=True)
            db.add(offer)
            await db.flush()
            db.add(SupplierInventory(offer_id=offer.id, on_hand=10, reserved=0))
            offers.append(offer.id)
        await db.commit()
        supplier_ids = [a.id, b.id, alt.id]
    payload = checkout_payload(variants[0])
    payload["items"] = [{"variantId": str(variant), "quantity": 1} for variant in variants]
    response = await client.post("/v1/checkout/sessions", json=payload, headers={"X-CSRF-Token": await csrf_token(client)})
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    mocked_services.construct_event.side_effect = None
    mocked_services.construct_event.return_value = {"id": "evt_po_paid", "type": "checkout.session.completed", "data": {"object": {
        "id": "cs_test_supplier", "metadata": {"ponyo_order_id": str(order_id)}, "payment_status": "paid", "amount_total": 3000, "currency": "jpy",
    }}}
    assert (await client.post("/v1/webhooks/stripe", content=b"test", headers={"stripe-signature": "test"})).status_code == 200
    monkeypatch.setattr(settings, "supplier_forwarding_enabled", True)
    monkeypatch.setattr(settings, "supplier_max_attempts", 3)
    monkeypatch.setattr(settings, "supplier_integrations", {code: {"url": "https://supplier.example.test/orders", "token": "test-only", "idempotent": "true"}
                                                            for code in ("PRIMARY-A", "PRIMARY-B", "ALTERNATIVE")})
    return SimpleNamespace(client=client, factory=factory, customer_id=customer_id, variants=variants,
                           offers=offers, supplier_ids=supplier_ids, order_id=order_id)


async def plan(flow):
    async with flow.factory() as db:
        order = await load_order(db, flow.order_id)
        created = await generate_purchase_orders(db, order)
        await db.commit()
        return [po.id for po in created]


def accepted(integration, payload):
    return {"status": "accepted", "idempotencyKey": payload["idempotencyKey"], "supplierOrderId": f"EXT-{payload['id']}"}


async def admin(flow):
    async with flow.factory() as db:
        actor = await db.get(Customer, flow.customer_id)
        actor.role = "admin"
        await db.commit()


async def post(flow, path, body=None):
    return await flow.client.post(path, json=body or {}, headers={"X-CSRF-Token": await csrf_token(flow.client)})


async def po_for(flow, supplier_index):
    async with flow.factory() as db:
        return await db.scalar(select(SupplierPurchaseOrder.id).where(SupplierPurchaseOrder.order_id == flow.order_id,
                                                                       SupplierPurchaseOrder.supplier_id == flow.supplier_ids[supplier_index]))


async def test_paid_order_split_by_supplier_and_no_double_stock_debit(flow):
    ids = await plan(flow)
    assert len(ids) == 2
    assert await plan(flow) == []
    async with flow.factory() as db:
        pos = (await db.scalars(select(SupplierPurchaseOrder))).all()
        assert len({po.po_number for po in pos}) == 2
        assert {po.supplier_id for po in pos} == set(flow.supplier_ids[:2])
        items = (await db.scalars(select(SupplierPurchaseOrderItem))).all()
        assert len(items) == 2 and all(item.route_attempt == 1 for item in items)
        inventories = {row.offer_id: row.on_hand for row in await db.scalars(select(SupplierInventory))}
        assert inventories == {flow.offers[0]: 9, flow.offers[1]: 9, flow.offers[2]: 10}
        assert all([(await db.get(ProductVariant, variant)).stock_quantity == 9 for variant in flow.variants])


async def test_multiple_lines_same_supplier_aggregate_into_one_purchase_order(flow):
    async with flow.factory() as db:
        second = await db.get(SupplierOffer, flow.offers[1])
        second.supplier_id = flow.supplier_ids[0]
        await db.commit()
    ids = await plan(flow)
    assert len(ids) == 1
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, ids[0])
        assert po.total_cost == 1100
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrderItem)) == 2


async def test_forwarding_payload_and_duplicate_dispatch_noop(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    transport = Mock(side_effect=accepted)
    assert await dispatch_purchase_order(flow.factory, identifier, transport)
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    assert transport.call_count == 1
    payload = transport.call_args.args[1]
    assert payload["shippingAddress"]["countryCode"] == "JP"
    assert len(payload["items"]) == 1 and payload["items"][0]["supplierSku"] == "SKU-0"
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        assert po.status == "submitted" and po.attempts == 1
        assert po.idempotency_key == payload["idempotencyKey"]


async def test_timeout_retry_same_po_key_never_routes_elsewhere(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    transport = Mock(side_effect=TimeoutError("do not leak provider data"))
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        assert po.status == "unknown" and po.last_error == "TimeoutError"
        assert po.next_attempt_at is not None
        original_key = po.idempotency_key
        po.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    transport.side_effect = accepted
    assert await dispatch_purchase_order(flow.factory, identifier, transport)
    assert transport.call_args.args[1]["idempotencyKey"] == original_key
    assert transport.call_args_list[0].args[1] == transport.call_args_list[1].args[1]
    async with flow.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 2
        inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == flow.offers[2]))
        assert inventory.on_hand == 10


async def test_explicit_rejection_routes_alternative_once_and_preserves_audit(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    await dispatch_purchase_order(flow.factory, identifier, accepted)
    await admin(flow)
    decision = {"eventId": str(uuid4()), "decision": "rejected", "reason": "inventory_unavailable"}
    for _ in range(2):
        result = await post(flow, f"/v1/supplier-orders/{identifier}/confirmation", decision)
        assert result.status_code == 200, result.text
    async with flow.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 3
        assert await db.scalar(select(func.count()).select_from(SupplierConfirmation)) == 1
        alt = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == flow.offers[2]))
        original = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == flow.offers[0]))
        assert (alt.on_hand, original.on_hand) == (9, 0)
        assert (await db.get(ProductVariant, flow.variants[0])).stock_quantity == 9
        routes = (await db.scalars(select(SupplierPurchaseOrderItem).where(SupplierPurchaseOrderItem.variant_id == flow.variants[0])
                                   .order_by(SupplierPurchaseOrderItem.route_attempt))).all()
        assert [row.offer_id for row in routes] == [flow.offers[0], flow.offers[2]]
        assert [row.route_attempt for row in routes] == [1, 2]


async def test_rejection_without_alternative_enters_hold_then_retries_on_restock(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == flow.offers[2]))
        inventory.on_hand = 0
        await db.commit()
    await dispatch_purchase_order(flow.factory, identifier, accepted)
    await admin(flow)
    response = await post(flow, f"/v1/supplier-orders/{identifier}/confirmation",
                          {"eventId": str(uuid4()), "decision": "rejected", "reason": "inventory_unavailable"})
    assert response.status_code == 200
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.fulfillment_status == "on_hold" and order.supplier_retry_at is not None
        inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == flow.offers[2]))
        inventory.on_hand = 5
        order.supplier_retry_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    await run_supplier_iteration(flow.factory, accepted)
    assert await po_for(flow, 2) is not None


async def test_confirm_all_suppliers_advances_fulfillment_and_reject_after_confirm_fails(flow):
    identifiers = await plan(flow)
    await admin(flow)
    for identifier in identifiers:
        await dispatch_purchase_order(flow.factory, identifier, accepted)
        result = await post(flow, f"/v1/supplier-orders/{identifier}/confirmation",
                            {"eventId": str(uuid4()), "decision": "confirmed", "supplierOrderId": f"EXT-{identifier}"})
        assert result.status_code == 200, result.text
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).fulfillment_status == "supplier_confirmed"
    assert (await post(flow, f"/v1/supplier-orders/{identifiers[0]}/confirmation",
                       {"eventId": str(uuid4()), "decision": "rejected"})).status_code == 409


async def test_supplier_role_binding_isolation_and_csrf(flow):
    ids = await plan(flow)
    assert (await flow.client.get("/v1/supplier-orders")).status_code == 403
    await seed_customer_session(flow.client, flow.factory, email="supplier@example.com")
    async with flow.factory() as db:
        account = await db.scalar(select(Customer).where(Customer.email == "supplier@example.com"))
        account.role = "supplier"
        db.add(SupplierAccount(customer_id=account.id, supplier_id=flow.supplier_ids[0]))
        await db.commit()
    response = await flow.client.get("/v1/supplier-orders")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    own = UUID(response.json()["data"][0]["id"])
    other = next(identifier for identifier in ids if identifier != own)
    assert (await flow.client.get(f"/v1/supplier-orders/{other}")).status_code == 404
    assert (await flow.client.post(f"/v1/supplier-orders/{own}/confirmation", json={"eventId": str(uuid4()), "decision": "rejected"})).status_code == 403
    assert (await post(flow, f"/v1/supplier-orders/orders/{flow.order_id}/plan")).status_code == 403


async def test_retry_exhaustion_and_no_auto_reroute_for_unknown_delivery(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    transport = Mock(side_effect=TimeoutError())
    for _ in range(3):
        await dispatch_purchase_order(flow.factory, identifier, transport)
        async with flow.factory() as db:
            po = await db.get(SupplierPurchaseOrder, identifier)
            po.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        assert po.status == "manual_review" and po.attempts == 3
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 2
    assert transport.call_count == 3
    await admin(flow)
    assert (await post(flow, f"/v1/supplier-orders/{identifier}/retry")).status_code == 409


async def test_confirmation_timeout_requires_review_without_replacement(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    await dispatch_purchase_order(flow.factory, identifier, accepted)
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        po.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    await run_supplier_iteration(flow.factory, accepted)
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        assert po.status == "manual_review" and po.last_error == "confirmation_timeout"
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 2


async def test_disabled_transport_and_demo_supplier_never_send(flow, monkeypatch):
    await plan(flow)
    identifier = await po_for(flow, 0)
    transport = Mock(side_effect=AssertionError("network forbidden"))
    monkeypatch.setattr(settings, "supplier_forwarding_enabled", False)
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    monkeypatch.setattr(settings, "supplier_forwarding_enabled", True)
    async with flow.factory() as db:
        supplier = await db.get(Supplier, flow.supplier_ids[0])
        supplier.is_demo = True
        await db.commit()
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    transport.assert_not_called()


async def test_unpaid_or_refunded_orders_never_plan_or_forward(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        order.payment_status = "refunded"
        await db.commit()
    with pytest.raises(HTTPException):
        await plan(flow)
    transport = Mock()
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    transport.assert_not_called()


async def test_locked_live_lease_prevents_second_worker_claim(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        po.status = "dispatching"
        po.lease_until = datetime.now(timezone.utc) + timedelta(seconds=30)
        await db.commit()
    transport = Mock()
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    transport.assert_not_called()


async def test_same_event_cannot_change_decision_or_supplier_reference(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    await dispatch_purchase_order(flow.factory, identifier, accepted)
    await admin(flow)
    key = str(uuid4())
    payload = {"eventId": key, "decision": "confirmed", "supplierOrderId": f"EXT-{identifier}"}
    assert (await post(flow, f"/v1/supplier-orders/{identifier}/confirmation", payload)).status_code == 200
    payload["decision"] = "rejected"
    assert (await post(flow, f"/v1/supplier-orders/{identifier}/confirmation", payload)).status_code == 409


async def test_alternative_more_expensive_than_original_requires_review(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        alternative = await db.get(SupplierOffer, flow.offers[2])
        alternative.cost_amount = 501  # Original allocation costs 500.
        await db.commit()
    await dispatch_purchase_order(flow.factory, identifier, accepted)
    await admin(flow)
    result = await post(flow, f"/v1/supplier-orders/{identifier}/confirmation",
                        {"eventId": str(uuid4()), "decision": "rejected", "reason": "inventory_unavailable"})
    assert result.status_code == 200
    async with flow.factory() as db:
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 2
        assert (await db.get(Order, flow.order_id)).fulfillment_status == "on_hold"


async def test_expired_delivery_lease_retries_same_identity(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        po = await db.get(SupplierPurchaseOrder, identifier)
        po.status, po.attempts = "dispatching", 1
        po.lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        original_key = po.idempotency_key
        await db.commit()
    transport = Mock(side_effect=accepted)
    assert await dispatch_purchase_order(flow.factory, identifier, transport)
    assert transport.call_args.args[1]["idempotencyKey"] == original_key
    async with flow.factory() as db:
        assert (await db.get(SupplierPurchaseOrder, identifier)).attempts == 2


async def test_checkout_selection_respects_minimum_order_and_deterministic_cost(flow, mocked_services):
    async with flow.factory() as db:
        primary = await db.get(SupplierOffer, flow.offers[0])
        primary.minimum_order_quantity = 2
        await db.commit()
    mocked_services.create.return_value.id = "cs_moq_second"
    result = await post(flow, "/v1/checkout/sessions", checkout_payload(flow.variants[0]))
    assert result.status_code == 200, result.text
    async with flow.factory() as db:
        item = await db.scalar(select(OrderItem).where(OrderItem.order_id == UUID(result.json()["data"]["orderId"])))
        assert item.supplier_offer_id == flow.offers[2]


async def test_admin_supplier_binding_and_unmapped_supplier_blocked(flow):
    await plan(flow)
    await admin(flow)
    await seed_customer_session(flow.client, flow.factory, email="supplier-link@example.com")
    async with flow.factory() as db:
        actor = await db.scalar(select(Customer).where(Customer.email == "supplier-link@example.com"))
        actor.role = "supplier"
        actor_id = actor.id
        await db.commit()
    assert (await flow.client.get("/v1/supplier-orders")).status_code == 403
    # Restore the original admin session without creating or changing supplier roles via a public API.
    from app.security import create_session_token
    flow.client.cookies.set(settings.session_cookie_name, create_session_token(flow.customer_id))
    result = await post(flow, f"/v1/supplier-orders/suppliers/{flow.supplier_ids[0]}/accounts", {"customerId": str(actor_id)})
    assert result.status_code == 200, result.text
    assert (await post(flow, f"/v1/supplier-orders/suppliers/{flow.supplier_ids[1]}/accounts", {"customerId": str(actor_id)})).status_code == 409


async def test_immediate_transport_confirmation_and_rejection(flow):
    await plan(flow)
    identifier = await po_for(flow, 0)
    confirmed = lambda integration, payload: dict(accepted(integration, payload), status="confirmed")
    assert await dispatch_purchase_order(flow.factory, identifier, confirmed)
    async with flow.factory() as db:
        assert (await db.get(SupplierPurchaseOrder, identifier)).status == "confirmed"
    second = await po_for(flow, 1)
    rejected = lambda integration, payload: {"idempotencyKey": payload["idempotencyKey"], "status": "rejected", "reason": "inventory_unavailable"}
    assert await dispatch_purchase_order(flow.factory, second, rejected)
    async with flow.factory() as db:
        assert (await db.get(SupplierPurchaseOrder, second)).status == "rejected"
        assert (await db.get(Order, flow.order_id)).fulfillment_status == "on_hold"


async def test_state_change_while_request_in_flight_requires_review(flow):
    from app.supplier_forwarding import claim_delivery

    await plan(flow)
    identifier = await po_for(flow, 0)
    async with flow.factory() as db:
        claimed = await claim_delivery(db, identifier)
        assert claimed is not None
        await db.commit()
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        order.payment_status = "partially_refunded"
        po = await db.get(SupplierPurchaseOrder, identifier)
        po.lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    transport = Mock(side_effect=accepted)
    assert not await dispatch_purchase_order(flow.factory, identifier, transport)
    transport.assert_not_called()
    async with flow.factory() as db:
        assert (await db.get(SupplierPurchaseOrder, identifier)).status == "manual_review"


async def test_no_supplier_routing_retry_is_bounded_and_respects_backoff(flow):
    async with flow.factory() as db:
        for offer_id in flow.offers:
            offer = await db.get(SupplierOffer, offer_id)
            offer.active = False
        await db.commit()
    assert await plan(flow) == []
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.supplier_retry_count == 1 and order.fulfillment_status == "on_hold"
    await run_supplier_iteration(flow.factory, accepted)
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).supplier_retry_count == 1
    for _ in range(2):
        async with flow.factory() as db:
            order = await db.get(Order, flow.order_id)
            order.supplier_retry_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        await run_supplier_iteration(flow.factory, accepted)
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.supplier_retry_count == 3 and order.supplier_retry_at is None
        assert await db.scalar(select(func.count()).select_from(SupplierPurchaseOrder)) == 0
