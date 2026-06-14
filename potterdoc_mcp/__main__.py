"""Entry point: python -m potterdoc_mcp"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import os
import secrets
import time
import urllib.parse
from typing import Any

import httpx

from potterdoc_mcp.server import mcp

# ---------------------------------------------------------------------------
# In-memory auth code store
# ---------------------------------------------------------------------------
# Maps opaque keys to their associated data. Two key shapes are used:
#   "state:<nonce>"  — pending Google redirect; value holds the OAuth client's
#                      redirect_uri, state, and PKCE challenge.
#   "<auth_code>"    — issued after Google callback; value holds the pdagent_
#                      token and PKCE challenge for /oauth/token to consume.
#
# Both expire after _AUTH_CODE_TTL seconds (monotonic). On pod restart all
# pending flows fail gracefully; users simply re-authorize.
_auth_codes: dict[str, dict[str, Any]] = {}
_AUTH_CODE_TTL = 300  # 5 minutes


def _now() -> float:
    return time.monotonic()


def _purge_expired() -> None:
    now = _now()
    expired = [k for k, v in _auth_codes.items() if v["expires_at"] < now]
    for k in expired:
        del _auth_codes[k]


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


# ---------------------------------------------------------------------------
# HTTP app builder
# ---------------------------------------------------------------------------


def _build_http_app():
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse, RedirectResponse, Response
    from starlette.routing import Mount, Route

    class BearerAuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next) -> Response:
            if request.url.path.startswith("/mcp"):
                auth = request.headers.get("authorization", "")
                token = auth.removeprefix("Bearer ").removeprefix("bearer ").strip()
                if not token:
                    return JSONResponse(
                        {"detail": "Authorization Bearer token required."},
                        status_code=401,
                    )
            return await call_next(request)

    async def health(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    # ------------------------------------------------------------------
    # OAuth 2.0 Authorization Server endpoints
    # ------------------------------------------------------------------

    async def oauth_metadata(request: Request) -> JSONResponse:
        base = os.environ.get("MCP_BASE_URL", "https://mcp.potterdoc.com")
        return JSONResponse(
            {
                "issuer": base,
                "authorization_endpoint": f"{base}/oauth/authorize",
                "token_endpoint": f"{base}/oauth/token",
                "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code"],
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["none"],
            }
        )

    async def oauth_authorize(request: Request) -> Response:
        base = os.environ.get("MCP_BASE_URL", "https://mcp.potterdoc.com")
        google_client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
        # Comma-separated URI prefixes that may appear as redirect_uri. Prevents
        # open-redirect + auth-code theft: without this an attacker could craft a
        # link with redirect_uri=https://evil.com, complete the Google flow on the
        # victim's behalf, and claim their pdagent_ token from /oauth/token.
        allowed_prefixes = [
            p.strip()
            for p in os.environ.get(
                "OAUTH_ALLOWED_REDIRECT_URI_PREFIXES", "https://claude.ai/"
            ).split(",")
            if p.strip()
        ]

        client_redirect_uri = request.query_params.get("redirect_uri", "")
        if not any(client_redirect_uri.startswith(p) for p in allowed_prefixes):
            return JSONResponse(
                {
                    "error": "invalid_request",
                    "error_description": "redirect_uri not allowed",
                },
                status_code=400,
            )

        client_state = request.query_params.get("state", "")
        code_challenge = request.query_params.get("code_challenge", "")

        nonce = secrets.token_urlsafe(24)
        _auth_codes[f"state:{nonce}"] = {
            "client_redirect_uri": client_redirect_uri,
            "client_state": client_state,
            "code_challenge": code_challenge,
            "expires_at": _now() + _AUTH_CODE_TTL,
        }

        google_params = urllib.parse.urlencode(
            {
                "client_id": google_client_id,
                "redirect_uri": f"{base}/oauth/callback",
                "response_type": "code",
                "scope": "openid email",
                "state": nonce,
                "prompt": "select_account",
            }
        )
        return RedirectResponse(
            f"https://accounts.google.com/o/oauth2/v2/auth?{google_params}",
            status_code=302,
        )

    async def oauth_callback(request: Request) -> Response:
        base = os.environ.get("MCP_BASE_URL", "https://mcp.potterdoc.com")
        api_url = os.environ.get("POTTERDOC_API_URL", "https://potterdoc.com")

        google_code = request.query_params.get("code", "")
        nonce = request.query_params.get("state", "")
        error = request.query_params.get("error", "")

        if error:
            return JSONResponse(
                {"detail": f"Google auth error: {error}"}, status_code=400
            )

        state_key = f"state:{nonce}"
        state_data = _auth_codes.pop(state_key, None)
        if not state_data or state_data["expires_at"] < _now():
            return JSONResponse(
                {"detail": "Invalid or expired state parameter."}, status_code=400
            )

        client_redirect_uri = state_data["client_redirect_uri"]
        client_state = state_data["client_state"]
        code_challenge = state_data["code_challenge"]

        async with httpx.AsyncClient() as http:
            resp = await http.post(
                f"{api_url}/api/auth/google/exchange-for-agent-token/",
                json={
                    "code": google_code,
                    "redirect_uri": f"{base}/oauth/callback",
                },
                timeout=15.0,
            )

        if not resp.is_success:
            error_params = urllib.parse.urlencode(
                {
                    "error": "access_denied",
                    "error_description": "Authentication failed.",
                    "state": client_state,
                }
            )
            return RedirectResponse(
                f"{client_redirect_uri}?{error_params}", status_code=302
            )

        pdagent_token: str = resp.json()["token"]

        auth_code = secrets.token_urlsafe(32)
        _auth_codes[auth_code] = {
            "token": pdagent_token,
            "code_challenge": code_challenge,
            "expires_at": _now() + _AUTH_CODE_TTL,
        }
        _purge_expired()

        success_params = urllib.parse.urlencode(
            {"code": auth_code, "state": client_state}
        )
        return RedirectResponse(
            f"{client_redirect_uri}?{success_params}", status_code=302
        )

    async def oauth_token(request: Request) -> JSONResponse:
        form = await request.form()
        auth_code = str(form.get("code", ""))
        code_verifier = str(form.get("code_verifier", ""))
        grant_type = str(form.get("grant_type", ""))

        if grant_type != "authorization_code":
            return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

        _purge_expired()
        code_data = _auth_codes.pop(auth_code, None)
        if not code_data or code_data["expires_at"] < _now():
            return JSONResponse({"error": "invalid_grant"}, status_code=400)

        expected_challenge = code_data.get("code_challenge", "")
        if expected_challenge:
            if not code_verifier:
                return JSONResponse({"error": "invalid_grant"}, status_code=400)
            actual_challenge = _pkce_challenge(code_verifier)
            if not hmac.compare_digest(actual_challenge, expected_challenge):
                return JSONResponse({"error": "invalid_grant"}, status_code=400)

        return JSONResponse(
            {
                "access_token": code_data["token"],
                "token_type": "bearer",
                # Agent tokens are long-lived; signal a generous TTL so clients
                # don't proactively refresh (there is no refresh endpoint).
                "expires_in": 365 * 24 * 3600,
            }
        )

    return Starlette(
        middleware=[Middleware(BearerAuthMiddleware)],
        routes=[
            Route("/health", health),
            Route(
                "/.well-known/oauth-authorization-server",
                oauth_metadata,
            ),
            Route("/oauth/authorize", oauth_authorize),
            Route("/oauth/callback", oauth_callback),
            Route("/oauth/token", oauth_token, methods=["POST"]),
            Mount("/", mcp.streamable_http_app()),
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    args = parser.parse_args()

    if args.transport == "http":
        import uvicorn

        uvicorn.run(_build_http_app(), host="0.0.0.0", port=8080)
    else:
        mcp.run()


if __name__ == "__main__":
    main()
