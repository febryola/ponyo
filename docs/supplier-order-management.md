# Supplier selection and purchase-order workflow

## Scope and activation

This adds durable supplier purchase orders (POs), per-item routing history, forwarding, confirmations, rejections and bounded retries. It does not pretend a real supplier is connected. Outbound forwarding defaults **off**, and demo suppliers are **never** sent customer data or auto-confirmed.

Apply reviewed migration `20261111_0021` after `20261111_0020` before deploying this API/worker. Tests do not migrate the application database. The legacy populated local database must be reconciled deliberately as described in the backend README; never blindly stamp/upgrade it.

- `SUPPLIER_FORWARDING_ENABLED=false` by default. When true, the API lifespan starts the durable planner/delivery worker; shutdown cancels it cleanly.
- `SUPPLIER_INTEGRATIONS={}` by default. Backend-only JSON mapping **Supplier.code** to a trusted HTTPS `url`, secret `token`, and `idempotent: "true"`. Use Secrets Manager/server secrets for real tokens. No endpoint accepts URLs/tokens from request bodies. The mapping is hidden from the Settings representation.
- `SUPPLIER_MAX_ATTEMPTS=5`, validated 1–10.
- `SUPPLIER_RETRY_BASE_SECONDS=60`, validated 10–3600. Exponential backoff caps at one hour.
- `SUPPLIER_CONFIRMATION_TIMEOUT_SECONDS=86400`, validated 300–604800.

Only configure `idempotent: "true"` after the supplier contract guarantees that replays of a stable PO key **never create another supplier order**, including after worker crashes and later retries. The guarantee must last for the lifetime of the PO, not only a short cache window. Without supplier-side deduplication, exactly-once external delivery is impossible; use manual review instead.

## Selection, mapping and order splitting

Checkout chooses an active offer for the exact variant, active supplier, matching source currency, minimum order quantity satisfied and sufficient unreserved inventory. Rank: shortest lead time, then lowest cost, then offer ID for deterministic ties. Atomic supplier reservation guards stock; payment capture settles that reservation exactly once.

After an order is `paid` + `processing`, the enabled worker discovers it from the database, independent of SQS timing, and plans POs. Admins may also explicitly plan while forwarding is off. Planning locks the parent order, reuses the already-settled source offer and groups all eligible order items by supplier. One group becomes one PO with a unique number, stable provider idempotency key, supplier-cost currency, total cost, immutable shipping-address snapshot, supplier SKU/unit-cost/quantity/product-name snapshots and explicit order-item mapping.

PO generation does **not** debit the primary supplier a second time. Original `OrderItem.supplier_offer_id` remains the checkout snapshot; every later assignment is retained in `SupplierPurchaseOrderItem` with a monotonically increasing route attempt. Unique `(order_item_id, route_attempt)`, unique `(order_id, supplier_id, generation)` and unique PO keys/numbers back up the parent-order lock against duplicates. Production requires PostgreSQL for row-lock concurrency guarantees.

The planner never repeats an assignment for an item whose latest PO is pending, dispatching, submitted, unknown, manual-review or confirmed. New rounds are possible only for explicitly rejected items. Unlinked legacy items may choose a new offer after payment; otherwise they enter a visible routing hold rather than inventing a supplier.

## Forwarding contract

The worker persists an atomic 60-second lease and attempt counter **before** the HTTP request. A crashed worker's expired lease can be reclaimed using the exact same PO ID, key and request body. No database locks are held during network I/O. Up to 25 candidates are scanned per cycle.

Transport sends HTTPS `POST`, `Content-Type: application/json`, a backend-only bearer token, and `Idempotency-Key`. Redirects are rejected so tokens/addresses cannot be forwarded to another host. Request timeout is 10 seconds; response size is capped at 64 KiB. Provider response bodies, credentials and addresses are never logged. Only exception type/safe error codes are stored.

Immutable JSON payload:

- `id`, `purchaseOrderNumber`, `orderId`, `supplierId`, `generation`
- `idempotencyKey`, `currency`, `totalCost`, `shippingAddress`
- `items`: PO item ID, order item ID, exact variant ID, supplier SKU, product name, quantity, unit cost, route attempt

Mutable status, attempt counters and timestamps are deliberately excluded: providers may compare request bodies on idempotency replay.

Response must echo `idempotencyKey` and return `status`:

- `accepted`: requires `supplierOrderId`; receipt becomes `submitted`, awaiting final confirmation.
- `confirmed`: requires `supplierOrderId`; final acceptance, applied idempotently.
- `rejected`: explicit final rejection, optional reason. Use exact reason `inventory_unavailable` to mark the failed offer's remaining unreserved inventory unavailable.

A timeout, HTTP error (including 4xx), malformed JSON, mismatched key, missing reference or connection failure is **ambiguous**, not an explicit supplier rejection. The PO becomes `unknown` and retries with the same stable identity/backoff. At budget exhaustion it becomes `manual_review`; it does not reroute to another supplier. This avoids two suppliers shipping the same customer line.

An accepted PO that misses the confirmation deadline also enters manual review without being resent/rerouted. Silence never proves non-acceptance. If payment/order status changes during delivery (for example refund), the provider reference is preserved and the PO enters review rather than silently proceeding.

## Confirmation and role isolation

All supplier APIs require a verified account with database role `supplier` or `admin`. Supplier identity comes from **SupplierAccount**, not email matching, body IDs or self-selected claims. Admins bind an already-verified supplier-role account explicitly; public registration cannot assign supplier/admin roles.

- `GET /v1/supplier-orders?limit=50&offset=0`: own supplier POs (admin sees all), capped at 100. Does not expose delivery addresses in list responses.
- `GET /v1/supplier-orders/{po_id}`: assigned supplier/admin only; includes delivery snapshot and immutable forwarding payload.
- `POST /v1/supplier-orders/suppliers/{supplier_id}/accounts`: admin + CSRF, `{ "customerId": "UUID" }`. Refuses accounts already bound elsewhere; does not mutate account role.
- `POST /v1/supplier-orders/orders/{order_id}/plan`: admin + CSRF. Idempotently plans a paid processing order. Re-running can route rejected/unassigned items when stock becomes available, not create duplicate active POs.
- `POST /v1/supplier-orders/{po_id}/confirmation`: assigned supplier/admin + CSRF, body `{ "eventId": "UUID", "decision": "confirmed", "supplierOrderId": "EXT-123", "reason": null }`, or decision `rejected`.
- `POST /v1/supplier-orders/{po_id}/retry`: admin + CSRF. Retries an eligible existing PO with its original key, without resetting/exceeding the attempt budget. Exhausted operations require manual reconciliation.

Supplier confirmations have unique `(supplier_id, event_id)` keys. Replaying the same event/data is a no-op; reusing the key for another PO/decision/reference conflicts. A confirmed PO cannot later be rejected or rerouted. The confirmed reference must match any earlier accepted supplier reference. Confirmations are whole-PO decisions; partial acceptance is intentionally not claimed. Adapters must reject a whole PO if they cannot fulfill all its lines, or a separately reviewed partial-line contract must be added.

No unauthenticated supplier confirmation webhook is introduced. Async suppliers use their authenticated scoped account API; immediate integration responses can confirm/reject in the forwarding call. Real supplier-specific authentication/signature formats need a reviewed adapter, not an open callback.

## Rejection, alternative supply and retries

Only an **explicit rejection** permits alternative routing. The old PO remains rejected for audit; a replacement PO gets a new immutable assignment/generation/key. Exclude every supplier previously attempted for that order item. Never substitute another product variant or convert supplier cost currencies implicitly.

Replacement inventory is atomically debited from `on_hand` only when `on_hand - reserved >= quantity`. Existing customer checkout stock is not decremented again. Do not silently restore rejected stock: an unavailable supplier's claimed stock is untrustworthy. For `inventory_unavailable`, only its unreserved inventory is zeroed (`on_hand = reserved`) so other paid/pending reservations retain their accounting protections; synced catalog projections refresh normally.

An alternative must meet MOQ, activity, currency and quantity rules and must not cost more per unit than the first PO allocation. Legacy unlinked routing is capped at the saved source retail unit price. Higher-cost alternatives require merchant intervention, not an automatic margin loss. No valid alternative means order fulfillment `on_hold`, bounded scheduled retries, and `supplier.routing_required` outbox alerts. Fresh inventory can enable a later retry; refund/cancel is never invented as a supplier resolution.

All latest assignments confirmed → `fulfillment_status=supplier_confirmed`. Otherwise active work stays `queued`; unresolved/review cases use `on_hold`. Customer order remains `processing`; shipment/tracking still uses the existing protected merchant fulfillment API. This implementation does not claim supplier shipment tracking or automatic returns/cancellation of already accepted external orders.

## Reliability/deployment notes

The database planner is the source of truth for POs. Existing payment/SQS outbox events remain available for notifications; do not run a second independent SQS consumer that creates supplier orders outside this PO/idempotency mechanism. Audit events include confirmations/rejections and routing-required alerts. Retry workers recover from restarts via persisted state, not in-memory queues.

A supplier can receive only its PO items/costs and the delivery address necessary for those items, not the other suppliers' order lines or purchase prices. Integration endpoint/token provisioning, supplier onboarding, confirmation SLA, shipping support, real feed accuracy, staging PostgreSQL concurrency and privacy/data-sharing agreements remain merchant deployment prerequisites.

Tests use disposable SQLite and fake HTTP/provider transports only. They cover split/group/idempotent planning, exact resend payload/key, active lease/crash recovery, confirmation replay, rejection/alternate quantity accounting, unavailable/replenished supply, higher-cost rejection, MOQ, disabled/demo safeguards, supplier isolation/CSRF/admin mapping, timeout/manual-review behavior, HTTPS/no-redirect transport contracts, secret masking and migration round-trips. No real supplier purchase has been placed.
