"""Smoke tests for the HTTP transport mode."""

from __future__ import annotations

from starlette.testclient import TestClient

from potterdoc_mcp.__main__ import _build_http_app

_INITIALIZE_PAYLOAD = {
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"},
    },
    "id": 1,
}


def test_health_endpoint() -> None:
    client = TestClient(_build_http_app(), raise_server_exceptions=True)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_mcp_missing_token_returns_401() -> None:
    """MCP request without Authorization header is rejected with 401 before dispatch."""
    http_client = TestClient(_build_http_app(), raise_server_exceptions=False)
    response = http_client.post("/mcp", json=_INITIALIZE_PAYLOAD)
    assert response.status_code == 401


def test_mcp_with_bearer_token_passes_auth() -> None:
    """MCP request with a Bearer token passes the auth middleware and reaches MCP app."""
    with TestClient(
        _build_http_app(),
        base_url="http://localhost:8080",
        raise_server_exceptions=True,
    ) as http_client:
        response = http_client.post(
            "/mcp",
            json=_INITIALIZE_PAYLOAD,
            headers={"Authorization": "Bearer pdagent_testtoken"},
        )
        assert response.status_code == 406
