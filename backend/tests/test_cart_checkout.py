"""Cart checkout contracts against isolated SQLite, with SMTP/Stripe safety mocks."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.inventory import reserve_supplier_stock
from app.models import (
    Order, OrderItem, OrderStatusHistory, OutboxEvent, ProductVariant,
    Supplier, SupplierInventory, SupplierOffer,
)
from test_api import (
    add_product, checkout_payload, csrf_token, seed_customer_session,
    safe_auth_email_and_cookies as safe_auth_email_and_cookies,
    test_client as test_client,
)
from test_supplier_flow import mocked_services as mocked_services


pytestmark = pytest.mark.asyncio


@pytest.fixture
async def cart_checkout(test_client, mocked_services):
    """Two products with distinct suppliers; no demo linker or shared catalog state."""
    client, session_factory = test_client
    customer_id = await seed_customer_session(client, session_factory, verified=True)
    lines = []
    for index, price in enumerate((1500, 2300), start=1):
        _, variant_id = await add_product(
            session_factory, slug=f"cart-supplier-{index}", price=price, stock=120,
        )
        async with session_factory() as db:
            supplier = Supplier(
                code=f"CART-SUPPLIER-{index}", name=f"Cart supplier {index}", active=True,
            )
            db.add(supplier)
            await db.flush()
            offer = SupplierOffer(
                supplier_id=supplier.id, variant_id=variant_id,
                supplier_sku=f"CART-SKU-{index}", cost_amount=price // 2,
                currency="JPY", active=True,
            )
            db.add(offer)
            await db.flush()
            db.add(SupplierInventory(offer_id=offer.id, on_hand=120, reserved=0))
            await db.commit()
            lines.append(SimpleNamespace(
                variant_id=variant_id, supplier_id=supplier.id, offer_id=offer.id,
                price=price, stock=120,
            ))
    return SimpleNamespace(
        client=client, session_factory=session_factory, customer_id=customer_id, lines=lines,
    )


@pytest.fixture
def reservation_spy(monkeypatch):
    spy = AsyncMock(wraps=reserve_supplier_stock)
    monkeypatch.setattr("app.routers.checkout.reserve_supplier_stock", spy)
    return spy


def cart_item(line, *, quantity=1, **expectations):
    return {"variantId": str(line.variant_id), "quantity": quantity, **expectations}


async def checkout(flow, items):
    payload = checkout_payload(flow.lines[0].variant_id)
    payload.update(currency="JPY", items=items)
    return await flow.client.post(
        "/v1/checkout/sessions", json=payload,
        headers={"X-CSRF-Token": await csrf_token(flow.client)},
    )


async def assert_inventory(flow, quantities, *, supplier_stock=None):
    """Fresh sessions prove committed stock, including rollback after partial reservation."""
    async with flow.session_factory() as db:
        for index, (line, quantity) in enumerate(zip(flow.lines, quantities, strict=True)):
            variant = await db.get(ProductVariant, line.variant_id)
            inventory = (await db.scalars(
                select(SupplierInventory).where(SupplierInventory.offer_id == line.offer_id)
            )).one()
            assert variant.stock_quantity == line.stock - quantity
            baseline = (line.stock, 0) if supplier_stock is None else supplier_stock[index]
            assert (inventory.on_hand, inventory.reserved) == (
                baseline[0], baseline[1] + quantity,
            )


async def assert_no_checkout(flow, services):
    services.create.assert_not_called()
    async with flow.session_factory() as db:
        for model in (Order, OrderItem, OrderStatusHistory, OutboxEvent):
            assert await db.scalar(select(func.count()).select_from(model)) == 0


async def test_two_supplier_cart_records_both_offers_and_reservations(
    cart_checkout, mocked_services, reservation_spy,
):
    flow = cart_checkout
    assert flow.lines[0].supplier_id != flow.lines[1].supplier_id
    quantities = (2, 3)
    response = await checkout(flow, [
        cart_item(line, quantity=quantity, expectedPriceAmount=line.price, expectedCurrency="JPY")
        for line, quantity in zip(flow.lines, quantities, strict=True)
    ])
    assert response.status_code == 200, response.text
    order_id = UUID(response.json()["data"]["orderId"])
    assert response.json()["data"]["checkoutUrl"] == "https://checkout.stripe.test/supplier"
    assert reservation_spy.await_count == 2
    await assert_inventory(flow, quantities)
    mocked_services.create.assert_called_once()
    stripe_lines = mocked_services.create.call_args.kwargs["line_items"]
    assert [(line["quantity"], line["price_data"]["unit_amount"]) for line in stripe_lines] == [
        (2, 1500), (3, 2300),
    ]
    async with flow.session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Order)) == 1
        order = await db.get(Order, order_id)
        assert (order.customer_id, order.status, order.currency, order.total_amount) == (
            flow.customer_id, "pending_payment", "JPY", 9900,
        )
        items = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).all()
        assert len(items) == 2
        assert {item.variant_id: (item.supplier_offer_id, item.quantity, item.unit_price) for item in items} == {
            line.variant_id: (line.offer_id, quantity, line.price)
            for line, quantity in zip(flow.lines, quantities, strict=True)
        }


async def test_second_supplier_unavailable_rolls_back_first_reservation(
    cart_checkout, mocked_services, reservation_spy,
):
    flow = cart_checkout
    async with flow.session_factory() as db:
        inventory = (await db.scalars(select(SupplierInventory).where(
            SupplierInventory.offer_id == flow.lines[1].offer_id,
        ))).one()
        inventory.on_hand = 1
        inventory.reserved = 1
        await db.commit()
    response = await checkout(flow, [cart_item(line) for line in flow.lines])
    assert response.status_code == 409, response.text
    assert reservation_spy.await_count == 2
    assert [call.args[1].id for call in reservation_spy.await_args_list] == [
        line.variant_id for line in flow.lines
    ]
    await assert_inventory(flow, (0, 0), supplier_stock=((120, 0), (1, 1)))
    await assert_no_checkout(flow, mocked_services)


@pytest.mark.parametrize("expected_price", [0, 2299, 2301], ids=["zero", "lower", "higher"])
async def test_optional_expected_price_mismatch_rejects_before_any_reservation(
    cart_checkout, mocked_services, reservation_spy, expected_price,
):
    flow = cart_checkout
    # The mismatch is last: even the first valid item must not reserve stock.
    response = await checkout(flow, [
        cart_item(flow.lines[0]),
        cart_item(flow.lines[1], expectedPriceAmount=expected_price),
    ])
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "cart_price_changed"
    reservation_spy.assert_not_awaited()
    await assert_inventory(flow, (0, 0))
    await assert_no_checkout(flow, mocked_services)


async def test_expected_currency_mismatch_rejects_before_any_reservation(
    cart_checkout, mocked_services, reservation_spy,
):
    flow = cart_checkout
    response = await checkout(flow, [
        cart_item(flow.lines[0]), cart_item(flow.lines[1], expectedCurrency="USD"),
    ])
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "cart_price_changed"
    reservation_spy.assert_not_awaited()
    await assert_inventory(flow, (0, 0))
    await assert_no_checkout(flow, mocked_services)


async def test_legacy_items_without_expectations_charge_current_database_price(
    cart_checkout, mocked_services,
):
    flow = cart_checkout
    async with flow.session_factory() as db:
        variant = await db.get(ProductVariant, flow.lines[0].variant_id)
        variant.price_amount = 1875
        await db.commit()
    response = await checkout(flow, [cart_item(flow.lines[0], quantity=2)])
    assert response.status_code == 200, response.text
    mocked_services.create.assert_called_once()
    stripe_line = mocked_services.create.call_args.kwargs["line_items"][0]
    assert (stripe_line["quantity"], stripe_line["price_data"]["unit_amount"]) == (2, 1875)
    async with flow.session_factory() as db:
        order = await db.get(Order, UUID(response.json()["data"]["orderId"]))
        item = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))).one()
        assert (order.total_amount, item.unit_price, item.quantity) == (3750, 1875, 2)
    await assert_inventory(flow, (2, 0))


@pytest.mark.parametrize("quantity", [True, False, "1", 1.5, 100], ids=[
    "true", "false", "string", "fraction", "over-limit",
])
async def test_invalid_quantity_rejected_without_side_effects(
    cart_checkout, mocked_services, reservation_spy, quantity,
):
    flow = cart_checkout
    response = await checkout(flow, [cart_item(flow.lines[0], quantity=quantity)])
    assert response.status_code == 422, response.text
    reservation_spy.assert_not_awaited()
    await assert_inventory(flow, (0, 0))
    await assert_no_checkout(flow, mocked_services)


async def test_quantity_99_accepted_when_variant_and_supplier_stock_suffice(
    cart_checkout, mocked_services,
):
    flow = cart_checkout
    response = await checkout(flow, [cart_item(flow.lines[0], quantity=99)])
    assert response.status_code == 200, response.text
    await assert_inventory(flow, (99, 0))
    mocked_services.create.assert_called_once()
    assert mocked_services.create.call_args.kwargs["line_items"][0]["quantity"] == 99
    async with flow.session_factory() as db:
        order = await db.get(Order, UUID(response.json()["data"]["orderId"]))
        item = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))).one()
        assert (order.total_amount, item.quantity, item.supplier_offer_id) == (
            148500, 99, flow.lines[0].offer_id,
        )


async def test_extra_raw_price_rejected_without_side_effects(
    cart_checkout, mocked_services, reservation_spy,
):
    flow = cart_checkout
    response = await checkout(flow, [cart_item(flow.lines[0], price=1)])
    assert response.status_code == 422, response.text
    reservation_spy.assert_not_awaited()
    await assert_inventory(flow, (0, 0))
    await assert_no_checkout(flow, mocked_services)