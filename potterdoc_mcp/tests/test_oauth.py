"""Tests for the MCP server's OAuth 2.0 Authorization Server endpoints."""

from __future__ import annotations

import urllib.parse
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from potterdoc_mcp.__main__ import _auth_codes, _build_http_app, _pkce_challenge


@pytest.fixture(autouse=True)
def clear_auth_codes():
    """Ensure the in-memory store is clean between tests."""
    _auth_codes.clear()
    yield
    _auth_codes.clear()


@pytest.fixture()
def client():
    return TestClient(_build_http_app(), raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Metadata document
# ---------------------------------------------------------------------------


def test_oauth_metadata(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    response = client.get("/.well-known/oauth-authorization-server")
    assert response.status_code == 200
    body = response.json()
    assert body["issuer"] == "https://mcp.example.com"
    assert body["authorization_endpoint"] == "https://mcp.example.com/oauth/authorize"
    assert body["token_endpoint"] == "https://mcp.example.com/oauth/token"
    assert "S256" in body["code_challenge_methods_supported"]
    assert "authorization_code" in body["grant_types_supported"]


# ---------------------------------------------------------------------------
# /oauth/authorize
# ---------------------------------------------------------------------------


def test_authorize_redirects_to_google(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-google-client-id")

    response = client.get(
        "/oauth/authorize",
        params={
            "redirect_uri": "https://claude.ai/oauth/callback",
            "state": "client-state-xyz",
            "code_challenge": "abc123challenge",
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert "accounts.google.com/o/oauth2/v2/auth" in location
    parsed = urllib.parse.urlparse(location)
    params = dict(urllib.parse.parse_qsl(parsed.query))
    assert params["client_id"] == "test-google-client-id"
    assert params["redirect_uri"] == "https://mcp.example.com/oauth/callback"
    assert params["response_type"] == "code"
    assert "openid" in params["scope"]


def test_authorize_rejects_disallowed_redirect_uri(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "gid")
    # No OAUTH_ALLOWED_REDIRECT_URI_PREFIXES override → default is https://claude.ai/

    response = client.get(
        "/oauth/authorize",
        params={
            "redirect_uri": "https://evil.com/steal",
            "state": "s1",
            "code_challenge": "ch1",
        },
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_request"


def test_authorize_stores_state(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "gid")

    response = client.get(
        "/oauth/authorize",
        params={
            "redirect_uri": "https://claude.ai/cb",
            "state": "s1",
            "code_challenge": "ch1",
        },
        follow_redirects=False,
    )
    assert response.status_code == 302
    # One state entry should have been created.
    state_keys = [k for k in _auth_codes if k.startswith("state:")]
    assert len(state_keys) == 1
    data = _auth_codes[state_keys[0]]
    assert data["client_redirect_uri"] == "https://claude.ai/cb"
    assert data["client_state"] == "s1"
    assert data["code_challenge"] == "ch1"


# ---------------------------------------------------------------------------
# /oauth/callback
# ---------------------------------------------------------------------------


def _fake_potterdoc_response(token: str = "pdagent_faketoken123"):
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {"token": token}
    return mock_resp


def _seed_state(
    nonce: str,
    client_redirect_uri: str = "https://claude.ai/cb",
    client_state: str = "cstate",
    code_challenge: str = "",
    ttl: float = 300,
):
    import time

    _auth_codes[f"state:{nonce}"] = {
        "client_redirect_uri": client_redirect_uri,
        "client_state": client_state,
        "code_challenge": code_challenge,
        "expires_at": time.monotonic() + ttl,
    }


def test_callback_happy_path(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    monkeypatch.setenv("POTTERDOC_API_URL", "https://api.example.com")
    _seed_state(
        "testnonce", client_redirect_uri="https://claude.ai/cb", client_state="cs1"
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_http = AsyncMock()
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_http.post = AsyncMock(return_value=_fake_potterdoc_response())
        mock_client_cls.return_value = mock_http

        response = client.get(
            "/oauth/callback",
            params={"code": "google-auth-code", "state": "testnonce"},
            follow_redirects=False,
        )

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://claude.ai/cb")
    parsed_params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(location).query))
    assert "code" in parsed_params
    assert parsed_params["state"] == "cs1"

    # Auth code must now be in the store.
    auth_code = parsed_params["code"]
    assert auth_code in _auth_codes
    assert _auth_codes[auth_code]["token"] == "pdagent_faketoken123"


def test_callback_invalid_state_returns_400(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    response = client.get(
        "/oauth/callback",
        params={"code": "someCode", "state": "no-such-nonce"},
    )
    assert response.status_code == 400


def test_callback_google_error_param_returns_400(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    response = client.get(
        "/oauth/callback",
        params={"error": "access_denied", "state": "nonce"},
    )
    assert response.status_code == 400


def test_callback_potterdoc_failure_redirects_with_error(client, monkeypatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://mcp.example.com")
    monkeypatch.setenv("POTTERDOC_API_URL", "https://api.example.com")
    _seed_state(
        "testnonce2", client_redirect_uri="https://claude.ai/cb", client_state="cs2"
    )

    mock_resp = MagicMock()
    mock_resp.is_success = False
    mock_resp.json.return_value = {"detail": "No PotterDoc account found."}

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_http = AsyncMock()
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_http.post = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_http

        response = client.get(
            "/oauth/callback",
            params={"code": "google-auth-code", "state": "testnonce2"},
            follow_redirects=False,
        )

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://claude.ai/cb")
    params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(location).query))
    assert params["error"] == "access_denied"


# ---------------------------------------------------------------------------
# /oauth/token
# ---------------------------------------------------------------------------


def _seed_auth_code(
    code: str,
    token: str = "pdagent_mytoken",
    code_challenge: str = "",
    ttl: float = 300,
):
    import time

    _auth_codes[code] = {
        "token": token,
        "code_challenge": code_challenge,
        "expires_at": time.monotonic() + ttl,
    }


def test_token_exchange_no_pkce(client):
    _seed_auth_code("mycode", token="pdagent_abc")
    response = client.post(
        "/oauth/token",
        data={"grant_type": "authorization_code", "code": "mycode"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "pdagent_abc"
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0


def test_token_exchange_with_valid_pkce(client):
    verifier = "my-secret-verifier-string-long-enough-to-be-valid"
    challenge = _pkce_challenge(verifier)
    _seed_auth_code("pkce-code", token="pdagent_pkce", code_challenge=challenge)

    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": "pkce-code",
            "code_verifier": verifier,
        },
    )
    assert response.status_code == 200
    assert response.json()["access_token"] == "pdagent_pkce"


def test_token_exchange_wrong_verifier_returns_invalid_grant(client):
    verifier = "correct-verifier"
    challenge = _pkce_challenge(verifier)
    _seed_auth_code("pkce-code2", token="pdagent_pkce2", code_challenge=challenge)

    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": "pkce-code2",
            "code_verifier": "wrong-verifier",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_token_exchange_invalid_code_returns_invalid_grant(client):
    response = client.post(
        "/oauth/token",
        data={"grant_type": "authorization_code", "code": "no-such-code"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_token_exchange_code_is_single_use(client):
    _seed_auth_code("one-time", token="pdagent_once")
    r1 = client.post(
        "/oauth/token",
        data={"grant_type": "authorization_code", "code": "one-time"},
    )
    assert r1.status_code == 200
    r2 = client.post(
        "/oauth/token",
        data={"grant_type": "authorization_code", "code": "one-time"},
    )
    assert r2.status_code == 400
    assert r2.json()["error"] == "invalid_grant"


def test_token_unsupported_grant_type(client):
    response = client.post(
        "/oauth/token",
        data={"grant_type": "client_credentials", "code": "whatever"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "unsupported_grant_type"


def test_expired_code_returns_invalid_grant(client):
    import time

    _auth_codes["expired-code"] = {
        "token": "pdagent_old",
        "code_challenge": "",
        "expires_at": time.monotonic() - 1,  # already expired
    }
    response = client.post(
        "/oauth/token",
        data={"grant_type": "authorization_code", "code": "expired-code"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"
