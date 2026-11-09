# Ponyo API

FastAPI service for the Ponyo storefront. It is intentionally in the same repository as the Next.js app, but can be built and deployed independently.

## Local run

1. Copy `.env.example` to `.env.local` and set a random local `JWT_SECRET`. Keep all real secrets out of Git and out of `NEXT_PUBLIC_*` variables.
2. Start the local stack with Docker Compose (PostgreSQL, Redis, API). The API applies Alembic migrations and seeds a small development catalog at startup.
3. Set the frontend's `NEXT_PUBLIC_PONYO_API_BASE_URL` to `http://localhost:8000`, then run the frontend from the repository root.

Interactive API docs are available at `http://localhost:8000/docs` in local development.

## Direct Python development

Use Python 3.12+ and install the project with its `test` extra. Start PostgreSQL and Redis first, then run `alembic upgrade head`, `python -m app.seed`, and `uvicorn app.main:app --reload` from this directory.

## Routes

- `GET /v1/health`, catalog, product detail
- CSRF token, register, login, current account/profile updates, saved addresses, and persistent customer wishlist
- Product ratings/reviews and durable per-product coming-soon waitlists
- One-hour, single-use password reset requests and confirmation (`SMTP_HOST`, `SMTP_FROM_EMAIL`, and SMTP credentials must be configured for delivery)
- Authenticated order history and detail
- Guest/account checkout with server-priced variants and Stripe-hosted payment
- Newsletter/contact submissions
- Stripe signature-verified webhook endpoint with an idempotent transactional outbox publisher to SQS

## Production deployment notes

Deploy the container to ECS/Fargate in `ap-northeast-1` behind an HTTPS load balancer. Use task IAM roles, Secrets Manager, private Aurora PostgreSQL and Redis subnets, exact CORS origins, shared-domain Secure cookies, TLS, WAF/rate limits, and CloudWatch. Configure Stripe webhook delivery to `/v1/webhooks/stripe`. The API publisher sends durable outbox events to SQS; a separate idempotent consumer must still process fulfillment and notifications before connecting real supplier systems.

This repository contains a development catalog seed, not supplier-approved inventory. Replace it with verified catalog/stock feeds before accepting real payments. Production rollout also requires a real domain, AWS account, Stripe test/live configuration, email delivery provider, fulfillment consumer, monitoring/alerts, and privacy/retention policies. No deployment has been run from this workspace.
