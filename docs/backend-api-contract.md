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
| GET | `/v1/products` | public, published catalog; supports `q`, `category`, `min_price`, `max_price`, `size`, `sort`, `page`, `limit` |
| GET | `/v1/products/{product_id}` | published product detail and variants; UUID is canonical, legacy slugs remain readable for redirects |
| GET | `/v1/products/{product_id}/reviews` | public rating summary and published customer reviews |
| POST | `/v1/products/{product_id}/reviews` | submit or update a signed-in customer's review (CSRF protected) |
| POST | `/v1/products/{product_id}/waitlist` | save an email for a coming-soon product (CSRF protected; deduplicated per product/email) |
| POST | `/v1/auth/register` | create pending account or resend for an existing pending account; never signs in |
| POST | `/v1/auth/verify-email/resend` | resend a 24-hour verification link for a pending account |
| POST | `/v1/auth/verify-email/confirm` | consume a single-use token and activate the account |
| POST | `/v1/auth/login` | sign in with a verified account; sets session cookie |
| POST | `/v1/auth/logout` | clear session cookie |
| POST | `/v1/auth/password-reset` | send reset email; always avoid revealing account existence |
| POST | `/v1/auth/password-reset/confirm` | consume reset token and change password |
| GET | `/v1/auth/me` | current account/profile |
| PATCH | `/v1/auth/me` | update current account/profile |
| GET, POST | `/v1/auth/addresses` | list/create the current customer's addresses |
| PATCH, DELETE | `/v1/auth/addresses/{address_id}` | update/delete an owned address |
| GET, PUT | `/v1/auth/wishlist` | read/replace the current customer's wishlist |
| GET | `/v1/orders` | current customer's order history |
| GET | `/v1/orders/{order_id}` | authorized order details and fulfillment status |
| POST | `/v1/checkout/sessions` | verified account required; validate inventory/prices, reserve stock, create hosted payment session |
| GET | `/v1/checkout/sessions/{session_id}` | limited guest receipt lookup using the unguessable Stripe Checkout Session ID |
| POST | `/v1/newsletter/subscriptions` | subscribe an email to marketing updates |
| POST | `/v1/contact/requests` | contact or plush request form |
| GET | `/v1/localization/rates` | currency conversion rates |
| POST | `/v1/webhooks/stripe` | Stripe-signature-verified payment events |

### Product response

`GET /v1/products` returns `{ "data": Product[], "page": 1, "limit": 24, "total": 123 }`. A product has unique database `id` (canonical detail URL identifier), unique `sku`, `slug` (catalog handle, not the canonical URL), `name`, `description`, `priceAmount` (integer minor units), `currency`, `availability`, `categoryName`, `supplierName` (public label only), `image`, `imageAlt`, `tags`, optional size/dimensions/dispatch metadata, `variantId` for the default purchasable variant, and `variants[]` with opaque `id`, unique `sku`, title, price, currency, and availability. Never expose supplier credentials/internal costs.

### Authentication response

Register accepts `{ "firstName", "lastName", "email", "password", "marketingOptIn" }` and returns `{ "data": { "accepted": true, "emailVerificationRequired": true } }` only after SMTP accepts the verification message. It never sets a login session or exposes an existing pending customer's profile. Re-registering a pending address resends without changing the saved password/name; a verified address returns `409`.

Resend accepts `{ "email" }`; confirm accepts `{ "token" }`. Resend returns `{ "data": { "accepted": true } }` for unknown or already-verified addresses without sending mail. Tokens are stored hashed, expire after 24 hours, and are consumed once; confirmation invalidates sibling tokens. Register/resend delivery failures return `503` with code `verification_email_delivery_failed`; the account remains pending and can recover through resend. SMTP acceptance is not proof of inbox delivery.

Login accepts `{ "email", "password" }`; successful login returns `{ "data": { "customer": { "id", "firstName", "lastName", "email" } } }` and sets the session cookie. Pending login and existing unverified sessions return `403` with code `email_verification_required`. Account/order/review routes re-check the database verification flag on every request. Password reset accepts `{ "email" }` and returns `{ "data": { "accepted": true } }` without revealing whether the address exists. The browser does not persist credentials or bearer tokens.

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
