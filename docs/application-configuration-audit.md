# Application configuration audit — 2026-11-11

Scope: running local Next.js/FastAPI/SQLite application plus source configuration. No production deployment, external payment call, or database migration/stamp was performed.

## Summary

| Requirement | Verified implementation | Remaining qualification |
| --- | --- | --- |
| Frontend/backend communication | Shared typed API client; separate browser proxy and absolute server fetch URL; credentialed cookies, CSRF, explicit CORS origins. Local frontend and product proxy return 200. | Development tunnel/proxy is temporary. Configure deployed API origins, cookies and private SSR URL as appropriate; a build alone does not establish production connectivity. |
| REST API structure | Seven routers mounted under `/v1`; request schemas, HTTP methods/status codes, pagination, auth guards. Running OpenAPI exposes 26 distinct paths. | Many response models are `dict`, not strict Pydantic response schemas. Next.js local adapters are separate from the FastAPI contract and do not all use its error envelope. |
| Database connection | Async SQLAlchemy sessions, pre-ping, bounded pool/recycle and environment settings. Local `SELECT 1` succeeds. SQLite foreign keys enabled per connection during this audit. | PostgreSQL/Aurora/Redis production connectivity and failover were not exercised. Health checks verify connectivity only. |
| Database schema | 16 ORM tables, relationships, UUID keys, unique constraints/indexes and 14 Alembic revisions. Live local tables/columns exist; Alembic metadata comparison with `compare_type=True` reports no differences. Local foreign-key check reports zero violations. | Local database has **no Alembic version record**. Metadata comparison did not compare server defaults and is not migration certification. Full chain targets PostgreSQL, not SQLite. |
| Centralized error handling | Shared backend envelope, structured business errors, validation errors and sanitized 500s. Fixed framework 404/405 handling, exception header preservation, and CORS/request IDs on unexpected failures. Added Next.js render-error retry fallback. | Error reporting service/alerts and root-layout global fallback are not configured. Event handlers still need component-level handling. Never automatically retry a non-idempotent mutation. |

## Reproduced defects and fixes

Four regression cases failed before the backend patch:

- Framework 404 and 405 returned FastAPI's default `detail` shape, not the documented error envelope.
- Exception headers such as `Retry-After` were discarded.
- Unexpected 500 responses lacked CORS and request/security headers, masking API failures as browser network errors.

The handler now also handles Starlette HTTP exceptions (FastAPI exceptions inherit from them), preserves exception headers, and catches unexpected request errors before returning through CORS. Sanitized logs include request ID and exception type only.

SQLite declared foreign keys but did not enforce them. The SQLAlchemy connect listener now turns enforcement on for each application SQLite connection. An isolated test proves orphan references are rejected; a read-only audit found no existing local violations.

## Database migration caveat

A fresh in-memory SQLite migration experiment successfully applied revisions 0001–0005, then failed at 0006 on PostgreSQL's `id::text` syntax. This is a dialect limitation, not evidence that the PostgreSQL migration fails. Do not rewrite applied migration history or run the full chain against the populated unversioned local database as a workaround.

Before production sign-off:

1. Run the entire chain on a fresh PostgreSQL staging database, then compare schema to ORM metadata.
2. Verify upgrade from the intended existing production baseline and the restore/backup procedure.
3. Reconcile any populated unversioned database only after backup and explicit schema/default/constraint comparison; stamp only when equivalence has been proven.
4. Verify deployed frontend/API/database/Redis connectivity and operational monitoring with production-shaped configuration.

## Validation performed

- Backend: **93 tests passed**, including five new error/connection regression cases.
- API client: **5 tests passed** for relative browser URLs, SSR absolute URLs, private overrides and production configuration errors.
- TypeScript, targeted ESLint and `git diff --check`: passed.
- Live local `/v1/health`, frontend `/`, `/shop`, and `/ponyo-api/v1/products?locale=ja`: **200**.
- Running `/openapi.json`: **26 distinct paths**.
- Existing SQLite data was inspected read-only; no schema migration, data reset or Alembic stamp was performed.

These results establish a functioning local foundation, not complete production certification.