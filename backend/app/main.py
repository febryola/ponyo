import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.db import engine
from app.outbox import publish_outbox_events
from app.routers import auth, checkout, content, localization, orders, products, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.environment = settings.environment
    app.state.redis = None
    outbox_task = None
    try:
        from redis.asyncio import Redis

        redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        app.state.redis = redis_client
    except Exception:
        if settings.environment == "production":
            raise RuntimeError("Redis must be available in production for API rate limits.") from None
        app.state.redis = None
    if settings.sqs_order_events_url:
        outbox_task = asyncio.create_task(publish_outbox_events())
    try:
        yield
    finally:
        if outbox_task:
            outbox_task.cancel()
            try:
                await outbox_task
            except asyncio.CancelledError:
                pass
    if app.state.redis is not None:
        await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(title="Ponyo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, error: HTTPException):
    message = error.detail if isinstance(error.detail, str) else "Request could not be completed."
    code = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "validation_error", 429: "rate_limited", 503: "service_unavailable"}.get(error.status_code, "request_error")
    if isinstance(error.detail, dict):
        message = error.detail.get("message", message)
        code = error.detail.get("code", code)
    return JSONResponse(status_code=error.status_code, content={"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None)}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, _error: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Check the submitted fields and try again.", "request_id": getattr(request.state, "request_id", None)}})


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, _error: Exception):
    # Full exception details belong in structured server logs, not in public responses.
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "The Ponyo service could not complete this request.", "request_id": getattr(request.state, "request_id", None)}})


app.include_router(auth.router, prefix="/v1")
app.include_router(products.router, prefix="/v1")
app.include_router(localization.router, prefix="/v1")
app.include_router(orders.router, prefix="/v1")
app.include_router(checkout.router, prefix="/v1")
app.include_router(content.router, prefix="/v1")
app.include_router(webhooks.router, prefix="/v1")


@app.get("/v1/health")
async def health():
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return {"data": {"status": "ok", "environment": settings.environment}}
