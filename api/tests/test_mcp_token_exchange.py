"""Tests for POST /api/auth/google/exchange-for-agent-token/."""

import hashlib
from types import SimpleNamespace

import httpx
import pytest
from django.contrib.auth.models import User
from django.test.utils import override_settings
from rest_framework.test import APIRequestFactory

from api.auth.mcp_token_views import exchange_for_mcp_agent_token_impl
from api.models import AgentToken, UserProfile

FAKE_SUB = "google-mcp-subject-99999"
FAKE_HASHED_SUB = hashlib.sha256(FAKE_SUB.encode()).hexdigest()

FAKE_PAYLOAD = {
    "sub": FAKE_SUB,
    "iss": "accounts.google.com",
    "aud": "test-client-id",
    "exp": 9999999999,
}


def _FAKE_EXCHANGE(code, redirect_uri):
    return {"id_token": "fake-id-token"}


def _FAKE_VERIFY(id_token):
    return FAKE_PAYLOAD


def _make_request(
    code="authcode", redirect_uri="https://mcp.potterdoc.com/oauth/callback"
):
    factory = APIRequestFactory()
    raw = factory.post(
        "/api/auth/google/exchange-for-agent-token/",
        {"code": code, "redirect_uri": redirect_uri},
        format="json",
    )
    return SimpleNamespace(
        data={"code": code, "redirect_uri": redirect_uri}, _request=raw
    )


@pytest.fixture()
def existing_user(db):
    user = User.objects.create_user(username=FAKE_HASHED_SUB, password=None)
    UserProfile.objects.create(user=user, openid_subject=FAKE_HASHED_SUB)
    return user


@pytest.mark.django_db
def test_happy_path_returns_pdagent_token(existing_user):
    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 201
    token = response.data["token"]
    assert token.startswith("pdagent_")
    assert AgentToken.objects.filter(user=existing_user, name="Claude MCP").count() == 1


@pytest.mark.django_db
def test_reauth_rotates_token(existing_user):
    request = _make_request()
    r1 = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    token1 = r1.data["token"]

    r2 = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    token2 = r2.data["token"]

    assert token1 != token2
    # Only one "Claude MCP" token should exist after rotation.
    assert AgentToken.objects.filter(user=existing_user, name="Claude MCP").count() == 1


@pytest.mark.django_db
def test_unknown_google_account_returns_403(db):
    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 403
    assert "No PotterDoc account" in response.data["detail"]


@pytest.mark.django_db
def test_inactive_user_returns_403(db):
    user = User.objects.create_user(
        username=FAKE_HASHED_SUB, password=None, is_active=False
    )
    UserProfile.objects.create(user=user, openid_subject=FAKE_HASHED_SUB)

    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_google_http_error_returns_400(existing_user):
    def _failing_exchange(code, redirect_uri):
        raise httpx.HTTPError("network error")

    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_failing_exchange,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 400
    assert "Google sign-in failed" in response.data["detail"]


def _exchange_no_id_token(code, redirect_uri):
    return {}


@pytest.mark.django_db
def test_missing_id_token_returns_400(existing_user):
    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_exchange_no_id_token,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 400
    assert "id_token" in response.data["detail"]


@pytest.mark.django_db
def test_invalid_id_token_returns_400(existing_user):
    def _bad_verify(id_token):
        raise ValueError("invalid token")

    request = _make_request()
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_bad_verify,
    )
    assert response.status_code == 400
    assert "Invalid Google credential" in response.data["detail"]


@pytest.mark.django_db
def test_missing_code_returns_400(existing_user):
    factory = APIRequestFactory()
    raw = factory.post(
        "/api/auth/google/exchange-for-agent-token/",
        {"redirect_uri": "https://mcp.potterdoc.com/oauth/callback"},
        format="json",
    )
    request = SimpleNamespace(
        data={"redirect_uri": "https://mcp.potterdoc.com/oauth/callback"}, _request=raw
    )
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 400
    assert "required" in response.data["detail"]


@pytest.mark.django_db
def test_missing_redirect_uri_returns_400(existing_user):
    factory = APIRequestFactory()
    raw = factory.post(
        "/api/auth/google/exchange-for-agent-token/",
        {"code": "authcode"},
        format="json",
    )
    request = SimpleNamespace(data={"code": "authcode"}, _request=raw)
    response = exchange_for_mcp_agent_token_impl(
        request,
        exchange_auth_code=_FAKE_EXCHANGE,
        verify_id_token=_FAKE_VERIFY,
    )
    assert response.status_code == 400
    assert "required" in response.data["detail"]


@pytest.mark.django_db
@override_settings(GOOGLE_OAUTH_CLIENT_ID="", GOOGLE_OAUTH_CLIENT_SECRET="")
def test_google_not_configured_returns_503(client):
    response = client.post(
        "/api/auth/google/exchange-for-agent-token/",
        data={
            "code": "authcode",
            "redirect_uri": "https://mcp.potterdoc.com/oauth/callback",
        },
        content_type="application/json",
    )
    assert response.status_code == 503
