# Ponyo API

FastAPI service for the Ponyo storefront. It is intentionally in the same repository as the Next.js app, but can be built and deployed independently.

## Local run

1. Copy `.env.example` to `.env.local` and set a random local `JWT_SECRET`. Keep all real secrets out of Git and out of `NEXT_PUBLIC_*` variables.
2. Start the local stack with Docker Compose (PostgreSQL, Redis, API). The API applies Alembic migrations and seeds a small development catalog at startup.
3. Set the frontend's `NEXT_PUBLIC_PONYO_API_BASE_URL` to `http://localhost:8000`, then run the frontend from the repository root.

Interactive API docs are available at `http://localhost:8000/docs` in local development.

## Direct Python development

Use Python 3.12+ and install the project with its `test` extra. Start PostgreSQL and Redis first, then run `alembic upgrade head`, `python -m app.seed`, and `uvicorn app.main:app --reload` from this directory.

The full Alembic chain targets PostgreSQL. SQLite can run local previews/tests against a model-created schema, but migration `20261109_0006` uses PostgreSQL-specific SQL and cannot bootstrap a fresh SQLite database. Do not treat SQLite test success as PostgreSQL migration certification.

CI runs the API tests with SQLite and separately generates the full migration SQL with an explicit PostgreSQL `DATABASE_URL`. The `alembic upgrade head --sql` step is offline: it needs the correct dialect but no running PostgreSQL server or real database credentials. This checks SQL generation, not execution against PostgreSQL; staging must still run online migrations before release.

For an existing populated database without an Alembic version record, **do not run upgrade or stamp blindly**. Back up first, compare tables, columns, types, indexes, constraints and defaults against the migration target, then reconcile the baseline deliberately. The local preview database has no recorded Alembic revision; its populated schema must be checked before applying individual additive revisions. `GET /v1/health` checks connectivity with `SELECT 1`; it does not certify schema/migration readiness.

## Routes

Storefront database entities, supplier demo fixtures, relationships and rollout limits are documented in [storefront database](../docs/storefront-database.md). Revision `20261111_0015` adds normalized categories, brands, galleries, suppliers/offers/inventory, account carts and order status history. Run migrations before updated application code. The local unversioned preview baseline still requires deliberate reconciliation; do not blindly upgrade/stamp it.

- `GET /v1/health`, catalog, product detail
- CSRF token, register, login, current account/profile updates, saved addresses, and persistent customer wishlist
- Pending registration, 24-hour single-use email verification, and resend recovery; account sessions are issued only after verification
- Product ratings/reviews and durable per-product coming-soon waitlists
- One-hour, single-use password reset requests and confirmation (`SMTP_HOST`, `SMTP_FROM_EMAIL`, and SMTP credentials must be configured for delivery)
- Database-backed customer/supplier/admin roles with explicit role guards; storefront access stays customer-only, with no public role assignment or admin/supplier portal
- Revocable session versions: logout revokes all current account sessions; password reset atomically consumes its token and invalidates existing sessions
- Authenticated order history and detail
- Authenticated persisted carts (`GET/PUT /v1/cart`); guest browser carts remain local
- Public read-only `POST /v1/cart/validate` refreshes source prices/supplier availability and flags unavailable or changed-price lines without removing them
- Multi-supplier carts and checkout use per-line supplier offers, transactional stock revalidation, and optional price expectations; cart/checkout limits are 100 unique variants and 99 units per line
- Verified-account checkout with server-priced variants and Stripe-hosted payment; guest checkout is not accepted
- Linked supplier-stock reservation/settlement and transactional order status history (demo supply only until real onboarding)
- Newsletter/contact submissions
- Stripe signature-verified webhook endpoint with an idempotent transactional outbox publisher to SQS

## Production deployment notes

### Testing verification before deployment

Deployment is not required when opening the email on the same computer that runs both local servers. Keep frontend/API running and open the email button in that computer's browser. A `localhost` link opened on a phone points to the phone, not the development computer.

For cross-device tests, use a reviewed HTTPS development tunnel or staging environment for **both** frontend and API. Set `STOREFRONT_BASE_URL` to the frontend's public HTTPS origin, add that exact origin to `FRONTEND_ORIGINS`, and set the frontend's `NEXT_PUBLIC_PONYO_API_BASE_URL` to the public API origin. Restart both servers and resend the email; older messages keep their original URL. Never expose a development API or database publicly without reviewing access controls. Different-site tunnel hostnames can block cookies; use same-site hostnames or staging with the intended cookie domain for reliable auth testing.

Verification mail includes an HTML button. With a public HTTPS storefront, the Ponyo mascot uses the public PNG asset at `/ponyo-email-jellyfish.png`, allowing Gmail's image proxy to retrieve it. Local HTTP development uses an inline CID PNG with explicit MIME root metadata. Email apps may still hide images until the recipient permits them. A plain-text alternative keeps the secure URL accessible to text-only email clients. The button points to the same single-use verification page; styling does not change activation or token security. Gmail on mobile cannot reach a computer's localhost and may sanitize local links; use a public HTTPS URL and resend after changing it.

For a single-origin development tunnel, opt in to `PONYO_DEV_API_PROXY=true` and set `NEXT_PUBLIC_PONYO_API_BASE_URL=/ponyo-api` for the frontend process. The development-only rewrite forwards `/ponyo-api/v1/*` to the loopback API at port 8000, not the database or API docs. Set `PONYO_DEV_TUNNEL_ORIGIN` to the exact temporary HTTPS frontend origin to permit development assets. The backend process must use that origin for `STOREFRONT_BASE_URL` and include it in `FRONTEND_ORIGINS`. These temporary process overrides are not production configuration, stop working when the tunnel stops, and must be updated for each new quick-tunnel URL. Stop the tunnel after testing; do not share the URL publicly.

Apply Alembic migrations through `20261111_0016` before deploying the current auth code. Revision 0016 adds trusted account roles and nonnegative session versions; existing accounts default to customer/version zero without changing credentials or verification state. Revision 0014 requires existing unverified accounts to use resend/verification before signing in. The schema represents pending status with `email_verified=false`; there is no separate activation status that can drift out of sync. See the [authentication contract](../docs/backend-api-contract.md#customer-authentication-and-access-control) for logout scope, reset delivery privacy, and role limitations.

Configure `STOREFRONT_BASE_URL` as the public HTTPS storefront origin (also present in `FRONTEND_ORIGINS`) and configure `SMTP_HOST`, `SMTP_FROM_EMAIL` (or `SMTP_USERNAME`), and SMTP credentials. Production startup rejects missing email transport or an invalid storefront origin. Without local SMTP, verification links are logged for development, but the API reports delivery failure rather than claiming mail was sent. Verification delivery is synchronous: failure returns `503`, preserves the pending account, and lets the customer retry through resend. There is no automatic delivery retry worker for verification mail.

Before declaring email E2E complete, use a controlled real mailbox on staging: register, confirm the account remains pending and login/checkout are blocked, inspect inbox/spam, open the received public-domain link, sign in, and start Stripe test checkout. Repeat resend, expired/reused links, and SMTP failure/recovery. Check provider delivery/bounce logs and SPF/DKIM/DMARC. SMTP acceptance and mocked transport tests do not establish inbox delivery. Never include verification tokens or SMTP credentials in tickets or screenshots.

Deploy the container to ECS/Fargate in `ap-northeast-1` behind an HTTPS load balancer. Use task IAM roles, Secrets Manager, private Aurora PostgreSQL and Redis subnets, exact CORS origins, shared-domain Secure cookies, TLS, WAF/rate limits, and CloudWatch. Configure Stripe webhook delivery to `/v1/webhooks/stripe`. The API publisher sends durable outbox events to SQS; a separate idempotent consumer must still process fulfillment and notifications before connecting real supplier systems.

This repository contains a development catalog seed, not supplier-approved inventory. Replace it with verified catalog/stock feeds before accepting real payments. Production rollout also requires a real domain, AWS account, Stripe test/live configuration, email delivery provider, fulfillment consumer, monitoring/alerts, and privacy/retention policies. No deployment has been run from this workspace.
