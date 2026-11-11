"""Trusted, manually supplied snapshots; not a supplier feed connector.

Run from the backend directory with ``python -m app.stock_sync JSONfilepath``.
Success prints only updated/stale counts. Failure exits nonzero without printing
input, database errors, credentials, or supplier identifiers. The caller of
``sync_supplier_stock`` owns the outer transaction; a savepoint makes even a
caught batch error all-or-nothing. Migration 0017 must already be deployed.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, TypedDict
from uuid import UUID

from fastapi import HTTPException
from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, RootModel, ValidationInfo,
    field_validator, model_validator,
)
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal, engine
from app.models import ProductVariant, Supplier, SupplierInventory, SupplierOffer


def _utc(value: datetime) -> datetime:
    # SQLite strips timezone information on persisted DateTime values; those
    # values were stored as UTC. Input validation never accepts naive timestamps.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class StockSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offerId: UUID
    onHand: Annotated[int, Field(strict=True, ge=0)]
    observedAt: AwareDatetime
    source: Annotated[str, Field(strict=True, min_length=1, max_length=120)] | None = None

    @field_validator("observedAt", mode="before")
    @classmethod
    def timestamp_format(cls, value: object) -> object:
        if not isinstance(value, (str, datetime)):
            raise ValueError("observedAt must be a timezone-aware datetime")
        return value

    @field_validator("observedAt")
    @classmethod
    def timestamp_not_future(cls, value: datetime, info: ValidationInfo) -> datetime:
        now = (info.context or {}).get("now", datetime.now(timezone.utc))
        if value > _utc(now) + timedelta(minutes=5):
            raise ValueError("observedAt is more than five minutes in the future")
        return value.astimezone(timezone.utc)


class StockSnapshotBatch(RootModel[Annotated[list[StockSnapshot], Field(min_length=1, max_length=1000)]]):
    @model_validator(mode="after")
    def unique_offers(self) -> StockSnapshotBatch:
        if len({snapshot.offerId for snapshot in self.root}) != len(self.root):
            raise ValueError("Each offerId may appear only once")
        return self


class StockSyncCounts(TypedDict):
    updated: int
    stale: int


def _conflict() -> HTTPException:
    return HTTPException(409, detail={
        "code": "stock_sync_conflict",
        "message": "Physical stock cannot be below existing reservations.",
    })


async def sync_supplier_stock(
    db: AsyncSession,
    snapshots: list[StockSnapshot],
    now: datetime | None = None,
) -> StockSyncCounts:
    """Validate first, preserve holds, apply only newer observations, project MAX.

    Raises ValidationError for malformed batches, HTTPException(404) with code
    stock_sync_unknown_offer for missing offers/inventory, or HTTPException(409)
    with code stock_sync_conflict. No commit, reservation release, or I/O feed.
    """
    now = now or datetime.now(timezone.utc)
    if now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    now = now.astimezone(timezone.utc)
    # Revalidate models as dictionaries too: model_construct/mutation cannot
    # bypass whole-batch validation at this internal trust boundary.
    batch = StockSnapshotBatch.model_validate([
        snapshot.model_dump() if isinstance(snapshot, StockSnapshot) else snapshot
        for snapshot in snapshots
    ], context={"now": now}).root
    offer_ids = sorted((snapshot.offerId for snapshot in batch), key=str)
    counts: StockSyncCounts = {"updated": 0, "stale": 0}

    async with db.begin_nested():
        links = (await db.execute(
            select(SupplierOffer.id, SupplierOffer.variant_id)
            .where(SupplierOffer.id.in_(offer_ids))
        )).all()
        if len(links) != len(offer_ids):
            raise HTTPException(404, detail={"code": "stock_sync_unknown_offer"})
        variant_ids = sorted({variant_id for _, variant_id in links}, key=str)
        # Checkout takes these locks first, in UUID order, before offer/inventory.
        variants = (await db.scalars(
            select(ProductVariant).where(ProductVariant.id.in_(variant_ids))
            .order_by(ProductVariant.id).with_for_update()
            .execution_options(populate_existing=True)
        )).all()
        rows = (await db.execute(
            select(SupplierOffer, SupplierInventory)
            .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
            .where(SupplierOffer.id.in_(offer_ids))
            .order_by(SupplierOffer.id).with_for_update()
            .execution_options(populate_existing=True)
        )).all()
        inventories = {offer.id: inventory for offer, inventory in rows}
        if len(inventories) != len(offer_ids) or len(variants) != len(variant_ids):
            raise HTTPException(404, detail={"code": "stock_sync_unknown_offer"})
        # Detect missing/reparented offers between discovery and acquiring locks.
        expected_links = dict(links)
        if any(offer.variant_id != expected_links[offer.id] for offer, _ in rows):
            raise HTTPException(409, detail={"code": "stock_sync_offer_changed"})

        pending = []
        for snapshot in sorted(batch, key=lambda item: str(item.offerId)):
            inventory = inventories[snapshot.offerId]
            if inventory.last_synced_at is not None and snapshot.observedAt <= _utc(inventory.last_synced_at):
                counts["stale"] += 1
                continue
            if snapshot.onHand < inventory.reserved:
                raise _conflict()
            pending.append(snapshot)

        changed_variants = set()
        for snapshot in pending:
            inventory = inventories[snapshot.offerId]
            result = await db.execute(
                update(SupplierInventory).where(
                    SupplierInventory.id == inventory.id,
                    SupplierInventory.reserved <= snapshot.onHand,
                    or_(SupplierInventory.last_synced_at.is_(None),
                        SupplierInventory.last_synced_at < snapshot.observedAt),
                ).values(on_hand=snapshot.onHand, last_synced_at=snapshot.observedAt, updated_at=now)
                .execution_options(synchronize_session=False)
            )
            await db.refresh(inventory)
            if result.rowcount != 1:
                if inventory.last_synced_at is not None and snapshot.observedAt <= _utc(inventory.last_synced_at):
                    counts["stale"] += 1
                    continue
                raise _conflict()
            counts["updated"] += 1
            changed_variants.add(expected_links[snapshot.offerId])

        if changed_variants:
            projected = dict((await db.execute(
                select(SupplierOffer.variant_id, func.max(SupplierInventory.on_hand - SupplierInventory.reserved))
                .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
                .join(Supplier, Supplier.id == SupplierOffer.supplier_id)
                .join(ProductVariant, ProductVariant.id == SupplierOffer.variant_id)
                .where(SupplierOffer.variant_id.in_(changed_variants), SupplierOffer.active.is_(True),
                       Supplier.active.is_(True), SupplierOffer.currency == ProductVariant.currency)
                .group_by(SupplierOffer.variant_id)
            )).all())
            for variant in variants:
                if variant.id in changed_variants:
                    variant.stock_quantity = max(0, projected.get(variant.id, 0))
            await db.flush()
    return counts


async def _sync_file(path: str) -> StockSyncCounts:
    try:
        batch = StockSnapshotBatch.model_validate_json(Path(path).read_bytes())
        async with SessionLocal() as db:
            async with db.begin():
                counts = await sync_supplier_stock(db, batch.root)
        return counts
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        return 2
    try:
        counts = asyncio.run(_sync_file(args[0]))
    except Exception:
        # No traceback or validation input: operators must not leak supplier
        # source metadata, file contents, or database credentials into logs.
        return 1
    print(json.dumps(counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())