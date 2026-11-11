# Checkout and order management

## Checkout contract

All money fields are integer **minor units** in the order currency (JPY has no decimal places).
A verified customer session and CSRF token are required for writes.

- `POST /v1/checkout/quote`: same body as `/checkout/sessions`, plus optional `couponCode`. Validates active/published variants, actual supplier availability, quantities, expected prices/currencies, shipping country/method, coupon eligibility and FX. Returns `subtotalAmount`, `discountAmount`, `shippingAmount`, `taxAmount`, `taxRateBps`, `totalAmount`, `currency`, `couponCode`. Does **not** reserve stock, redeem coupons, or create an order/payment.
- `POST /v1/checkout/sessions`: revalidates the same data under stock locks. Optional `expectedTotalAmount` rejects a stale quote with HTTP 409. Never accepts browser-calculated shipping, tax or discounts. Atomically reserves stock/supplier stock, persists customer-linked order/items/history, then creates the Stripe session. Failures roll back the reservation; database-commit failure attempts provider-session expiry.
- `GET /v1/checkout/sessions/{session_id}`: existing limited receipt lookup.

`totalAmount = subtotalAmount - discountAmount + shippingAmount + taxAmount`.
Discounts are allocated proportionally across product lines with integer largest-remainder rounding. Quantities are split into at most two Stripe line items when necessary, avoiding rounding discrepancies. Stripe line items include shipping and configured tax; webhook verification continues to require exact order total and currency.

## Shipping and tax configuration

- `CHECKOUT_STANDARD_SHIPPING_JPY`: default 0.
- `CHECKOUT_EXPRESS_SHIPPING_JPY`: default 1200.
- Shipping always starts in JPY and is converted into the payment currency, independent of the catalog source currency.
- `CHECKOUT_TAX_RATES_BPS`: JSON object mapping shipping-country codes to merchant-reviewed tax rates, for example `{"JP":1000}` represents 10%. **Default `{}` collects no tax. This is not an automatic legal determination of tax obligations.** Configure applicable registrations/rates before live checkout. This simple country-level engine does not model province/state/city nexus, exemptions or inclusive pricing; use a tax provider before operating in jurisdictions requiring those features.
- `CHECKOUT_TAX_SHIPPING`: default false. When enabled, shipping is included in the tax base. Product tax base is the discounted subtotal. Integer amounts round half-up.

No rates, free-shipping offers, or discount campaigns are inferred from the storefront or created automatically.

## Coupons

The `coupons` table contains server-managed codes (trimmed uppercase), percentage (basis-point) or fixed-minor-unit discounts, currency, minimum subtotal, optional maximum discount, active/start/expiry rules, global redemption limit and per-customer limit.

Trusted operators can provision a coupon with `python -m app.coupons CODE percentage 1000 --max-redemptions 100` from the backend environment. `1000` is 10%; fixed coupons use minor units. Optional flags include `--currency`, `--minimum-subtotal`, `--maximum-discount`, `--per-customer-limit`, `--starts-at` and `--expires-at`. Never expose this command or direct database access to customers. No default coupon is enabled by migration.

Session creation locks the coupon row before checking usage. Non-cancelled orders (including pending-payment orders) reserve a redemption. Quotes do not. Provider-confirmed cancellation/expiry releases the redemption by changing the order state; payment failures roll back the order and do not consume usage. Postgres is required for production row-lock concurrency guarantees.

## Snapshots and history

Order rows store subtotal/discount/shipping/tax/rate/coupon at creation. Order item rows retain name, maker, image, price, quantity, currency and an additional immutable JSON snapshot: product ID/slug/SKU, variant SKU/title/options, original catalog price/currency/category. Editing the catalog never rewrites those snapshots.

- `GET /v1/orders`: current customer's newest-first orders.
- `GET /v1/orders/{id}`: current customer's order detail, including totals and item snapshots.
- `GET /v1/orders/{id}/history`: chronological state/payment/fulfillment audit events.
- Unowned order IDs return 404. No customer-facing endpoint permits arbitrary status changes.

Payment webhooks move `pending_payment` to `processing` when payment is verified, queue fulfillment and write history/outbox events. Provider-confirmed expiry/failure cancels pending reservations.

Trusted fulfillment operators can use `python -m app.order_management ORDER_UUID shipped --tracking-number TRACKING --tracking-carrier CARRIER`, followed by `delivered` and `completed`. Only paid orders may move through `processing → shipped → delivered → completed`; shipment requires tracking. Each transition writes history/outbox records. Database operator credentials are required; this is intentionally not an unauthenticated admin API.

Alternatively, `POST /v1/orders/{id}/status` accepts `{ "status": "shipped", "trackingNumber": "...", "trackingCarrier": "..." }` (or status `delivered` / `completed`). This endpoint requires a verified session whose **current database role is admin**, CSRF, and rate limiting. Customer/supplier accounts receive 403. It uses the same transition rules as the trusted operator command; it cannot mark an unpaid order paid or bypass Stripe.

## Customer cancellation

`POST /v1/orders/{id}/cancel` accepts optional `{ "reason": "..." }` (max 500 chars), authenticated and CSRF protected. Only `pending_payment` + `unpaid` orders are customer-cancellable. The server retrieves/expires Stripe checkout outside database locks, requires provider-confirmed `expired` + `unpaid` and matching identifiers, re-locks/rechecks the order, atomically claims cancellation, then releases supplier and variant reservations once. Repeat cancellation is idempotent. Provider outages or payment-in-progress statuses fail closed with no inventory release.

Paid, shipped and delivered orders require a separate support/refund workflow; this endpoint does **not** pretend to refund a captured payment. Frontend order cards expose confirmed cancellation and history on demand.

## Migration and validation

Migration `20261111_0019` follows `20261111_0018`. It adds order totals, snapshots and coupon storage. Historical breakdowns are conservatively inferred from saved items; unknown historic taxes are not invented. Apply migrations through the normal deployment process before deploying the new API. This implementation does not automatically alter the current application database or create Stripe test payments.

Tests use disposable SQLite databases and mocked Stripe only. Coverage includes quotes without mutations, rounding, percentage/fixed discounts, eligibility/limits/expiry, FX shipping, source changes, snapshot immutability, exact Stripe totals, cancellation authorization/provider failure/idempotency and operator transition rules, alongside the existing stock-concurrency/payment-webhook suites.
