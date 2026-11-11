"""Customer authentication contract; SQLite tests are not concurrency stress tests."""

import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import jwt
import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.main import app
from app.models import Customer, PasswordResetToken
from app.security import (
    create_session_token,
    get_authenticated_customer,
    hash_password,
    require_roles,
    verify_password,
)
from test_api import (
    auth_post,
    csrf_token,
    registration_payload,
    safe_auth_email_and_cookies,  # noqa: F401 -- imported fixtures apply here too
    seed_customer_session,
    test_client,  # noqa: F401
)


pytestmark = pytest.mark.usefixtures("safe_auth_email_and_cookies")
PASSWORD = "valid-password-123"
NEW_PASSWORD = "replacement-password-456"
ROLES = ("customer", "supplier", "admin")


def signed_session(customer_id, *, omit=(), **claims):
    """Sign adversarial claims, so rejection cannot be attributed to bad signing."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id), "iss": settings.jwt_issuer,
        "iat": now, "exp": now + timedelta(minutes=10), "ver": 0,
        **claims,
    }
    for key in omit:
        payload.pop(key, None)
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def use_session(client, token):
    # Clear host-scoped cookies from login before installing a replay token.
    client.cookies.clear()
    if token is not None:
        # Match http.cookiejar's effective host for http://testserver, so a
        # server-issued deletion also removes a manually installed cookie.
        client.cookies.set(settings.session_cookie_name, token, domain="testserver.local", path="/")


async def set_account(session_factory, customer_id, **values):
    async with session_factory() as db:
        customer = await db.get(Customer, customer_id)
        for key, value in values.items():
            setattr(customer, key, value)
        await db.commit()


async def add_reset_token(session_factory, customer_id):
    token = uuid4().hex + uuid4().hex
    async with session_factory() as db:
        record = PasswordResetToken(
            customer_id=customer_id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(record)
        await db.commit()
        return token, record.id


@pytest.fixture
async def role_client(test_client):
    """Exercise real dependencies without registering routes on the shared app."""
    local_app = FastAPI()
    local_app.dependency_overrides = app.dependency_overrides.copy()
    assert get_db in local_app.dependency_overrides

    def add_route(path, allowed):
        async def endpoint(customer=Depends(require_roles(*allowed))):
            return {"id": str(customer.id), "role": customer.role}

        local_app.add_api_route(path, endpoint, methods=["GET"])

    for role in ROLES:
        add_route(f"/{role}", (role,))
    add_route("/staff", ("supplier", "admin"))
    add_route("/nobody", ())
    async with AsyncClient(
        transport=ASGITransport(app=local_app), base_url="http://testserver",
    ) as client:
        yield client, local_app


@pytest.mark.asyncio
async def test_persisted_customer_role_and_auth_version_defaults(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        assert customer.role == "customer"
        assert customer.auth_version == 0


@pytest.mark.asyncio
async def test_registration_defaults_are_pending_customer_and_zero_version(test_client):
    client, factory = test_client
    response = await auth_post(client, "register", registration_payload())
    assert response.status_code == 200
    async with factory() as db:
        customer = await db.scalar(select(Customer))
        assert customer.role == "customer"
        assert customer.auth_version == 0
        assert customer.email_verified is False


@pytest.mark.asyncio
async def test_customer_login_and_profile_expose_additive_role_and_current_version(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    await set_account(factory, customer_id, auth_version=7)
    use_session(client, None)
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": PASSWORD})
    assert login.status_code == 200
    assert login.json()["data"]["customer"] == {
        "id": str(customer_id), "firstName": "Test", "lastName": "Buyer",
        "email": "buyer@example.com", "role": "customer",
    }
    token = client.cookies.get(settings.session_cookie_name)
    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
    assert claims["ver"] == 7
    profile = await client.get("/v1/auth/me")
    assert profile.status_code == 200
    assert profile.json()["data"] == login.json()["data"]["customer"]
    updated = await client.patch(
        "/v1/auth/me", headers={"X-CSRF-Token": await csrf_token(client)},
        json={"firstName": "Updated", "lastName": "Buyer"},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["role"] == "customer"
    assert updated.json()["data"]["firstName"] == "Updated"


@pytest.mark.parametrize("auth_version", [0, 9])
def test_session_token_contains_required_claims_and_version(auth_version):
    customer_id = uuid4()
    token = create_session_token(customer_id, auth_version=auth_version)
    payload = jwt.decode(
        token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer,
        options={"require": ["sub", "iss", "iat", "exp"]},
    )
    assert payload["sub"] == str(customer_id)
    assert payload["ver"] == auth_version
    assert payload["exp"] > payload["iat"]


def test_session_token_default_version_is_zero():
    payload = jwt.decode(
        create_session_token(uuid4()), settings.jwt_secret,
        algorithms=["HS256"], issuer=settings.jwt_issuer,
    )
    assert payload["ver"] == 0


@pytest.mark.parametrize("field,value", [
    ("role", "admin"), ("auth_version", 99), ("email_verified", True),
    ("authVersion", 99), ("emailVerified", True),
])
@pytest.mark.parametrize("operation", ["register", "profile"])
@pytest.mark.asyncio
async def test_mass_assignment_is_rejected_without_database_changes(test_client, operation, field, value):
    client, factory = test_client
    if operation == "register":
        response = await auth_post(client, "register", registration_payload(**{field: value}))
        async with factory() as db:
            assert await db.scalar(select(Customer)) is None
    else:
        customer_id = await seed_customer_session(client, factory)
        response = await client.patch(
            "/v1/auth/me", headers={"X-CSRF-Token": await csrf_token(client)},
            json={"firstName": "Injected", "lastName": "Buyer", field: value},
        )
        async with factory() as db:
            customer = await db.get(Customer, customer_id)
            assert (customer.first_name, customer.role, customer.auth_version, customer.email_verified) == (
                "Test", "customer", 0, True,
            )
    assert response.status_code == 422


@pytest.mark.parametrize("role", ["supplier", "admin"])
@pytest.mark.parametrize("path", ["/v1/auth/me", "/v1/cart"])
@pytest.mark.asyncio
async def test_database_role_change_immediately_blocks_customer_routes(test_client, role, path):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    assert (await client.get(path)).status_code == 200
    await set_account(factory, customer_id, role=role)
    assert (await client.get(path)).status_code == 403
    await set_account(factory, customer_id, role="customer")
    assert (await client.get(path)).status_code == 200


@pytest.mark.parametrize("account_role", ROLES)
@pytest.mark.parametrize("required_role", ROLES)
@pytest.mark.asyncio
async def test_require_roles_exact_membership_without_inheritance(test_client, role_client, account_role, required_role):
    client, factory = test_client
    restricted, _ = role_client
    customer_id = await seed_customer_session(client, factory)
    await set_account(factory, customer_id, role=account_role)
    use_session(restricted, create_session_token(customer_id))
    response = await restricted.get(f"/{required_role}")
    assert response.status_code == (200 if account_role == required_role else 403)
    if response.status_code == 200:
        assert response.json() == {"id": str(customer_id), "role": account_role}


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.asyncio
async def test_require_roles_multiple_roles_and_empty_policy(test_client, role_client, role):
    client, factory = test_client
    restricted, _ = role_client
    customer_id = await seed_customer_session(client, factory)
    await set_account(factory, customer_id, role=role)
    use_session(restricted, create_session_token(customer_id))
    assert (await restricted.get("/staff")).status_code == (200 if role in ("supplier", "admin") else 403)
    assert (await restricted.get("/nobody")).status_code == 403


@pytest.mark.asyncio
async def test_require_roles_unknown_account_role_fails_closed(role_client):
    restricted, local_app = role_client

    async def unknown_account():
        # Bypass storage constraints solely to exercise the dependency's deny path.
        return SimpleNamespace(id=uuid4(), role="superadmin", email_verified=True, auth_version=0)

    local_app.dependency_overrides[get_authenticated_customer] = unknown_account
    for path in ("/customer", "/supplier", "/admin", "/staff", "/nobody"):
        assert (await restricted.get(path)).status_code == 403


@pytest.mark.parametrize("forged_role", ["admin", "supplier", "superadmin"])
@pytest.mark.asyncio
async def test_signed_token_role_claims_cannot_escalate_database_customer(test_client, role_client, forged_role):
    client, factory = test_client
    restricted, _ = role_client
    customer_id = await seed_customer_session(client, factory)
    token = signed_session(customer_id, role=forged_role, roles=["admin", "supplier"])
    use_session(restricted, token)
    assert (await restricted.get("/admin")).status_code == 403
    assert (await restricted.get("/supplier")).status_code == 403
    assert (await restricted.get("/customer")).status_code == 200
    use_session(client, token)
    profile = await client.get("/v1/auth/me")
    assert profile.status_code == 200
    assert profile.json()["data"]["role"] == "customer"


@pytest.mark.asyncio
async def test_supplier_cannot_forge_customer_role_to_enter_storefront(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    await set_account(factory, customer_id, role="supplier")
    use_session(client, signed_session(customer_id, role="customer", roles=["customer"]))
    for path in ("/v1/auth/me", "/v1/cart"):
        assert (await client.get(path)).status_code == 403


@pytest.mark.parametrize("missing", ["exp", "iat", "sub", "iss"])
@pytest.mark.asyncio
async def test_missing_required_jwt_claim_is_unauthorized(test_client, missing):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    use_session(client, signed_session(customer_id, omit=(missing,)))
    assert (await client.get("/v1/auth/me")).status_code == 401


@pytest.mark.parametrize("claims", [
    {"exp": 1}, {"iss": "wrong-issuer"}, {"sub": "not-a-uuid"},
    {"sub": None}, {"sub": 123}, {"sub": str(uuid4())},
    {"iat": 4102444800}, {"ver": 1},
])
@pytest.mark.asyncio
async def test_invalid_or_revoked_signed_sessions_are_unauthorized(test_client, claims):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    use_session(client, signed_session(customer_id, **claims))
    assert (await client.get("/v1/auth/me")).status_code == 401


@pytest.mark.parametrize("token", [None, "not.a.jwt"])
@pytest.mark.asyncio
async def test_missing_or_malformed_session_is_unauthorized(test_client, role_client, token):
    client, _ = test_client
    restricted, _ = role_client
    use_session(client, token)
    use_session(restricted, token)
    assert (await client.get("/v1/auth/me")).status_code == 401
    assert (await restricted.get("/admin")).status_code == 401


@pytest.mark.asyncio
async def test_wrong_signature_is_unauthorized(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    claims = jwt.decode(signed_session(customer_id), options={"verify_signature": False})
    use_session(client, jwt.encode(claims, "not-the-configured-secret-" + "x" * 32, algorithm="HS256"))
    assert (await client.get("/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_legacy_session_without_version_only_works_at_database_version_zero(test_client):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    use_session(client, signed_session(customer_id, omit=("ver",)))
    assert (await client.get("/v1/auth/me")).status_code == 200
    await set_account(factory, customer_id, auth_version=1)
    assert (await client.get("/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_verification_is_checked_from_database_on_every_request(test_client, role_client):
    client, factory = test_client
    restricted, _ = role_client
    customer_id = await seed_customer_session(client, factory)
    use_session(restricted, create_session_token(customer_id))
    assert (await restricted.get("/customer")).status_code == 200
    await set_account(factory, customer_id, email_verified=False)
    assert (await restricted.get("/customer")).status_code == 403
    assert (await client.get("/v1/auth/me")).status_code == 403
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": PASSWORD})
    assert login.status_code == 403


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.asyncio
async def test_logout_revokes_all_same_account_sessions_only(test_client, role):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    await set_account(factory, customer_id, role=role)
    first = signed_session(customer_id, jti="device-one")
    second = signed_session(customer_id, jti="device-two")
    other_id = await seed_customer_session(client, factory, email="other@example.com")
    other_token = create_session_token(other_id)
    use_session(client, first)
    response = await auth_post(client, "logout", {})
    assert response.status_code == 200
    assert response.json()["data"]["accepted"] is True
    assert client.cookies.get(settings.session_cookie_name) is None
    assert client.cookies.get(settings.csrf_cookie_name) is None
    for token in (first, second):
        use_session(client, token)
        assert (await client.get("/v1/auth/me")).status_code == 401
    use_session(client, other_token)
    assert (await client.get("/v1/auth/me")).status_code == 200
    async with factory() as db:
        assert (await db.get(Customer, customer_id)).auth_version == 1
        assert (await db.get(Customer, other_id)).auth_version == 0
    use_session(client, None)
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": PASSWORD})
    if role != "customer":
        assert login.status_code == 403
        assert client.cookies.get(settings.session_cookie_name) is None
        return
    assert login.status_code == 200
    payload = jwt.decode(
        client.cookies.get(settings.session_cookie_name), settings.jwt_secret,
        algorithms=["HS256"], issuer=settings.jwt_issuer,
    )
    assert payload["ver"] == 1
    assert login.json()["data"]["customer"]["role"] == role


@pytest.mark.parametrize("session_kind", ["anonymous", "expired", "malformed"])
@pytest.mark.asyncio
async def test_logout_without_valid_authentication_still_clears_cookies(test_client, session_kind):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    token = {
        "anonymous": None, "expired": signed_session(customer_id, exp=1),
        "malformed": "not.a.jwt",
    }[session_kind]
    use_session(client, token)
    response = await auth_post(client, "logout", {})
    assert response.status_code == 200
    assert client.cookies.get(settings.session_cookie_name) is None
    assert client.cookies.get(settings.csrf_cookie_name) is None
    async with factory() as db:
        assert (await db.get(Customer, customer_id)).auth_version == 0


@pytest.mark.parametrize("verified", [True, False])
@pytest.mark.asyncio
async def test_reset_revokes_sessions_consumes_siblings_and_preserves_verification(test_client, verified):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory, verified=verified)
    first_session = signed_session(customer_id, jti="one")
    second_session = signed_session(customer_id, jti="two")
    token, token_id = await add_reset_token(factory, customer_id)
    sibling, sibling_id = await add_reset_token(factory, customer_id)
    other_id = await seed_customer_session(client, factory, email="other@example.com")
    other_token, other_token_id = await add_reset_token(factory, other_id)
    other_session = create_session_token(other_id)
    use_session(client, first_session)
    response = await auth_post(client, "password-reset/confirm", {"token": token, "password": NEW_PASSWORD})
    assert response.status_code == 200
    for old_session in (first_session, second_session):
        use_session(client, old_session)
        assert (await client.get("/v1/auth/me")).status_code == 401
    for consumed in (token, sibling):
        response = await auth_post(client, "password-reset/confirm", {"token": consumed, "password": "another-password-789"})
        assert response.status_code == 400
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        assert customer.auth_version == 1
        assert customer.email_verified is verified
        assert verify_password(NEW_PASSWORD, customer.password_hash)
        assert not verify_password(PASSWORD, customer.password_hash)
        assert (await db.get(PasswordResetToken, token_id)).used_at is not None
        assert (await db.get(PasswordResetToken, sibling_id)).used_at is not None
        assert (await db.get(PasswordResetToken, other_token_id)).used_at is None
        assert (await db.get(Customer, other_id)).auth_version == 0
    use_session(client, other_session)
    assert (await client.get("/v1/auth/me")).status_code == 200
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": NEW_PASSWORD})
    assert login.status_code == (200 if verified else 403)
    # A different customer's reset link remains usable, not just unused in storage.
    response = await auth_post(client, "password-reset/confirm", {"token": other_token, "password": NEW_PASSWORD})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_lost_atomic_reset_claim_does_not_change_password_or_version(test_client, monkeypatch):
    """Controlled lost-claim branch, not evidence of concurrent locking behavior."""
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    token, token_id = await add_reset_token(factory, customer_id)
    sibling, sibling_id = await add_reset_token(factory, customer_id)
    original_scalar = AsyncSession.scalar
    claims = []

    async def lost_claim(db, statement, *args, **kwargs):
        if getattr(statement, "is_update", False) and statement.table.name == PasswordResetToken.__tablename__:
            claims.append(statement)
            return None
        return await original_scalar(db, statement, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "scalar", lost_claim)
        response = await auth_post(client, "password-reset/confirm", {"token": token, "password": NEW_PASSWORD})
    assert claims, "Reset must atomically claim the token with UPDATE ... RETURNING"
    assert response.status_code == 400
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        assert verify_password(PASSWORD, customer.password_hash)
        assert customer.auth_version == 0
        assert (await db.get(PasswordResetToken, token_id)).used_at is None
        assert (await db.get(PasswordResetToken, sibling_id)).used_at is None
    assert (await client.get("/v1/auth/me")).status_code == 200
    assert sibling != token


@pytest.mark.asyncio
async def test_reset_delivery_failure_is_private_and_only_invalidates_new_token(test_client, monkeypatch):
    client, factory = test_client
    customer_id = await seed_customer_session(client, factory)
    old_token, old_id = await add_reset_token(factory, customer_id)
    deliveries = []

    async def delivery_failed(email, url):
        deliveries.append((email, url))
        return False

    monkeypatch.setattr("app.routers.auth.send_password_reset_email", delivery_failed)
    known = await auth_post(client, "password-reset", {"email": "buyer@example.com"})
    unknown = await auth_post(client, "password-reset", {"email": "absent@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {"data": {"accepted": True}}
    assert len(deliveries) == 1
    undelivered = parse_qs(urlparse(deliveries[0][1]).query)["token"][0]
    async with factory() as db:
        records = list(await db.scalars(select(PasswordResetToken)))
        assert len(records) == 2
        failed = next(record for record in records if record.id != old_id)
        assert failed.token_hash == hashlib.sha256(undelivered.encode()).hexdigest()
        assert failed.used_at is not None
        assert (await db.get(PasswordResetToken, old_id)).used_at is None
        customer = await db.get(Customer, customer_id)
        assert customer.auth_version == 0
        assert verify_password(PASSWORD, customer.password_hash)
    response = await auth_post(client, "password-reset/confirm", {"token": undelivered, "password": NEW_PASSWORD})
    assert response.status_code == 400
    response = await auth_post(client, "password-reset/confirm", {"token": old_token, "password": NEW_PASSWORD})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_reset_link_uses_public_storefront_not_first_frontend_origin(test_client, monkeypatch):
    client, factory = test_client
    await seed_customer_session(client, factory)
    deliveries = []

    async def capture(email, url):
        deliveries.append((email, url))
        return True

    monkeypatch.setattr(settings, "storefront_base_url", "https://shop.example.com/")
    monkeypatch.setattr(settings, "frontend_origins", "http://internal.test:3000,https://shop.example.com")
    monkeypatch.setattr("app.routers.auth.send_password_reset_email", capture)
    response = await auth_post(client, "password-reset", {"email": "buyer@example.com"})
    assert response.status_code == 200
    assert len(deliveries) == 1
    email, url = deliveries[0]
    assert email == "buyer@example.com"
    parsed = urlparse(url)
    assert (parsed.scheme, parsed.netloc, parsed.path) == (
        "https", "shop.example.com", "/account/reset-password",
    )
    token = parse_qs(parsed.query)["token"][0]
    async with factory() as db:
        record = await db.scalar(select(PasswordResetToken))
        assert record.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert record.used_at is None


def test_argon2_password_hashes_are_salted_and_verify_passwords():
    first, second = hash_password(PASSWORD), hash_password(PASSWORD)
    assert first.startswith("$argon2id$")
    assert second.startswith("$argon2id$")
    assert first != second
    for password_hash in (first, second):
        assert verify_password(PASSWORD, password_hash) is True
        assert verify_password("wrong-password-999", password_hash) is False