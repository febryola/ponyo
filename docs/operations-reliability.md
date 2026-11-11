# API security and operations reliability

## Transactional email

The backend uses an SMTP submission provider configured only through backend/Secrets Manager values: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_STARTTLS`. Production configuration requires a sender/provider and STARTTLS. Verify the sender/domain with the provider and complete a real staging delivery/bounce check before production; Terraform wiring alone does not prove delivery.

Verification and password-reset links remain single-use, hashed in the database, and time limited. Local development never logs their bearer URLs; configure a local SMTP sink or test sender if links must be received.

Order/payment confirmation, shipping, delivery, cancellation, and successful-refund messages are inserted transactionally alongside their state/outbox events. A separate worker delivers them with deterministic Message-IDs, leases, exponential retries (up to 10 attempts), and a terminal `failed` state. This is at-least-once delivery: an SMTP server can accept a message immediately before the worker crashes, so recipient-side duplicate suppression is not guaranteed. The service logs event/template identifiers and exception classes, not recipients, message bodies, or credentials. Monitor `email_notifications` for pending/failed work.

## Checkout and payment idempotency

Secure checkout requires a UUID idempotency key scoped to the authenticated customer. The order and stock reservation are persisted before Stripe is called. The canonical request hash prevents using the same key with changed cart/address/payment/return URL details. Exact retries resume the same Stripe request using the stable order identity and provider key. The frontend retains the key in session storage for retries and rotates it when checkout details change. Session creation is limited to 10 requests/minute per client IP.

If the provider call is ambiguous, keep and retry with the same key; do not make a new order/key until the state is reconciled. A reservation with no committed Stripe session is not exposed to the customer and is released after its saved expiration deadline. Once a Stripe session ID is stored, expiration recovery still requires Stripe to confirm the session expired and unpaid. Payment capture/refund operations retain their separate durable provider idempotency keys and ledger.

## Existing API security controls

- Verified customer session cookies are HTTP-only; CSRF tokens are required for state-changing requests.
- Database-backed roles, ownership checks, request schemas, and password hashing/one-time reset flows remain mandatory.
- Rate limits fail closed in production when Redis is unavailable and return `Retry-After` on 429 responses.
- API errors include a request ID; server logs avoid request bodies, passwords, bearer URLs, and raw database errors.
- Readiness checks PostgreSQL and Redis availability without returning connection details.

These controls are covered by automated tests but still require staging deployment, reverse-proxy review, dependency patching, and penetration/security review before production.

## Database backups and restore drills

Terraform configures encrypted Aurora storage and automated point-in-time recovery retention via `database_backup_retention_days` (default 14 days, valid 1–35). PostgreSQL and API logs are retained in CloudWatch; API logs default to 30 days. Changes are infrastructure definitions only until an operator reviews/applies the Terraform plan.

Before release, choose and publish an approved RPO/RTO, verify the AWS backup window/retention, and run a restore drill into a separate isolated cluster:

1. Select a recent recovery point and restore to a new cluster/instance; never overwrite the live cluster during a drill.
2. Restrict access to the restored environment and validate schema revision, row counts, order/payment ledger consistency, and application read-only health.
3. Record restore duration, data-loss window, operator, recovery point, and validation results; securely delete the temporary restored resources after approval.
4. Repeat on a defined schedule and after material database/infrastructure changes. Keep Terraform state, snapshots, and exports encrypted and tightly permissioned.

Automated retention is not a tested restore. No backup export, restore, production database change, or Terraform apply was run as part of this implementation.

## Logs and alerts

CloudWatch alarms cover load-balancer API 5xx responses, sustained ECS API CPU, Aurora CPU, a non-empty order-event DLQ, and exhausted transactional-email retries. Optional SNS email alerting requires a confirmed subscription. Container Insights and the API log group remain enabled. Review alert delivery and tune thresholds in staging; add on-call ownership, latency/error SLOs, Redis availability, email backlog/bounce reporting, outbox age, and backup/restore alarms as operational requirements evolve.

Migration `20261111_0023` adds the notification delivery queue and checkout idempotency fields. Apply migrations through `20261111_0023` using the reviewed deployment procedure before rolling out this application. Do not stamp or mutate a populated database without a verified backup and schema/revision comparison.
