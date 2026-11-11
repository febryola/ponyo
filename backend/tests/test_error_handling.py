import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.db import get_db
from app.main import app


@pytest.mark.asyncio
@pytest.mark.parametrize("path,status,code", [
    ("/v1/unknown-audit-route", 404, "not_found"),
    ("/v1/auth/login", 405, "method_not_allowed"),
])
async def test_framework_errors_use_api_envelope(path, status, code):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.get(path)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]
    if status == 405:
        assert "POST" in response.headers["Allow"]


@pytest.mark.asyncio
@pytest.mark.parametrize("unexpected", [False, True])
async def test_errors_keep_cors_security_and_trace_headers(unexpected, caplog):
    async def failing_db():
        if unexpected:
            raise RuntimeError("private-database-detail")
        raise HTTPException(503, "Temporarily unavailable.", headers={"Retry-After": "30"})
        yield  # Async dependency, intentionally never yields.

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = failing_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://testserver",
        ) as client:
            response = await client.get("/v1/products", headers={
                "Origin": "http://testserver", "X-Request-ID": "audit-request-123",
            })
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)

    assert response.status_code == (500 if unexpected else 503)
    assert response.headers["Access-Control-Allow-Origin"] == "http://testserver"
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert response.headers["X-Request-ID"] == "audit-request-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.json()["error"]["request_id"] == "audit-request-123"
    assert "private-database-detail" not in response.text
    if unexpected:
        assert "audit-request-123" in caplog.text
        assert "RuntimeError" in caplog.text
        assert "private-database-detail" not in caplog.text
    else:
        assert response.headers["Retry-After"] == "30"