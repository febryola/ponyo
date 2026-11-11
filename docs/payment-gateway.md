# Stripe payment gateway

## Gateway and credentials

Stripe Hosted Checkout is the selected gateway. Card data, 3DS and bank authorization remain on Stripe; Ponyo never collects card numbers, CVV or payment method secrets. Apple Pay availability is determined by Stripe/device/account support through card Checkout, not an unconditional promise in the storefront.

Configure **backend-only** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Use sandbox/test values while testing. Never place secrets in `NEXT_PUBLIC_*`, commit them, paste them into chat/logs or expose them through API responses. The example environment file contains placeholders only. Existing Terraform injects secret ARNs through Secrets Manager; it does not create account credentials or register a Stripe webhook automatically.

`STRIPE_CAPTURE_METHOD=automatic` is the safe default: Stripe authorizes and captures during hosted payment. `manual` authorizes eligible card payments first and requires admin capture before Stripe's authorization deadline. No fixed seven-day expiry is assumed: card/account rules differ. Subscribe to intent cancellation events and monitor unfulfilled authorized orders. Switching the setting affects new orders only; each order snapshots its strategy.

Admin-only `GET /v1/payments/configuration` reports presence booleans and capture method, never keys. Presence is **not** proof the credentials work; verify with a real Stripe sandbox E2E before release. Missing keys return 503 for provider operations.

## APIs

All money uses backend currency minor units. Positive-total captures must exactly match saved order totals; partial capture is intentionally not exposed without an order-repricing/fulfillment policy.

- Initiation: existing verified-customer `POST /v1/checkout/sessions`, now setting `payment_intent_data.capture_method` and trusted order metadata, with a durable initiation ledger row. The browser redirects to Stripe; its success URL never marks an order paid.
- `GET /v1/payments/orders/{order_id}`: owner/admin payment state and transaction records. Supplier/other customers cannot access it.
- `POST /v1/payments/orders/{order_id}/sync`: owner/admin + CSRF, rate limited. Retrieves the current Checkout Session, expanded PaymentIntent and all refunds (bounded at 1000 for interactive use), validates identities/metadata/amount/currency and reconciles local state.
- `POST /v1/payments/orders/{order_id}/capture`: admin + CSRF, body `{ "idempotencyKey": "UUID" }`. Full capture only, and only pending authorized orders.
- `POST /v1/payments/orders/{order_id}/void`: admin + CSRF, body `{ "idempotencyKey": "UUID" }`. Cancels a still-uncaptured authorization at Stripe. Inventory releases only after validated provider cancellation.
- `POST /v1/payments/orders/{order_id}/refunds`: admin + CSRF, body `{ "idempotencyKey": "UUID", "amount": 500, "reason": "requested_by_customer" }`. Reasons: `duplicate`, `fraudulent`, `requested_by_customer`. Supports partial/full refunds up to captured less already-successful/pending/unknown refunds.

Customers get a **Refresh payment status** control in order history. Capture/refund remain protected backend operations; no customer-facing money movement or public role assignment is introduced.

## Durable transaction semantics

`payment_transactions` stores provider, order, kind, status, amount/currency, provider reference, safe failure code, operation key and timestamps. Do not store raw provider objects/card details. Capture requests and refund requests are saved **before** calling Stripe, with unique durable idempotency keys. Network/5xx failures become `unknown` and continue reserving the refundable amount. Retry only with the exact original key and parameters, or reconcile via webhook/sync. Different parameters with the same key return 409.

Unresolved operations older than 23 hours refuse automatic retries because Stripe can prune idempotency keys after 24 hours. An operator must reconcile them rather than risk recreating a charge/refund. Unknown operations without returned provider IDs can require Dashboard investigation; no missing refund is assumed failed merely because one API list does not contain it.

Refund status `pending`/`requires_action` is not counted as refunded. Only `succeeded` advances `refundedAmount`; failed/cancelled refunds release their reservation. Partial refunds set `partially_refunded`; full refunds set `refunded`. Refunds do **not** automatically return physical stock or undo fulfillment. Returns need a separate merchant-controlled goods-return workflow.

## Signature-verified webhooks

Endpoint: `POST /v1/webhooks/stripe`, using Stripe **snapshot** events and the raw body with Stripe-Signature verification. Required subscriptions:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`
- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `payment_intent.processing`
- `refund.created`
- `refund.updated`
- `refund.failed`

Intent/refund events retrieve current provider objects before taking order/inventory locks, so stale failure/pending events do not regress a successful capture. Event IDs are claimed transactionally with the state/stock/ledger changes; a failed commit rolls all of them back so Stripe can retry. Duplicate events do not settle stock twice. Provider outages return retryable errors rather than acknowledging unverified payment state.

Authorization sets `authorized` but does not fulfill/consume reserved supplier stock. Exact captured success sets `paid`, order `processing`, fulfillment `queued`, settles supplier reservations once and emits the existing outbox success event. A declined attempt is recorded with a safe error code but remains retryable until terminal expiry/cancellation. Zero-total orders require provider `no_payment_required` and saved total zero. A late capture after stock was returned does not fulfill; it creates a `payment_review` alert for support/refund reconciliation.

External refund dashboard actions are synchronized through refund webhooks or explicit sync. No unverified frontend status is accepted. Fulfillment status cannot turn an unpaid/authorized order into paid.

## Deployment and validation

Migration `20261111_0020` follows checkout migration `20261111_0019`; apply through the reviewed normal migration process **before** deploying this code. Existing paid orders backfill captured totals, but historic PaymentIntent IDs require provider sync before refunding. No online migration, Stripe account change, real payment or refund is performed by tests.

Tests use disposable databases and mocked provider responses: authorization/capture replay, refund limits/pending/failures/timeouts, ownership/admin/CSRF checks, identity/amount/currency validation, current-state out-of-order events, webhook duplicates, transaction persistence and migration upgrade/downgrade. SQLite tests do not certify Postgres row-lock concurrency; verify concurrent money operations and online migrations on staging.

Sandbox E2E still required: use actual configured test credentials, forward/register the signed webhook, pay with Stripe's documented test cards and 3DS flows, verify order amounts/ledger, test decline/retry, manual capture/void, partial/full/pending refund, webhook replay, and provider outage recovery. Test/live webhook secrets are distinct. Do not enable live payments until tax/shipping/stock/fulfillment configuration is reviewed.

References: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method , https://docs.stripe.com/api/refunds/create , https://docs.stripe.com/webhooks .
