# Ponyo frontend ↔ AWS API contract

The storefront is a Next.js client. It must call only the public HTTPS FastAPI API on ECS/Fargate (normally through API Gateway/ALB). It must never connect directly to Aurora/PostgreSQL, Redis, S3, SQS/EventBridge, Stripe/Adyen, or supplier systems.

## Configuration and security

- Production storefront domain: `https://byponyo.com`; configure `NEXT_PUBLIC_PONYO_API_BASE_URL` as `https://api.byponyo.com` after the API is deployed.
- The API allows the exact storefront origin `https://byponyo.com` in credentialed CORS.
- Authentication uses Secure, HttpOnly, SameSite cookies. Host the API at `api.byponyo.com` and set `COOKIE_DOMAIN=.byponyo.com` so the readable `ponyo_csrf` cookie can be shared with the storefront and copied into `X-CSRF-Token` on mutations.
- Never put payment secret keys, AWS credentials, database URLs, supplier credentials, or service tokens in `NEXT_PUBLIC_*` variables.
- Payment entry stays on a Stripe/Adyen hosted checkout or provider SDK. The storefront never sends raw card numbers to Ponyo APIs.
- All API errors use `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | readiness for deployment checks |
| GET | `/v1/products` | public, published catalog; supports `q`, `category`, `min_price`, `max_price`, `size`, `sort`, `page`, `limit` |
| GET | `/v1/products/{product_id}` | published product detail and variants; UUID is canonical, legacy slugs remain readable for redirects |
| GET | `/v1/products/{product_id}/reviews` | public rating summary and published customer reviews |
| POST | `/v1/products/{product_id}/reviews` | submit or update a signed-in customer's review (CSRF protected) |
| POST | `/v1/products/{product_id}/waitlist` | save an email for a coming-soon product (CSRF protected; deduplicated per product/email) |
| POST | `/v1/auth/register` | create account; sets session cookie |
| POST | `/v1/auth/login` | sign in; sets session cookie |
| POST | `/v1/auth/logout` | clear session cookie |
| POST | `/v1/auth/password-reset` | send reset email; always avoid revealing account existence |
| GET | `/v1/auth/me` | current account/profile |
| GET | `/v1/orders` | current customer's order history |
| GET | `/v1/orders/{order_id}` | authorized order details and fulfillment status |
| POST | `/v1/checkout/sessions` | validate inventory/prices, reserve stock, create Stripe/Adyen hosted session, return redirect URL |
| GET | `/v1/checkout/sessions/{session_id}` | limited guest receipt lookup using the unguessable Stripe Checkout Session ID |
| POST | `/v1/newsletter/subscriptions` | subscribe an email to marketing updates |
| POST | `/v1/contact/requests` | contact or plush request form |

### Product response

`GET /v1/products` returns `{ "data": Product[], "page": 1, "limit": 24, "total": 123 }`. A product has unique database `id` (canonical detail URL identifier), unique `sku`, `slug` (catalog handle, not the canonical URL), `name`, `description`, `priceAmount` (integer minor units), `currency`, `availability`, `categoryName`, `supplierName` (public label only), `image`, `imageAlt`, `tags`, optional size/dimensions/dispatch metadata, `variantId` for the default purchasable variant, and `variants[]` with opaque `id`, unique `sku`, title, price, currency, and availability. Never expose supplier credentials/internal costs.

### Authentication response

Register accepts `{ "firstName", "lastName", "email", "password", "marketingOptIn" }`; login accepts `{ "email", "password" }`. Successful register/login returns `{ "data": { "customer": { "id", "firstName", "lastName", "email" } } }` and sets the session cookie. Password reset accepts `{ "email" }` and returns `{ "data": { "accepted": true } }` without revealing whether the address exists. The browser does not persist credentials or bearer tokens.

`GET /v1/orders` returns `{ "data": Order[] }`. Each order includes `id`, `orderNumber`, `createdAt`, `status`, `paymentStatus`, `fulfillmentStatus`, `customerEmail`, `deliveryAddress`, `totalAmount`, `currency`, and item snapshots with `id`, `name`, `image`, `imageAlt`, `maker`, `quantity`, `unitPrice`, and `currency`.

### Checkout request/response

`POST /v1/checkout/sessions` accepts `{ "email", "shippingAddress": { "firstName", "lastName", "address1", "city", "postalCode", "countryCode" }, "shippingMethod", "paymentMethod": "card" | "paypal" | "apple_pay", "items": [{ "variantId", "quantity" }], "successUrl", "cancelUrl" }`. The backend chooses Stripe or Adyen from server configuration, recalculates prices, and validates inventory; client-submitted prices are ignored. It responds `{ "data": { "checkoutUrl", "orderId", "expiresAt" } }`. The client redirects to the HTTPS `checkoutUrl`; webhook processing confirms payment and updates fulfillment asynchronously.
`POST /v1/checkout/sessions` accepts `{ "email", "shippingAddress": { "firstName", "lastName", "address1", "city", "postalCode", "countryCode" }, "shippingMethod", "paymentMethod": "card" | "paypal" | "apple_pay", "items": [{ "variantId", "quantity" }], "successUrl", "cancelUrl" }`. The backend currently supports Stripe card checkout, recalculates prices, and validates/reserves inventory; client-submitted prices are ignored. It responds `{ "data": { "checkoutUrl", "orderId", "expiresAt" } }`. The client redirects to the HTTPS `checkoutUrl`; webhook processing verifies amount/session/signature and updates payment state. The hosted success URL includes Stripe's `{CHECKOUT_SESSION_ID}` placeholder; the receipt endpoint returns only a non-PII summary.

## Infrastructure ownership

- Aurora/PostgreSQL: customers, products, variants, stock, orders, suppliers, payment/fulfillment references.
- S3: product/media uploads, accessed using short-lived signed URLs.
- Redis: cache, rate limits, idempotency, short-lived cart/session data.
- SQS/EventBridge: payment webhooks, supplier purchase orders, stock sync, notifications, retries.
- Stripe/Adyen and shipping/supplier services: backend-only integrations. The browser receives hosted checkout URLs and sanitized status only.
