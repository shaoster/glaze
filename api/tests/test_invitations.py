import time

import pytest
from django.contrib.auth.models import User
from django.core import mail, signing
from django.test import override_settings
from rest_framework.test import APIClient

from api.invitations import _INVITE_SALT, make_invite_token, verify_invite_token
from api.models import AllowedEmail


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="admin@example.com",
        email="admin@example.com",
        password="adminpass",
    )


@pytest.fixture
def admin_client(admin_user):
    c = APIClient()
    c.force_authenticate(user=admin_user)
    return c


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="regular@example.com",
        email="regular@example.com",
        password="regularpass",
    )


@pytest.fixture
def regular_client(regular_user):
    c = APIClient()
    c.force_authenticate(user=regular_user)
    return c


# ── Token mechanics ───────────────────────────────────────────────────────────


def test_make_and_verify_token(db):
    token = make_invite_token("test@example.com")
    assert verify_invite_token(token) == "test@example.com"


def test_expired_token_raises(db, monkeypatch):
    token = make_invite_token("test@example.com")
    _real_time = time.time()
    monkeypatch.setattr(time, "time", lambda: _real_time + 8 * 24 * 3600)
    with pytest.raises(signing.SignatureExpired):
        verify_invite_token(token)


def test_tampered_token_raises(db):
    with pytest.raises(signing.BadSignature):
        verify_invite_token("tampered.token.value")


def test_wrong_kind_token_raises(db):
    # A validly-signed token with a different kind must be rejected so tokens
    # from other signing contexts (e.g., password-reset) can't be used as invites.
    wrong_kind = signing.dumps(
        {"email": "test@example.com", "kind": "password-reset"}, salt=_INVITE_SALT
    )
    with pytest.raises(signing.BadSignature):
        verify_invite_token(wrong_kind)


# ── admin-invite endpoint ─────────────────────────────────────────────────────


def test_admin_invite_requires_admin(db, regular_client):
    resp = regular_client.post(
        "/api/auth/admin-invite/", {"email": "new@example.com"}, format="json"
    )
    assert resp.status_code == 403


def test_admin_invite_unauthenticated(db, anon_client):
    resp = anon_client.post(
        "/api/auth/admin-invite/", {"email": "new@example.com"}, format="json"
    )
    assert resp.status_code in (401, 403)


def test_admin_invite_creates_allowedemail_and_sends_email(db, admin_client):
    resp = admin_client.post(
        "/api/auth/admin-invite/", {"email": "invited@example.com"}, format="json"
    )
    assert resp.status_code == 204
    row = AllowedEmail.objects.get(email="invited@example.com")
    assert row.status == AllowedEmail.Status.APPROVED
    assert len(mail.outbox) == 1
    assert "invited@example.com" in mail.outbox[0].to
    assert "invite" in mail.outbox[0].body.lower()


def test_admin_invite_promotes_waitlisted(db, admin_client):
    AllowedEmail.objects.create(
        email="waiting@example.com", status=AllowedEmail.Status.WAITLISTED
    )
    resp = admin_client.post(
        "/api/auth/admin-invite/", {"email": "waiting@example.com"}, format="json"
    )
    assert resp.status_code == 204
    row = AllowedEmail.objects.get(email="waiting@example.com")
    assert row.status == AllowedEmail.Status.APPROVED


def test_admin_invite_email_contains_token(db, admin_client):
    admin_client.post(
        "/api/auth/admin-invite/", {"email": "tokentest@example.com"}, format="json"
    )
    body = mail.outbox[0].body
    assert "token=" in body
    # Extract token from URL and verify it decodes correctly.
    token = body.split("token=")[1].split()[0]
    assert verify_invite_token(token) == "tokentest@example.com"


def test_admin_invite_resends_to_already_approved(db, admin_client):
    # Re-sending to an already-approved row is intentional: admins use this to
    # resend a lost link without needing to change the row's status.
    AllowedEmail.objects.create(
        email="resend@example.com", status=AllowedEmail.Status.APPROVED
    )
    resp = admin_client.post(
        "/api/auth/admin-invite/", {"email": "resend@example.com"}, format="json"
    )
    assert resp.status_code == 204
    assert len(mail.outbox) == 1
    assert "resend@example.com" in mail.outbox[0].to
    # Status must not have changed.
    assert (
        AllowedEmail.objects.get(email="resend@example.com").status
        == AllowedEmail.Status.APPROVED
    )


# ── accept-invite endpoint ────────────────────────────────────────────────────


def test_accept_invite_valid_token(db, anon_client):
    token = make_invite_token("accepted@example.com")
    resp = anon_client.post("/api/auth/accept-invite/", {"token": token}, format="json")
    assert resp.status_code == 200
    assert resp.data["email"] == "accepted@example.com"


def test_accept_invite_expired_token(db, anon_client, monkeypatch):
    token = make_invite_token("exp@example.com")
    _real_time = time.time()
    monkeypatch.setattr(time, "time", lambda: _real_time + 8 * 24 * 3600)
    resp = anon_client.post("/api/auth/accept-invite/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert resp.data["code"] == "token_expired"


def test_accept_invite_tampered_token(db, anon_client):
    resp = anon_client.post(
        "/api/auth/accept-invite/", {"token": "bad.token"}, format="json"
    )
    assert resp.status_code == 400
    assert resp.data["code"] == "token_invalid"


# ── waitlist endpoint ─────────────────────────────────────────────────────────


def test_waitlist_creates_row(db, anon_client):
    resp = anon_client.post(
        "/api/auth/waitlist/", {"email": "hopeful@example.com"}, format="json"
    )
    assert resp.status_code == 204
    row = AllowedEmail.objects.get(email="hopeful@example.com")
    assert row.status == AllowedEmail.Status.WAITLISTED


def test_waitlist_idempotent(db, anon_client):
    anon_client.post("/api/auth/waitlist/", {"email": "dup@example.com"}, format="json")
    resp = anon_client.post(
        "/api/auth/waitlist/", {"email": "dup@example.com"}, format="json"
    )
    assert resp.status_code == 204
    assert AllowedEmail.objects.filter(email="dup@example.com").count() == 1


def test_waitlist_does_not_demote_approved(db, anon_client):
    AllowedEmail.objects.create(
        email="approved@example.com", status=AllowedEmail.Status.APPROVED
    )
    anon_client.post(
        "/api/auth/waitlist/", {"email": "approved@example.com"}, format="json"
    )
    row = AllowedEmail.objects.get(email="approved@example.com")
    assert row.status == AllowedEmail.Status.APPROVED


# ── Allowlist gate ────────────────────────────────────────────────────────────

PROD = override_settings(IS_PRODUCTION=True)


@PROD
def test_gate_blocks_unknown_email_in_prod(db, anon_client):
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "unknown@example.com",
            "password": "testpass123",
            "username": "unknown",
        },
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "not_invited"


@PROD
def test_gate_allows_approved_email(db, anon_client):
    AllowedEmail.objects.create(
        email="approved@example.com", status=AllowedEmail.Status.APPROVED
    )
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "Approved@Example.com",
            "password": "testpass123",
            "username": "Approved@Example.com",
        },
        format="json",
    )
    # 201 = registered, or 400 if duplicate — either way not 403
    assert resp.status_code != 403


@PROD
def test_gate_blocks_waitlisted_email(db, anon_client):
    AllowedEmail.objects.create(
        email="waiting@example.com", status=AllowedEmail.Status.WAITLISTED
    )
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "waiting@example.com",
            "password": "testpass123",
            "username": "waiting@example.com",
        },
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "not_invited"


@PROD
def test_gate_grandfathers_existing_user(db, anon_client):
    # Grandfathering happens at migration time: the 0012 migration creates an
    # AllowedEmail row for every existing User. Simulate that here — a User with
    # a corresponding approved AllowedEmail row must pass the gate.
    User.objects.create_user(
        username="existing@example.com",
        email="existing@example.com",
        password="pass",
    )
    AllowedEmail.objects.create(
        email="existing@example.com", status=AllowedEmail.Status.APPROVED
    )
    client = APIClient()
    resp = client.post(
        "/api/auth/login/",
        {"email": "existing@example.com", "password": "pass"},
        format="json",
    )
    assert resp.status_code == 200


@PROD
def test_gate_hides_account_existence_from_uninvited_callers(db, anon_client):
    # Account enumeration protection: re-registering a known email without an
    # AllowedEmail row must return 403, not 400 ("already exists"). The gate
    # fires before the duplicate check so callers can't probe for existing accounts.
    User.objects.create_user(
        username="taken@example.com", email="taken@example.com", password="x"
    )
    resp = anon_client.post(
        "/api/auth/register/",
        {"email": "taken@example.com", "password": "testpass123"},
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "not_invited"


@PROD
def test_gate_blocks_email_without_allowedemail_row(db, anon_client):
    # A User row alone does NOT grandfather — AllowedEmail is the authority.
    # Use a fresh username so the serializer passes and only the gate can block.
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "norow@example.com",
            "password": "testpass123",
            "username": "norow@example.com",
        },
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "not_invited"


def test_gate_allows_first_user_in_dev(db, anon_client):
    # IS_PRODUCTION=False: first login (no users yet) bypasses the gate.
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "first@example.com",
            "password": "testpass123",
            "username": "first@example.com",
        },
        format="json",
    )
    assert resp.status_code in (200, 201)
    # The email must now be in AllowedEmail so the account can return.
    assert AllowedEmail.objects.filter(
        email="first@example.com", status=AllowedEmail.Status.APPROVED
    ).exists()


def test_gate_blocks_second_user_in_dev(db, anon_client):
    # IS_PRODUCTION=False: once any user exists, the gate enforces normally.
    User.objects.create_user(
        username="first@example.com", email="first@example.com", password="x"
    )
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "second@example.com",
            "password": "testpass123",
            "username": "second@example.com",
        },
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "not_invited"


@PROD
def test_gate_case_insensitive(db, anon_client):
    AllowedEmail.objects.create(
        email="CaseMix@Example.com", status=AllowedEmail.Status.APPROVED
    )
    resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "casemix@example.com",
            "password": "testpass123",
            "username": "casemix@example.com",
        },
        format="json",
    )
    assert resp.status_code != 403


# ── End-to-end: invite → accept → register ───────────────────────────────────


@PROD
def test_invite_flow_end_to_end(db, admin_client, anon_client):
    # Admin sends invite
    resp = admin_client.post(
        "/api/auth/admin-invite/", {"email": "newuser@example.com"}, format="json"
    )
    assert resp.status_code == 204
    # Extract token from email
    body = mail.outbox[0].body
    token = body.split("token=")[1].split()[0]
    # Accept invite
    accept_resp = anon_client.post(
        "/api/auth/accept-invite/", {"token": token}, format="json"
    )
    assert accept_resp.status_code == 200
    assert accept_resp.data["email"] == "newuser@example.com"
    # Register with that email
    reg_resp = anon_client.post(
        "/api/auth/register/",
        {
            "email": "newuser@example.com",
            "password": "securepass123",
            "username": "newuser@example.com",
        },
        format="json",
    )
    assert reg_resp.status_code == 201
