"""CRUD endpoints for AgentToken management.

Token management endpoints accept only browser auth (session or JWT cookie).
AgentTokenAuthentication is explicitly excluded so token holders cannot
self-manage — creating or revoking tokens requires an interactive browser
session.
"""

from __future__ import annotations

import hashlib
import secrets
from typing import cast

from django.contrib.auth.models import User
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from api.auth.jwt_auth import JWTCookieAuthentication
from api.models import AgentToken

_TOKEN_PREFIX = "pdagent_"
_BROWSER_AUTH = [SessionAuthentication, JWTCookieAuthentication]


def _generate_token() -> str:
    return _TOKEN_PREFIX + secrets.token_urlsafe(32)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AgentTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentToken
        fields = ["id", "name", "created_at", "last_used_at"]


class AgentTokenCreatedSerializer(serializers.ModelSerializer):
    token = serializers.CharField(read_only=True)

    class Meta:
        model = AgentToken
        fields = ["id", "name", "created_at", "last_used_at", "token"]


@extend_schema(
    methods=["GET"],
    operation_id="agent_tokens_list",
    description="List all active agent tokens for the authenticated user.",
    responses={200: AgentTokenSerializer(many=True)},
)
@extend_schema(
    methods=["POST"],
    operation_id="agent_tokens_create",
    description=(
        "Create a new agent token. The plain-text token is returned in the response "
        "and will not be accessible again — store it securely. Tokens authenticate "
        "via ``Authorization: Bearer pdagent_<token>``."
    ),
    request=serializers.Serializer,
    responses={
        201: AgentTokenCreatedSerializer,
        400: OpenApiResponse(description="Missing or invalid name."),
    },
    examples=[
        OpenApiExample(
            "Create token",
            request_only=True,
            value={"name": "Claude MCP"},
        ),
    ],
)
@api_view(["GET", "POST"])
@authentication_classes(_BROWSER_AUTH)
@permission_classes([IsAuthenticated])
def agent_tokens(request: Request) -> Response:
    user = cast(User, request.user)
    if request.method == "GET":
        tokens = AgentToken.objects.filter(user=user)
        return Response(AgentTokenSerializer(tokens, many=True).data)

    raw_name = request.data.get("name")
    if not isinstance(raw_name, str):
        return Response(
            {"name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST
        )
    name = raw_name.strip()
    if not name:
        return Response(
            {"name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST
        )
    if len(name) > 100:
        return Response(
            {"name": ["Ensure this field has no more than 100 characters."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    plain_text = _generate_token()
    agent_token = AgentToken.objects.create(
        user=user,
        name=name,
        token_hash=_hash_token(plain_text),
    )
    data = AgentTokenSerializer(agent_token).data
    data["token"] = plain_text
    return Response(data, status=status.HTTP_201_CREATED)


@extend_schema(
    methods=["DELETE"],
    operation_id="agent_tokens_destroy",
    description="Revoke (permanently delete) the specified agent token.",
    responses={204: None, 404: OpenApiResponse(description="Token not found.")},
)
@api_view(["DELETE"])
@authentication_classes(_BROWSER_AUTH)
@permission_classes([IsAuthenticated])
def agent_token_detail(request: Request, token_id: str) -> Response:
    user = cast(User, request.user)
    try:
        token = AgentToken.objects.get(id=token_id, user=user)
    except AgentToken.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    token.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
