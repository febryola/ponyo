"""Payment API/lifecycle contracts; disposable database and mocked Stripe only."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
import stripe
from sqlalchemy import func, select

from app.config import settings
from app.models import Customer, EmailNotification, Order, OutboxEvent, PaymentTransaction, ProcessedWebhook, ProductVariant
from test_api import add_product, checkout_payload, csrf_token, seed_customer_session
from test_api import test_client as test_client, safe_auth_email_and_cookies as safe_auth_email_and_cookies
from test_supplier_flow import mocked_services as mocked_services

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def flow(test_client, mocked_services, monkeypatch):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    _, variant_id = await add_product(factory, stock=10, price=1500)
    monkeypatch.setattr(settings, "stripe_capture_method", "manual")
    monkeypatch.setattr(settings, "checkout_tax_rates_bps", {})
    payload = checkout_payload(variant_id)
    response = await client.post("/v1/checkout/sessions", json=payload, headers={"X-CSRF-Token": await csrf_token(client)})
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    intent = {"id": "pi_payment", "metadata": {"ponyo_order_id": str(order_id)}, "amount": 1500,
              "currency": "jpy", "status": "requires_capture", "amount_capturable": 1500, "amount_received": 0}
    retrieve = Mock(side_effect=lambda *args, **kwargs: dict(intent))
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", retrieve)
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", Mock(side_effect=lambda *args, **kwargs: {
        "id": "cs_test_supplier", "metadata": {"ponyo_order_id": str(order_id)}, "amount_total": 1500,
        "currency": "jpy", "status": "complete", "payment_status": "unpaid", "payment_intent": dict(intent),
    }))
    monkeypatch.setattr(stripe.Refund, "list", Mock(return_value=SimpleNamespace(auto_paging_iter=lambda: iter([]))))
    mocked_services.construct_event.side_effect = None
    capture = Mock(side_effect=lambda *args, **kwargs: dict(intent, status="succeeded", amount_received=1500, amount_capturable=0))
    monkeypatch.setattr(stripe.PaymentIntent, "capture", capture)
    refund_create = Mock(side_effect=lambda **kwargs: {
        "id": "re_payment", "payment_intent": "pi_payment", "status": "succeeded", "amount": kwargs["amount"],
        "currency": "jpy", "metadata": kwargs["metadata"],
    })
    monkeypatch.setattr(stripe.Refund, "create", refund_create)
    return SimpleNamespace(client=client, factory=factory, customer_id=customer_id, variant_id=variant_id,
                           order_id=order_id, intent=intent, retrieve=retrieve, capture=capture,
                           refund_create=refund_create, services=mocked_services)


async def post(flow, suffix, payload=None):
    return await flow.client.post(f"/v1/payments/orders/{flow.order_id}/{suffix}", json=payload or {},
                                   headers={"X-CSRF-Token": await csrf_token(flow.client)})


async def event(flow, kind, event_id="evt_payment", obj=None):
    flow.services.construct_event.return_value = {"id": event_id, "type": kind, "data": {"object": obj or dict(flow.intent)}}
    return await flow.client.post("/v1/webhooks/stripe", content=b"test", headers={"stripe-signature": "test"})


async def admin(flow):
    async with flow.factory() as db:
        customer = await db.get(Customer, flow.customer_id)
        customer.role = "admin"
        await db.commit()


async def authorize(flow):
    response = await event(flow, "payment_intent.amount_capturable_updated")
    assert response.status_code == 200, response.text


async def paid(flow):
    flow.intent.update(status="succeeded", amount_received=1500, amount_capturable=0)
    response = await event(flow, "payment_intent.succeeded")
    assert response.status_code == 200, response.text


async def test_gateway_initiation_metadata_and_transaction(flow):
    kwargs = flow.services.create.call_args.kwargs
    assert kwargs["payment_intent_data"] == {"capture_method": "manual", "metadata": {"ponyo_order_id": str(flow.order_id)}}
    async with flow.factory() as db:
        row = await db.scalar(select(PaymentTransaction))
        assert (row.kind, row.status, row.amount, row.provider_reference) == ("initiation", "pending", 1500, "cs_test_supplier")
        assert (await db.get(Order, flow.order_id)).capture_method == "manual"


async def test_authorize_does_not_fulfill_capture_once_and_replay(flow):
    await authorize(flow)
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert (order.payment_status, order.status, order.fulfillment_status) == ("authorized", "pending_payment", "unfulfilled")
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 9
    assert (await post(flow, "capture", {"idempotencyKey": str(uuid4())})).status_code == 403
    await admin(flow)
    key = str(uuid4())
    response = await post(flow, "capture", {"idempotencyKey": key})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "succeeded"
    assert (await post(flow, "capture", {"idempotencyKey": key})).status_code == 200
    assert flow.capture.call_count == 1
    flow.intent.update(status="succeeded", amount_received=1500, amount_capturable=0)
    assert (await event(flow, "payment_intent.succeeded", "evt_capture_later")).status_code == 200
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert (order.status, order.payment_status, order.captured_amount) == ("processing", "paid", 1500)
        assert await db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "order.payment_succeeded")) == 1
        notifications = (await db.scalars(select(EmailNotification).order_by(EmailNotification.template))).all()
        assert [row.template for row in notifications] == ["order_confirmation", "payment_confirmation"]


async def test_refund_partial_full_and_idempotency(flow):
    await paid(flow)
    await admin(flow)
    key = str(uuid4())
    response = await post(flow, "refunds", {"idempotencyKey": key, "amount": 500})
    assert response.status_code == 200, response.text
    assert (await post(flow, "refunds", {"idempotencyKey": key, "amount": 500})).status_code == 200
    assert flow.refund_create.call_count == 1
    assert (await post(flow, "refunds", {"idempotencyKey": key, "amount": 600})).status_code == 409
    assert (await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 1001})).status_code == 409
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.payment_status == "partially_refunded" and order.refunded_amount == 500
        refund_email = await db.scalar(select(EmailNotification).where(EmailNotification.template == "refund_notification"))
        assert refund_email and refund_email.payload["amount"] == 500
    original = flow.refund_create.side_effect
    flow.refund_create.side_effect = lambda **kwargs: dict(original(**kwargs), id="re_second")
    response = await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 1000})
    assert response.status_code == 200, response.text
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.payment_status == "refunded" and order.refunded_amount == 1500
        assert order.status == "processing"  # refund is not a stock return
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 9


async def test_pending_refund_reserves_amount_then_failed_webhook_releases(flow, monkeypatch):
    await paid(flow)
    await admin(flow)
    original = flow.refund_create.side_effect
    flow.refund_create.side_effect = lambda **kwargs: dict(original(**kwargs), status="pending")
    response = await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 1200})
    assert response.status_code == 200
    assert (await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 301})).status_code == 409
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).refunded_amount == 0
    failure = dict(original(**flow.refund_create.call_args.kwargs), status="failed", failure_reason="lost_or_stolen_card")
    monkeypatch.setattr(stripe.Refund, "retrieve", Mock(return_value=failure))
    response = await event(flow, "refund.updated", "evt_refund_failed", failure)
    assert response.status_code == 200, response.text
    assert (await event(flow, "refund.updated", "evt_refund_failed", failure)).status_code == 200
    async with flow.factory() as db:
        rows = (await db.scalars(select(PaymentTransaction).where(PaymentTransaction.kind == "refund"))).all()
        assert len(rows) == 1 and rows[0].status == "failed"
        assert (await db.get(Order, flow.order_id)).refunded_amount == 0


async def test_timeout_keeps_refund_reserved_and_same_key_retries(flow):
    await paid(flow)
    await admin(flow)
    original = flow.refund_create.side_effect
    flow.refund_create.side_effect = stripe.APIConnectionError("connection lost")
    key = str(uuid4())
    assert (await post(flow, "refunds", {"idempotencyKey": key, "amount": 1500})).status_code == 503
    async with flow.factory() as db:
        row = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.kind == "refund"))
        assert row.status == "unknown"
    assert (await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 1})).status_code == 409
    flow.refund_create.side_effect = original
    assert (await post(flow, "refunds", {"idempotencyKey": key, "amount": 1500})).status_code == 200
    keys = [call.kwargs["idempotency_key"] for call in flow.refund_create.call_args_list]
    assert keys[0] == keys[1]


async def test_sync_uses_provider_state_and_preserves_ownership(flow):
    response = await post(flow, "sync")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["paymentStatus"] == "authorized"
    flow.intent.update(status="succeeded", amount_received=1500, amount_capturable=0)
    response = await post(flow, "sync")
    assert response.status_code == 200
    assert response.json()["data"]["capturedAmount"] == 1500
    await seed_customer_session(flow.client, flow.factory, email="other@example.com")
    assert (await flow.client.get(f"/v1/payments/orders/{flow.order_id}")).status_code == 404
    assert (await post(flow, "sync")).status_code == 404


@pytest.mark.parametrize("change", [{"amount": 1501}, {"currency": "usd"}, {"amount_received": 1}, {"metadata": {"ponyo_order_id": str(uuid4())}}])
async def test_invalid_payment_never_fulfills(flow, change):
    flow.intent.update(status="succeeded", amount_received=1500)
    flow.intent.update(change)
    response = await event(flow, "payment_intent.succeeded")
    assert response.status_code in {400, 503}, response.text
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).payment_status == "unpaid"
        assert await db.scalar(select(func.count()).select_from(ProcessedWebhook)) == 0


async def test_declined_payment_is_recorded_retryable_without_restoring_stock(flow):
    flow.intent.update(status="requires_payment_method", last_payment_error={"code": "card_declined", "decline_code": "insufficient_funds"})
    result = await event(flow, "payment_intent.payment_failed")
    assert result.status_code == 200
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        assert order.status == "pending_payment" and order.payment_status == "unpaid"
        attempts = (await db.scalars(select(PaymentTransaction).where(PaymentTransaction.kind == "payment_attempt"))).all()
        assert len(attempts) == 1 and attempts[0].error_code == "insufficient_funds"
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 9


async def test_out_of_order_failure_reads_current_success_and_duplicate_is_noop(flow):
    flow.intent.update(status="succeeded", amount_received=1500, amount_capturable=0)
    assert (await event(flow, "payment_intent.payment_failed")).status_code == 200
    assert (await event(flow, "payment_intent.payment_failed")).status_code == 200
    assert flow.retrieve.call_count == 1
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).payment_status == "paid"
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 9


async def test_void_authorization_requires_provider_cancel_and_restores_once(flow, monkeypatch):
    await authorize(flow)
    await admin(flow)
    cancel = Mock(return_value=dict(flow.intent, status="canceled", amount_capturable=0))
    monkeypatch.setattr(stripe.PaymentIntent, "cancel", cancel)
    key = str(uuid4())
    result = await post(flow, "void", {"idempotencyKey": key})
    assert result.status_code == 200, result.text
    assert (await post(flow, "void", {"idempotencyKey": key})).status_code == 200
    assert cancel.call_count == 1
    async with flow.factory() as db:
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 10
        assert (await db.get(Order, flow.order_id)).status == "cancelled"
        notice = await db.scalar(select(EmailNotification).where(EmailNotification.template == "cancellation_notification"))
        assert notice and notice.recipient == "buyer@example.com"


async def test_payment_permissions_csrf_and_refund_input_validation(flow):
    assert (await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 1})).status_code == 403
    await admin(flow)
    assert (await flow.client.post(f"/v1/payments/orders/{flow.order_id}/capture", json={"idempotencyKey": str(uuid4())})).status_code == 403
    for amount in (0, -1, 1.5, True):
        assert (await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": amount})).status_code == 422
    config = await flow.client.get("/v1/payments/configuration")
    assert config.status_code == 200
    assert "sk_test" not in config.text and "whsec" not in config.text


async def test_webhook_invalid_signature_and_provider_failure_do_not_record_event(flow, monkeypatch):
    flow.services.construct_event.side_effect = stripe.SignatureVerificationError("invalid", "sig")
    assert (await event(flow, "payment_intent.succeeded")).status_code == 400
    flow.services.construct_event.side_effect = None
    flow.retrieve.side_effect = stripe.APIConnectionError("offline")
    assert (await event(flow, "payment_intent.succeeded")).status_code == 503
    async with flow.factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProcessedWebhook)) == 0


async def test_old_ambiguous_refund_is_not_recreated_after_stripe_retry_window(flow):
    await paid(flow)
    await admin(flow)
    key = uuid4()
    async with flow.factory() as db:
        db.add(PaymentTransaction(order_id=flow.order_id, provider="stripe", kind="refund", status="unknown",
                                  amount=500, currency="JPY", reason="requested_by_customer",
                                  event_key="old-refund", idempotency_key=f"ponyo-refund-{key}",
                                  created_at=datetime.now(timezone.utc) - timedelta(hours=25)))
        await db.commit()
    result = await post(flow, "refunds", {"idempotencyKey": str(key), "amount": 500})
    assert result.status_code == 409
    flow.refund_create.assert_not_called()


async def test_capture_timeout_retry_and_current_sync_resolves_pending_operation(flow):
    await authorize(flow)
    await admin(flow)
    flow.capture.side_effect = stripe.APIConnectionError("offline")
    result = await post(flow, "capture", {"idempotencyKey": str(uuid4())})
    assert result.status_code == 503
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).payment_status == "authorized"
        operation = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.kind == "capture_request"))
        assert operation.status == "unknown"
    flow.intent.update(status="succeeded", amount_received=1500, amount_capturable=0)
    response = await post(flow, "sync")
    assert response.status_code == 200
    async with flow.factory() as db:
        operation = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.kind == "capture_request"))
        assert operation.status == "succeeded"


async def test_refund_out_of_order_event_keeps_success_and_stock_intact(flow, monkeypatch):
    await paid(flow)
    await admin(flow)
    result = await post(flow, "refunds", {"idempotencyKey": str(uuid4()), "amount": 500})
    assert result.status_code == 200
    refund = flow.refund_create.side_effect(**flow.refund_create.call_args.kwargs)
    monkeypatch.setattr(stripe.Refund, "retrieve", Mock(return_value=refund))
    stale = dict(refund, status="pending")
    assert (await event(flow, "refund.updated", "evt_stale_refund", stale)).status_code == 200
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).refunded_amount == 500
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 9
        assert await db.scalar(select(func.count()).select_from(PaymentTransaction).where(PaymentTransaction.kind == "refund")) == 1
