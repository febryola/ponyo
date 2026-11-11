"""Trusted snapshot ingestion on isolated SQLite; no migrations or feed I/O."""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import stock_sync
from app.catalog_stock import available_quantities
from app.db import Base
from app.models import Product, ProductVariant, Supplier, SupplierInventory, SupplierOffer
from app.stock_sync import StockSnapshot, StockSnapshotBatch, sync_supplier_stock


NOW = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)
OBSERVED = NOW - timedelta(minutes=1)


@pytest.fixture
async def stock_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    try:
        yield factory
    finally:
        await engine.dispose()


async def add_offer(factory, *, variant_id=None, on_hand=10, reserved=2,
                    active=True, supplier_active=True, currency="JPY", inventory=True):
    async with factory() as db:
        if variant_id is None:
            product = Product(
                slug=uuid4().hex, name="Test", description="Test", currency="JPY",
                price_amount=100, availability="available", category_name="Toys",
                supplier_name="Ponyo", image_url="/images/test.png", published=True,
            )
            db.add(product)
            await db.flush()
            variant = ProductVariant(product_id=product.id, currency="JPY", price_amount=100,
                                     stock_quantity=3, active=True)
            db.add(variant)
            await db.flush()
            variant_id = variant.id
        supplier = Supplier(code=uuid4().hex, name="Private supplier", active=supplier_active)
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(supplier_id=supplier.id, variant_id=variant_id, supplier_sku=uuid4().hex,
                              cost_amount=50, currency=currency, active=active)
        db.add(offer)
        await db.flush()
        if inventory:
            db.add(SupplierInventory(offer_id=offer.id, on_hand=on_hand, reserved=reserved,
                                     updated_at=NOW - timedelta(days=1)))
        await db.commit()
        return SimpleNamespace(offer_id=offer.id, variant_id=variant_id)


def payload(offer_id=None, **overrides):
    return {"offerId": str(offer_id or uuid4()), "onHand": 9,
            "observedAt": OBSERVED.isoformat(), **overrides}


def snapshot(offer_id, **overrides):
    return StockSnapshot.model_validate(payload(offer_id, **overrides), context={"now": NOW})


async def read_stock(factory, flow):
    async with factory() as db:
        inventory = (await db.scalars(select(SupplierInventory).where(
            SupplierInventory.offer_id == flow.offer_id,
        ))).one()
        variant = await db.get(ProductVariant, flow.variant_id)
        available = await available_quantities(db, [variant])
        return inventory, variant.stock_quantity, available[variant.id]


@pytest.mark.asyncio
async def test_valid_sync_preserves_holds_and_uses_observation_not_updated_at(stock_db):
    flow = await add_offer(stock_db)
    async with stock_db() as db:
        inventory = (await db.scalars(select(SupplierInventory))).one()
        inventory.updated_at = NOW + timedelta(days=1)  # Reservation timestamps are not freshness.
        await db.commit()
        result = await sync_supplier_stock(db, [snapshot(flow.offer_id, onHand=12, source="manual")], now=NOW)
        assert result == {"updated": 1, "stale": 0}
        await db.commit()
    inventory, projected, available = await read_stock(stock_db, flow)
    assert (inventory.on_hand, inventory.reserved, projected, available) == (12, 2, 10, 10)
    assert inventory.last_synced_at.replace(tzinfo=timezone.utc) == OBSERVED
    assert inventory.updated_at.replace(tzinfo=timezone.utc) == NOW


@pytest.mark.asyncio
async def test_outdated_and_identical_snapshots_are_noops_even_below_holds(stock_db):
    flow = await add_offer(stock_db)
    async with stock_db() as db:
        await sync_supplier_stock(db, [snapshot(flow.offer_id)], now=NOW)
        await db.commit()
        for observed in (OBSERVED, OBSERVED - timedelta(seconds=1)):
            assert await sync_supplier_stock(db, [snapshot(
                flow.offer_id, onHand=0, observedAt=observed.isoformat(),
            )], now=NOW + timedelta(minutes=1)) == {"updated": 0, "stale": 1}
            await db.commit()
    inventory, projected, _ = await read_stock(stock_db, flow)
    assert (inventory.on_hand, inventory.reserved, projected) == (9, 2, 7)
    assert inventory.updated_at.replace(tzinfo=timezone.utc) == NOW


@pytest.mark.parametrize("changes", [
    {"observedAt": "2026-11-11T12:00:00"}, {"observedAt": None},
    {"observedAt": (NOW + timedelta(minutes=5, microseconds=1)).isoformat()},
    {"observedAt": 1794398400}, {"onHand": -1}, {"onHand": True},
    {"onHand": "3"}, {"onHand": 3.0}, {"unexpected": "private"},
    {"offerId": "not-a-uuid"}, {"source": "x" * 121}, {"source": ""}, {"source": 123},
])
def test_snapshot_rejects_invalid_input(changes):
    with pytest.raises(ValidationError):
        StockSnapshot.model_validate(payload(**changes), context={"now": NOW})


@pytest.mark.parametrize("field", ["offerId", "onHand", "observedAt"])
def test_snapshot_requires_fields(field):
    data = payload()
    del data[field]
    with pytest.raises(ValidationError):
        StockSnapshot.model_validate(data, context={"now": NOW})


def test_batch_bounds_unique_ids_and_timezone_normalization():
    for data in ([], [payload()] * 1001, [payload(UUID(int=1)), payload(UUID(int=1))], {"snapshots": [payload()]}):
        with pytest.raises(ValidationError):
            StockSnapshotBatch.model_validate(data, context={"now": NOW})
    batch = StockSnapshotBatch.model_validate([
        payload(UUID(int=i + 1)) for i in range(1000)
    ], context={"now": NOW})
    assert len(batch.root) == 1000
    valid = snapshot(uuid4(), observedAt="2026-11-11T21:05:00+09:00")
    assert valid.observedAt == NOW + timedelta(minutes=5)


@pytest.mark.asyncio
async def test_entire_input_validated_before_database_access(stock_db, monkeypatch):
    async with stock_db() as db:
        execute = AsyncMock(side_effect=AssertionError("must not access DB"))
        monkeypatch.setattr(db, "execute", execute)
        valid = snapshot(uuid4())
        invalid = StockSnapshot.model_construct(offerId=uuid4(), onHand=True, observedAt=OBSERVED)
        with pytest.raises(ValidationError):
            await sync_supplier_stock(db, [valid, invalid], now=NOW)
        with pytest.raises(ValidationError):
            await sync_supplier_stock(db, [valid, valid], now=NOW)
        execute.assert_not_called()


@pytest.mark.asyncio
async def test_too_low_fails_batch_and_never_releases_holds(stock_db):
    first = await add_offer(stock_db)
    second = await add_offer(stock_db, reserved=5)
    async with stock_db() as db:
        with pytest.raises(HTTPException) as error:
            await sync_supplier_stock(db, [snapshot(first.offer_id, onHand=30),
                                           snapshot(second.offer_id, onHand=4)], now=NOW)
        assert error.value.status_code == 409
        assert error.value.detail["code"] == "stock_sync_conflict"
        await db.commit()  # Catching the error cannot accidentally commit a partial batch.
    for flow, reserved in ((first, 2), (second, 5)):
        inventory, projected, _ = await read_stock(stock_db, flow)
        assert (inventory.on_hand, inventory.reserved, projected, inventory.last_synced_at) == (10, reserved, 3, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("missing_inventory", [False, True])
async def test_unknown_offer_or_missing_inventory_fails_all(stock_db, missing_inventory):
    first = await add_offer(stock_db)
    bad_id = (await add_offer(stock_db, inventory=False)).offer_id if missing_inventory else uuid4()
    async with stock_db() as db:
        with pytest.raises(HTTPException) as error:
            await sync_supplier_stock(db, [snapshot(first.offer_id, onHand=30), snapshot(bad_id)], now=NOW)
        assert error.value.status_code == 404
        assert error.value.detail["code"] == "stock_sync_unknown_offer"
        await db.commit()
    inventory, projected, _ = await read_stock(stock_db, first)
    assert (inventory.on_hand, projected, inventory.last_synced_at) == (10, 3, None)


@pytest.mark.asyncio
async def test_newer_zero_snapshot_makes_public_quantity_zero(stock_db):
    flow = await add_offer(stock_db, reserved=0)
    async with stock_db() as db:
        await sync_supplier_stock(db, [snapshot(flow.offer_id)], now=NOW)
        await db.commit()
        assert await sync_supplier_stock(db, [snapshot(
            flow.offer_id, onHand=0, observedAt=NOW.isoformat(),
        )], now=NOW) == {"updated": 1, "stale": 0}
        await db.commit()
    inventory, projected, available = await read_stock(stock_db, flow)
    assert (inventory.on_hand, inventory.reserved, projected, available) == (0, 0, 0, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize("options", [
    {"active": False}, {"supplier_active": False}, {"currency": "USD"},
])
async def test_inactive_or_currency_mismatch_is_synced_but_excluded(stock_db, options):
    flow = await add_offer(stock_db, **options)
    async with stock_db() as db:
        assert await sync_supplier_stock(db, [snapshot(flow.offer_id, onHand=40)], now=NOW) == {"updated": 1, "stale": 0}
        await db.commit()
    inventory, projected, available = await read_stock(stock_db, flow)
    assert (inventory.on_hand, inventory.reserved, projected, available) == (40, 2, 0, 0)


@pytest.mark.asyncio
async def test_projection_uses_max_of_all_eligible_offers_not_sum(stock_db):
    first = await add_offer(stock_db, on_hand=8, reserved=2)
    second = await add_offer(stock_db, variant_id=first.variant_id, on_hand=15, reserved=3)
    await add_offer(stock_db, variant_id=first.variant_id, on_hand=100, active=False)
    await add_offer(stock_db, variant_id=first.variant_id, on_hand=100, supplier_active=False)
    await add_offer(stock_db, variant_id=first.variant_id, on_hand=100, currency="USD")
    async with stock_db() as db:
        await sync_supplier_stock(db, [snapshot(first.offer_id, onHand=4)], now=NOW)
        await db.commit()
    _, projected, available = await read_stock(stock_db, first)
    assert projected == available == 12  # Other eligible offer, not 2 + 12.
    inventory, _, _ = await read_stock(stock_db, second)
    assert (inventory.on_hand, inventory.reserved, inventory.last_synced_at) == (15, 3, None)


@pytest.mark.asyncio
async def test_mixed_batch_counts_and_latest_reservations_determine_availability(stock_db):
    first = await add_offer(stock_db)
    second = await add_offer(stock_db)
    async with stock_db() as db:
        await sync_supplier_stock(db, [snapshot(first.offer_id)], now=NOW)
        await db.commit()
        # Checkout changed reserved since the supplier observation was taken.
        await db.execute(update(SupplierInventory).where(
            SupplierInventory.offer_id == second.offer_id,
        ).values(reserved=7))
        await db.commit()
        result = await sync_supplier_stock(db, [snapshot(first.offer_id),
                                               snapshot(second.offer_id, onHand=8)], now=NOW)
        assert result == {"updated": 1, "stale": 1}
        await db.commit()
    inventory, projected, available = await read_stock(stock_db, second)
    assert (inventory.on_hand, inventory.reserved, projected, available) == (8, 7, 1, 1)


@pytest.mark.asyncio
async def test_conditional_update_checks_reservations_changed_after_read_and_rolls_back(stock_db, monkeypatch):
    flows = [await add_offer(stock_db), await add_offer(stock_db)]
    flows.sort(key=lambda flow: str(flow.offer_id))
    async with stock_db() as db:
        execute = db.execute
        writes = 0

        async def racing_execute(statement, *args, **kwargs):
            nonlocal writes
            if getattr(statement, "is_update", False) and statement.table.name == "supplier_inventory":
                writes += 1
                if writes == 2:
                    # Simulate a writer bypassing the variant mutex; atomic SQL
                    # must still protect reservations after the preflight check.
                    await execute(update(SupplierInventory).where(
                        SupplierInventory.offer_id == flows[1].offer_id,
                    ).values(reserved=8))
            return await execute(statement, *args, **kwargs)

        monkeypatch.setattr(db, "execute", racing_execute)
        with pytest.raises(HTTPException) as error:
            await sync_supplier_stock(db, [snapshot(flow.offer_id, onHand=5) for flow in flows], now=NOW)
        assert error.value.status_code == 409
        await db.commit()
    assert writes == 2
    for flow in flows:
        inventory, projected, _ = await read_stock(stock_db, flow)
        assert (inventory.on_hand, inventory.reserved, projected, inventory.last_synced_at) == (10, 2, 3, None)


@pytest.mark.asyncio
async def test_atomic_freshness_guard_skips_newer_observation_without_overwrite(stock_db, monkeypatch):
    flow = await add_offer(stock_db)
    async with stock_db() as db:
        execute = db.execute
        injected = False

        async def racing_execute(statement, *args, **kwargs):
            nonlocal injected
            if getattr(statement, "is_update", False) and statement.table.name == "supplier_inventory" and not injected:
                injected = True
                await execute(update(SupplierInventory).where(
                    SupplierInventory.offer_id == flow.offer_id,
                ).values(on_hand=20, last_synced_at=NOW))
            return await execute(statement, *args, **kwargs)

        monkeypatch.setattr(db, "execute", racing_execute)
        assert await sync_supplier_stock(db, [snapshot(flow.offer_id)], now=NOW) == {"updated": 0, "stale": 1}
        await db.commit()
    inventory, projected, _ = await read_stock(stock_db, flow)
    assert (inventory.on_hand, inventory.reserved, projected) == (20, 2, 3)


@pytest.mark.asyncio
async def test_lock_order_is_sorted_variants_before_offer_inventory(stock_db, monkeypatch):
    flows = [await add_offer(stock_db), await add_offer(stock_db)]
    statements = []
    async with stock_db() as db:
        execute = db.execute

        async def capture_execute(statement, *args, **kwargs):
            statements.append(str(statement.compile(dialect=postgresql.dialect())))
            return await execute(statement, *args, **kwargs)

        # AsyncSession.scalars delegates to execute: capture only the latter
        # to avoid counting the same variant lock twice.
        monkeypatch.setattr(db, "execute", capture_execute)
        await sync_supplier_stock(db, [snapshot(flow.offer_id) for flow in reversed(flows)], now=NOW)
    locks = [sql for sql in statements if "FOR UPDATE" in sql]
    assert len(locks) == 2
    assert "ORDER BY product_variants.id FOR UPDATE" in locks[0]
    assert "ORDER BY supplier_offers.id FOR UPDATE" in locks[1]


@pytest.mark.asyncio
async def test_cli_file_commits_success_and_rolls_back_failure(stock_db, tmp_path, monkeypatch):
    flow = await add_offer(stock_db)
    monkeypatch.setattr(stock_sync, "SessionLocal", stock_db)
    dispose = AsyncMock()
    monkeypatch.setattr(stock_sync, "engine", SimpleNamespace(dispose=dispose))
    path = tmp_path / "snapshot.json"
    observed = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps([payload(flow.offer_id, observedAt=observed)]), encoding="utf-8")
    assert await stock_sync._sync_file(str(path)) == {"updated": 1, "stale": 0}
    inventory, _, _ = await read_stock(stock_db, flow)
    assert inventory.on_hand == 9
    path.write_text(json.dumps([
        payload(flow.offer_id, onHand=30, observedAt=datetime.now(timezone.utc).isoformat()),
        payload(uuid4(), observedAt=observed),
    ]), encoding="utf-8")
    with pytest.raises(HTTPException):
        await stock_sync._sync_file(str(path))
    inventory, _, _ = await read_stock(stock_db, flow)
    assert inventory.on_hand == 9
    assert dispose.await_count == 2


@pytest.mark.asyncio
async def test_cli_invalid_file_never_opens_session(tmp_path, monkeypatch):
    factory = AsyncMock(side_effect=AssertionError("must not open session"))
    monkeypatch.setattr(stock_sync, "SessionLocal", factory)
    monkeypatch.setattr(stock_sync, "engine", SimpleNamespace(dispose=AsyncMock()))
    path = tmp_path / "invalid.json"
    for contents in ("not JSON", json.dumps([payload(onHand=True)]), json.dumps([])):
        path.write_text(contents, encoding="utf-8")
        with pytest.raises(ValidationError):
            await stock_sync._sync_file(str(path))
    factory.assert_not_called()


def test_cli_prints_only_counts_and_never_error_contents(monkeypatch, capsys):
    monkeypatch.setattr(stock_sync, "_sync_file", AsyncMock(return_value={"updated": 3, "stale": 2}))
    assert stock_sync.main(["private-path.json"]) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"updated": 3, "stale": 2}
    assert captured.err == ""
    monkeypatch.setattr(stock_sync, "_sync_file", AsyncMock(side_effect=RuntimeError("secret credentials")))
    assert stock_sync.main(["private-path.json"]) == 1
    assert stock_sync.main([]) == 2
    captured = capsys.readouterr()
    assert captured.out == captured.err == ""