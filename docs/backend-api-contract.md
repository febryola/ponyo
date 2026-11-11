# Ponyo frontend ↔ AWS API contract

The storefront is a Next.js client. It must call only the public HTTPS FastAPI API on ECS/Fargate (normally through API Gateway/ALB). It must never connect directly to Aurora/PostgreSQL, Redis, S3, SQS/EventBridge, Stripe/Adyen, or supplier systems.

## Configuration and security

- Production storefront domain: `https://byponyo.com`; configure `NEXT_PUBLIC_PONYO_API_BASE_URL` as `https://api.byponyo.com` after the API is deployed.
- The API allows the exact storefront origin `https://byponyo.com` in credentialed CORS.
- Authentication uses Secure, HttpOnly, SameSite cookies. Host the API at `api.byponyo.com` and set `COOKIE_DOMAIN=.byponyo.com` so the readable `ponyo_csrf` cookie can be shared with the storefront and copied into `X-CSRF-Token` on mutations.
- Never put payment secret keys, AWS credentials, database URLs, supplier credentials, or service tokens in `NEXT_PUBLIC_*` variables.
- Payment entry stays on a Stripe/Adyen hosted checkout or provider SDK. The storefront never sends raw card numbers to Ponyo APIs.
- All API errors use `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`.

For SSR, an absolute public API URL works on both server and browser. A relative browser proxy such as `/ponyo-api` needs a private absolute `PONYO_API_SERVER_BASE_URL` for server fetches (development defaults to `http://127.0.0.1:8000`). The opt-in Next.js proxy is development-only; production must use the deployed absolute API URL or provide its own reviewed proxy.

The API is versioned under `/v1`. Keep existing fields and semantics compatible within this version; coordinate breaking changes under a new version. FastAPI exposes the current machine-readable route/input contract at `/openapi.json` and interactive documentation at `/docs`. Many response models are still generic dictionaries, so TypeScript types and the response examples below are not fully generated or runtime-validated against OpenAPI.

Backend framework 404/405 errors, request validation, business HTTP errors, and unexpected 500 errors share the error envelope. Responses preserve exception headers such as `Allow` and `Retry-After`, and errors returning through the application middleware retain request IDs, security headers, and credentialed CORS for approved origins. Unexpected errors log only request ID and exception type, not request bodies, tokens, or database exception text. Browser render failures have a retry fallback; this does not automatically retry payments/mutations or handle event-handler errors.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | connectivity check (`SELECT 1`), not a schema/migration readiness check |
| GET | `/v1/products` | public, published catalog; search, category/brand/availability/price/size filters, sorting, pagination, and `locale` |
| GET | `/v1/products/{product_id}` | published product detail and variants; UUID is canonical, legacy slugs remain readable for redirects |
| GET | `/v1/categories`, `/v1/categories/{identifier}` | published-product-backed categories; detail accepts UUID or slug |
| GET | `/v1/brands`, `/v1/brands/{identifier}` | published-product-backed brands; detail accepts UUID or slug |
| GET | `/v1/products/{product_id}/variants` | active variants, prices, options, and sellable availability |
| GET | `/v1/products/{product_id}/variants/{variant_id}` | active variant scoped to the published product |
| GET | `/v1/products/{product_id}/images` | ordered, sanitized gallery images with legacy primary-image fallback |
| GET | `/v1/products/{product_id}/availability` | current sellable availability and quantity per active variant; does not reserve stock |
| GET | `/v1/products/{product_id}/reviews` | public rating summary and published customer reviews |
| POST | `/v1/products/{product_id}/reviews` | submit or update a signed-in customer's review (CSRF protected) |
| POST | `/v1/products/{product_id}/waitlist` | save an email for a coming-soon product (CSRF protected; deduplicated per product/email) |
| POST | `/v1/auth/register` | create pending account or resend for an existing pending account; never signs in |
| POST | `/v1/auth/verify-email/resend` | resend a 24-hour verification link for a pending account |
| POST | `/v1/auth/verify-email/confirm` | consume a single-use token and activate the account |
| POST | `/v1/auth/login` | sign in with a verified account; sets session cookie |
| POST | `/v1/auth/logout` | revoke all current-version sessions for this account and clear cookies (CSRF protected) |
| POST | `/v1/auth/password-reset` | send reset email; always avoid revealing account existence |
| POST | `/v1/auth/password-reset/confirm` | consume reset token and change password |
| GET | `/v1/auth/me` | current account/profile |
| PATCH | `/v1/auth/me` | update current account/profile |
| GET, POST | `/v1/auth/addresses` | list/create the current customer's addresses |
| PATCH, DELETE | `/v1/auth/addresses/{address_id}` | update/delete an owned address |
| GET, PUT | `/v1/auth/wishlist` | read/replace the current customer's wishlist |
| GET | `/v1/orders` | current customer's order history |
| GET, PUT | `/v1/cart` | verified customer's saved cart; CSRF for replacement; no stock reservation |
| POST | `/v1/cart/validate` | public read-only cart price/stock snapshot, including unavailable lines; no persistence or reservation |
| GET | `/v1/orders/{order_id}` | authorized order details and fulfillment status |
| POST | `/v1/checkout/sessions` | verified account required; validate inventory/prices, reserve stock, create hosted payment session |
| GET | `/v1/checkout/sessions/{session_id}` | limited guest receipt lookup using the unguessable Stripe Checkout Session ID |
| POST | `/v1/newsletter/subscriptions` | subscribe an email to marketing updates |
| POST | `/v1/contact/requests` | contact or plush request form |
| GET | `/v1/localization/rates` | currency conversion rates |
| POST | `/v1/webhooks/stripe` | Stripe-signature-verified payment events |

### Product response

Optional `categoryId`, `brandId`, `brandName`, `images[]` (`url`, `alt`) and `galleryImages[]` (`src`, `alt`) expose normalized catalog relations. Supplier costs/contact details/internal offer SKUs are never public. Compatibility `supplierName` is the public brand label, not a supplier business identifier.

`GET /v1/products` returns `{ "data": Product[], "page": 1, "limit": 24, "total": 123 }`. A product has unique database `id` (canonical detail URL identifier), unique `sku`, `slug` (catalog handle, not the canonical URL), `name`, `description`, `priceAmount` (integer minor units), `currency`, `availability`, `categoryName`, `supplierName` (public label only), `image`, `imageAlt`, `tags`, optional size/dimensions/dispatch metadata, `variantId` for the default purchasable variant, and `variants[]` with opaque `id`, unique `sku`, title, price, currency, and availability. Never expose supplier credentials/internal costs.

### Product discovery, taxonomy, and availability

Existing listing/detail routes and response fields remain available. Search uses `GET /v1/products?q=...`; filtering is composed on the same listing route rather than a separate search endpoint.

- `q` (up to 120 characters) searches source name, description, legacy category label, product SKU, brand name, and cached translations for the requested supported `locale`.
- `category` accepts a legacy category label or normalized category name/slug. `brand` accepts a normalized brand name/slug. `category_id` and `brand_id` accept UUIDs. Supplied filters combine with AND.
- `availability` accepts `available` or `unavailable`. `size` matches the size tier. `min_price`/`max_price` are nonnegative integer minor units and match a sellable variant; reversed price bounds return 422.
- `sort` supports `price-ascending`, `price-descending`, `title-ascending`, `title-descending`, `created-ascending`, `created-descending`, `newest`, and `available-first`. `best-selling` retains the newest-first merchandising fallback until paid-order analytics are implemented. Unknown sort values retain the legacy name-ascending fallback. Product UUID breaks ties for stable ordering.
- `page` starts at 1; `limit` defaults to 24 and ranges from 1 to 100. Pages beyond the result set return empty `data` with the matching `total`.

Category/brand lists accept `q`, `page`, and `limit` and return `{ "data": [{ "id", "slug", "name", "productCount" }], "page", "limit", "total" }`. Categories also include nullable `parentId`; inactive parents are hidden. Categories must be active and both taxonomies must have published products. Detail returns `{ "data": item }`; hidden/missing records return 404. Taxonomy names are source-language labels, not automatically translated.

Variant routes return existing public variant fields only, never supplier costs, contacts, or internal offer SKUs. Inactive variants, unpublished products, and variants belonging to another product return 404 for detail. Product identifiers on these catalog subroutes accept UUID or legacy slug.

Image responses contain `{ "id", "url", "alt", "position" }`, ordered by stored position. Missing gallery rows fall back to the legacy product image with null ID. URLs pass through the existing catalog-image allowlist and fallback resolver. This is read-only storefront image handling, not an administrative upload or arbitrary remote-image service.

Availability returns `{ "data": { "productId", "availability", "availabilityStatus", "variants": [{ "variantId", "availability", "availableQuantity" }] } }`. Sellable quantity is capped by variant stock and the largest available inventory from a single active, matching-currency offer with an active supplier. Inventories are not summed because one supplier must fulfill a line. Available inventory means on-hand minus reserved stock; variants without any supplier offers retain legacy variant-stock behavior. Listing, detail, and availability endpoints use this same calculation. Quantities are snapshots, not reservations or a guarantee against concurrent checkout. Supplier ingestion/reconciliation and portal management are separate future integrations.

### Multilingual product data

Listing/detail accept `locale`; supported locales use cached product-name/description translations, with the configured AWS Translate provider generating missing/stale translations when enabled. Unsupported locales, disabled provider without a valid cache, or provider failure fall back to English. Locale validation still applies. Cached translated search does not generate translations for unmatched products or perform universal cross-language search. Taxonomy labels, variant options, and image alt text are not automatically translated. Enabling locale support does not mean every demo product already has real translated data.

### Persisted cart

`GET /v1/cart` returns `{ "data": { "id": null, "currency": "JPY", "items": [] } }` for a new account. Saved carts return a UUID `id` and `items` containing `{ "variantId": "uuid", "productId": "uuid", "quantity": 1 }`. `PUT /v1/cart` accepts only `{ "currency": "JPY", "items": [{ "variantId": "uuid", "quantity": 1 }] }`; item quantities are integers 1–99, up to 100 unique variants. Customer identity comes from the session, not the body. Prices are always recalculated at checkout, not stored from client input. Empty items clears the account cart. Guests get 401 and pending accounts 403.

### Cart validation and unavailable products

`POST /v1/cart/validate` accepts `{ "currency": "JPY", "items": [{ "variantId": "uuid", "quantity": 1, "expectedPriceAmount": 1500, "expectedCurrency": "JPY" }] }`. Expected price/currency are optional assertions, never an authority for charging. The endpoint is public and read-only (no CSRF required), rate-limited to 60 requests per minute per IP when rate-limit infrastructure is enabled. Input accepts 0–100 unique variants and strict integer quantities 1–99; extra fields are rejected.

Response `data` includes `items`, `canCheckout`, `subtotalAmount`, and nullable `sourceCurrency`. Each line includes identifiers, requested quantity, current source price/currency, sanitized display metadata, `availableQuantity`, `availability`, `priceChanged`, and `issues`. Issue codes are `product_unavailable`, `insufficient_stock`, `price_changed`, `currency_changed`, and `mixed_currency`. Hidden/missing/inactive variants return generic unavailable metadata and null prices; private catalog or supplier data is never exposed. Sellable stock uses the shared single-offer supplier calculation, not the sum of suppliers' inventories.

Subtotal includes current prices for all visible lines, including insufficient-stock lines; it is not a payable quote. Multiple source currencies return subtotal zero/source currency null and block checkout. Display currency can differ from source currency and is converted by the storefront/payment service. Empty carts and carts with any issue have `canCheckout=false`.

Guest carts remain in browser storage; verified customer carts synchronize to the database with account isolation. Add/remove and quantity updates preserve distinct product variants, including variants of the same product. Limits are 100 lines and 99 units per line across cart and checkout. Login merges quantities by maximum rather than summing; it does not reserve stock. Confirmed missing/withdrawn remote items remain as removable unavailable placeholders, while unknown/network hydration failures still block destructive server replacement.

The cart page refreshes prices and availability, shows per-line issues, and blocks checkout until the current snapshot validates. It never silently removes unavailable products or reduces their quantity. Price changes require review and revalidation. Checkout revalidates again before requesting a payment session and sends optional source-price/currency expectations. Changes after validation return 409 `cart_price_changed` before reservation/payment; clients that omit expectations retain server-price recalculation for compatibility. API failures cannot fall back to a real-looking demo payment; offline previews remain separate.

Multi-supplier carts are supported within one source currency. Each order line snapshots its chosen supplier offer; all stock reservations happen before creating Stripe checkout, in the order transaction. A failed line rolls back earlier reservations; payment-provider failure also rolls back stock. Fulfillment remains order-level today: supplier-split shipment/tracking management and real supplier stock feeds are not implemented by this storefront feature.

### Authentication response

Register accepts `{ "firstName", "lastName", "email", "password", "marketingOptIn" }` and returns `{ "data": { "accepted": true, "emailVerificationRequired": true } }` only after SMTP accepts the verification message. It never sets a login session or exposes an existing pending customer's profile. Re-registering a pending address resends without changing the saved password/name; a verified address returns `409`.

Resend accepts `{ "email" }`; confirm accepts `{ "token" }`. Resend returns `{ "data": { "accepted": true } }` for unknown or already-verified addresses without sending mail. Tokens are stored hashed, expire after 24 hours, and are consumed once; confirmation invalidates sibling tokens. Register/resend delivery failures return `503` with code `verification_email_delivery_failed`; the account remains pending and can recover through resend. SMTP acceptance is not proof of inbox delivery.

Login accepts `{ "email", "password" }`; successful login returns `{ "data": { "customer": { "id", "firstName", "lastName", "email" } } }` and sets the session cookie. Pending login and existing unverified sessions return `403` with code `email_verification_required`. Account/order/review routes re-check the database verification flag on every request. Password reset accepts `{ "email" }` and returns `{ "data": { "accepted": true } }` without revealing whether the address exists. The browser does not persist credentials or bearer tokens.

#### Customer authentication and access control

- Passwords use salted Argon2 hashing through `pwdlib`. Registration/reset enforce length 8–128, a digit, and a special character. Reset tokens use 32 random bytes, SHA-256 storage, a one-hour expiry, and an atomic one-time claim; confirmation invalidates sibling reset tokens and all existing account sessions, without changing email verification status.
- Reset links use `STOREFRONT_BASE_URL`, not the first CORS origin. Known and unknown email addresses retain the same accepted response, including SMTP rejection; a failed delivery invalidates only the newly undelivered token. Accepted here is a privacy-preserving acknowledgement, not proof of mail delivery.
- Login/profile responses additionally include `role`. The database allows `customer`, `supplier`, or `admin`, defaulting existing and newly registered accounts to `customer`. Public registration and profile updates reject extra fields, including role, verification status, and session-version injection. No public role-assignment endpoint exists.
- Protected endpoints use FastAPI dependency guards: signed cookie validation, required issuer/subject/issued-at/expiry claims, current database session version, verified email, then role authorization. `require_roles(...)` uses explicit membership in the current database role; admin has no implicit customer/supplier access. Empty policies deny everyone. JWT role claims never grant permissions.
- Current storefront login, profile, addresses, cart, orders, wishlist, checkout, and review operations are customer-only. Supplier/admin role storage and reusable guards are foundations only: no supplier/admin sign-in service, portal, management API, or self-promotion is exposed. Assign roles only through trusted operational tooling until those services are implemented.
- Logout is idempotent and requires CSRF even without a valid session. A valid session atomically increments the account session version, so all sessions using that version are revoked; replaying an already-revoked cookie cannot revoke newer logins. This is intentionally account-wide logout, not device-scoped revocation. Password reset also increments the version. Legacy pre-version cookies work only while the stored version remains zero.
- Profile updates remain limited to names. Address create/update/delete uses the authenticated customer ID, rejects unknown fields, and returns 404 for another customer's address. Default-address behavior remains unchanged. This is ownership authorization in addition to RBAC, not admin bypass.

Apply migration `20261111_0016` before deploying this code. It adds role/version columns and database checks without deleting customer records. Offline PostgreSQL SQL generation and isolated SQLite migration tests do not certify online PostgreSQL execution.

`GET /v1/orders` returns `{ "data": Order[] }`. Each order includes `id`, `orderNumber`, `createdAt`, `status`, `paymentStatus`, `fulfillmentStatus`, `customerEmail`, `deliveryAddress`, `totalAmount`, `currency`, and item snapshots with `id`, `name`, `image`, `imageAlt`, `maker`, `quantity`, `unitPrice`, and `currency`.

### Checkout request/response

Live checkout requires a verified signed-in customer (`401` for guests, `403` for pending accounts). The submitted email must match the verified account email (`422` otherwise). These checks run before payment creation or stock reservation. Offline demo orders are previews only, not server orders or payments.

`POST /v1/checkout/sessions` accepts `{ "email", "shippingAddress": { "firstName", "lastName", "address1", "city", "postalCode", "countryCode" }, "shippingMethod", "paymentMethod": "card" | "paypal" | "apple_pay", "items": [{ "variantId", "quantity" }], "successUrl", "cancelUrl" }`. The backend currently supports Stripe card checkout, recalculates prices, and validates/reserves inventory; client-submitted prices are ignored. It responds `{ "data": { "checkoutUrl", "orderId", "expiresAt" } }`. The client redirects to the HTTPS `checkoutUrl`; webhook processing verifies amount/session/signature and updates payment state. The hosted success URL includes Stripe's `{CHECKOUT_SESSION_ID}` placeholder; the receipt endpoint returns only a non-PII summary.

## Infrastructure ownership

- Aurora/PostgreSQL: customers, products, variants, stock, orders, suppliers, payment/fulfillment references.
- S3: product/media uploads, accessed using short-lived signed URLs.
- Redis: cache, rate limits, idempotency, short-lived cart/session data.
- SQS/EventBridge: payment webhooks, supplier purchase orders, stock sync, notifications, retries.
- Stripe/Adyen and shipping/supplier services: backend-only integrations. The browser receives hosted checkout URLs and sanitized status only.
