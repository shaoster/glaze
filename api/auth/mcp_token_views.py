"""Exchange a Google OAuth code for a PotterDoc AgentToken (MCP OAuth flow).

This endpoint is the server-side leg of the MCP server's OAuth 2.0 front-end.
The MCP server redirects users to Google, then calls this endpoint with the
resulting Google auth code. A named AgentToken is rotated and the plain-text
value is returned once for the MCP server to forward as the OAuth access_token.
"""

from __future__ import annotations

import hashlib

import httpx
from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from api.models import AgentToken, UserProfile

from .agent_token_views import _generate_token, _hash_token
from .google_views import (
    GoogleAuthThrottle,
    _exchange_google_auth_code,
    _verify_google_id_token,
)

_MCP_TOKEN_NAME = "Claude MCP"


def exchange_for_mcp_agent_token_impl(
    request: Request,
    *,
    exchange_auth_code=_exchange_google_auth_code,
    verify_id_token=_verify_google_id_token,
) -> Response:
    """Core logic — injectable deps for testability."""
    code = request.data.get("code") if isinstance(request.data, dict) else None
    redirect_uri = (
        request.data.get("redirect_uri") if isinstance(request.data, dict) else None
    )

    if not code or not redirect_uri:
        return Response(
            {"detail": "code and redirect_uri are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token_response = exchange_auth_code(code, redirect_uri)
    except httpx.HTTPError:
        return Response(
            {"detail": "Google sign-in failed. Please try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    id_token = token_response.get("id_token", "")
    if not id_token:
        return Response(
            {"detail": "Google did not return an id_token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        payload = verify_id_token(id_token)
    except ValueError:
        return Response(
            {"detail": "Invalid Google credential."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    google_sub = payload["sub"]
    hashed_sub = hashlib.sha256(google_sub.encode()).hexdigest()

    profile = (
        UserProfile.objects.filter(openid_subject=hashed_sub)
        .select_related("user")
        .first()
    )

    if not profile or not profile.user.is_active:
        return Response(
            {"detail": "No PotterDoc account found for this Google account."},
            status=status.HTTP_403_FORBIDDEN,
        )

    user = profile.user

    # Rotate: delete any existing "Claude MCP" tokens, then issue a fresh one.
    AgentToken.objects.filter(user=user, name=_MCP_TOKEN_NAME).delete()

    plain_text = _generate_token()
    AgentToken.objects.create(
        user=user,
        name=_MCP_TOKEN_NAME,
        token_hash=_hash_token(plain_text),
    )

    return Response({"token": plain_text}, status=status.HTTP_201_CREATED)


@extend_schema(
    request=inline_serializer(
        "McpAgentTokenExchange",
        fields={
            "code": serializers.CharField(),
            "redirect_uri": serializers.CharField(),
        },
    ),
    responses={
        201: inline_serializer(
            "McpAgentTokenResponse",
            fields={"token": serializers.CharField()},
        ),
        400: OpenApiResponse(description="Invalid or missing Google auth code."),
        403: OpenApiResponse(description="Google account has no PotterDoc account."),
        503: OpenApiResponse(description="Google OAuth not configured on this server."),
    },
    description=(
        "Exchange a Google OAuth 2.0 authorization code for a PotterDoc AgentToken "
        "named 'Claude MCP'. Intended for use by the MCP server's OAuth callback. "
        "Rotates any existing 'Claude MCP' token for the user. "
        "Only existing PotterDoc users are accepted — no account creation."
    ),
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([GoogleAuthThrottle])
def exchange_for_mcp_agent_token(request: Request) -> Response:
    """Exchange a Google OAuth code for a named PotterDoc AgentToken (MCP flow)."""
    if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
        return Response(
            {"detail": "Google sign-in is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return exchange_for_mcp_agent_token_impl(request)
