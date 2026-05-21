# ruff: noqa: F401
import base64
import hashlib
import json
import logging
import os
import re
import time
from collections import defaultdict
from typing import Any, Callable, cast

import httpx
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.db import transaction
from django.db.models import DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, Greatest
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import (
    AsyncTask,
    FavoriteGlazeCombination,
    GlazeCombination,
    InviteCode,
    Piece,
    PieceState,
    UserProfile,
)
from .serializer_registry import (
    _GLOBAL_ENTRY_SERIALIZERS,  # auto-generated in _register_globals(); hand-written serializers overwrite
)
from .serializers import (
    AsyncTaskSerializer,
    AuthUserSerializer,
    GlazeCombinationImageEntrySerializer,
    GoogleAuthSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    TaskSubmissionSerializer,
    UserPreferencesSerializer,
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)

logger = logging.getLogger(__name__)


@extend_schema(
    request=None,
    responses={204: None},
    description="Set the CSRF cookie. Call this before any POST/PATCH/DELETE request from a browser client.",
)
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=None,
    responses={204: None},
    description="Log out the current session.",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def auth_logout(request: Request) -> Response:
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=None,
    responses={200: AuthUserSerializer, 401: None},
    description="Return the currently authenticated user. Returns 401 if not logged in.",
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def auth_me(request: Request) -> Response:
    return Response(AuthUserSerializer(request.user).data)


@extend_schema(
    request=UserPreferencesSerializer,
    responses={200: UserPreferencesSerializer},
    description="Return or update the current user's saved preferences.",
)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@traced
def auth_preferences(request: Request) -> Response:
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    if request.method == "GET":
        return Response(
            {
                "preferences": profile.preferences
                if isinstance(profile.preferences, dict)
                else {}
            }
        )

    serializer = UserPreferencesSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "preferences" in serializer.validated_data:
        existing_preferences = cast(
            dict[str, Any],
            profile.preferences if isinstance(profile.preferences, dict) else {},
        )
        incoming_preferences = cast(
            dict[str, Any], serializer.validated_data["preferences"]
        )
        merged_preferences: dict[str, Any] = {
            **existing_preferences,
            **incoming_preferences,
        }
        if "tutorials" in incoming_preferences:
            existing_tutorials = existing_preferences.get("tutorials")
            incoming_tutorials = incoming_preferences.get("tutorials")
            if isinstance(existing_tutorials, dict) and isinstance(
                incoming_tutorials, dict
            ):
                merged_preferences["tutorials"] = {
                    **cast(dict[str, Any], existing_tutorials),
                    **cast(dict[str, Any], incoming_tutorials),
                }
        profile.preferences = merged_preferences
        profile.save(update_fields=["preferences"])
    return Response(
        {
            "preferences": profile.preferences
            if isinstance(profile.preferences, dict)
            else {}
        }
    )


def _exchange_google_auth_code(code: str, redirect_uri: str) -> dict:
    """Exchange an OAuth 2.0 authorization code for tokens at Google's token endpoint."""
    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    resp.raise_for_status()
    return resp.json()


def _verify_google_id_token(id_token: str) -> dict:
    """Decode and verify a Google id_token JWT. Returns the payload dict."""
    parts = id_token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed id_token")

    # Pad and decode the payload (middle segment)
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception as exc:
        raise ValueError(f"Cannot decode id_token payload: {exc}") from exc

    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    iss = payload.get("iss", "")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError(f"Unexpected iss: {iss}")
    if payload.get("aud") != client_id:
        raise ValueError("aud mismatch")
    if payload.get("exp", 0) < time.time():
        raise ValueError("id_token expired")

    return payload


@extend_schema(
    request=GoogleAuthSerializer,
    responses={200: AuthUserSerializer},
    description=(
        "Exchange a Google OAuth 2.0 authorization code and log in. "
        "New users must supply a valid invite_code. "
        "Returns 503 if Google OAuth is not configured on this server."
    ),
)
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_google(request: Request) -> Response:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
    if not client_id or not client_secret:
        return Response(
            {"detail": "Google sign-in is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = GoogleAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    code = serializer.validated_data["code"]
    redirect_uri = serializer.validated_data["redirect_uri"]
    invite_code_value = serializer.validated_data.get("invite_code")

    try:
        token_response = _exchange_google_auth_code(code, redirect_uri)
    except httpx.HTTPError as exc:
        logger.error("Google token exchange failed: %s", exc)
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
        payload = _verify_google_id_token(id_token)
    except ValueError as exc:
        logger.error("Google id_token verification failed: %s", exc)
        return Response(
            {"detail": "Invalid Google credential."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    google_sub = payload["sub"]
    hashed_sub = hashlib.sha256(google_sub.encode()).hexdigest()

    User = get_user_model()

    # Look up existing user by hashed subject.
    profile = (
        UserProfile.objects.filter(openid_subject=hashed_sub)
        .select_related("user")
        .first()
    )

    if profile:
        user = profile.user
    else:
        # New user — invite code required.
        invite_code = _consume_invite_code(invite_code_value)
        if invite_code is None:
            return Response(
                {
                    "detail": "A valid invite code is required to create an account.",
                    "code": "invite_required",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            user = User.objects.create_user(
                username=hashed_sub,
                email="",
                first_name="",
                last_name="",
            )
            user.set_unusable_password()
            user.save()
            UserProfile.objects.create(user=user, openid_subject=hashed_sub)
            invite_code.used_at = timezone.now()
            invite_code.used_by = user
            invite_code.save(update_fields=["used_at", "used_by"])

    # Dev bootstrap: promote first user to staff/superuser and seed sample data.
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


def _consume_invite_code(code_value: str | None) -> InviteCode | None:
    """Return the InviteCode if *code_value* is valid, else None.

    Does NOT mark it used — the caller handles that inside a transaction.
    Uses select_for_update to prevent concurrent redemptions.
    """
    if not code_value:
        return None
    try:
        invite = InviteCode.objects.select_for_update().get(code=code_value)
    except (InviteCode.DoesNotExist, Exception):
        return None
    return invite if invite.is_valid else None


# ── Invite validation (public) ────────────────────────────────────────────────


@extend_schema(
    request=None,
    responses={200: None},
    description="Validate a UUID invite code. Returns {valid: true} if usable.",
)
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def validate_invite(request: Request) -> Response:
    code_value = request.data.get("code", "")
    if not code_value:
        return Response(
            {"detail": "code is required.", "code": "code_required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        invite = InviteCode.objects.get(code=code_value)
    except InviteCode.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired invite code.", "code": "invalid_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not invite.is_valid:
        return Response(
            {
                "detail": "This invite code has already been used or has expired.",
                "code": "invalid_code",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"valid": True})


# ── Staff invite management ───────────────────────────────────────────────────


def _get_or_create_active_invite_code() -> InviteCode:
    active = (
        InviteCode.objects.filter(used_at__isnull=True, expires_at__gt=timezone.now())
        .order_by("-created_at")
        .first()
    )
    if active:
        return active
    return InviteCode.objects.create()


@extend_schema(
    request=None,
    responses={200: None},
    description="(Staff only) Get the current active invite code, creating one if none exists.",
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
@traced
def staff_invite_code(request: Request) -> Response:
    if request.method == "POST":
        invite = InviteCode.objects.create()
    else:
        invite = _get_or_create_active_invite_code()
    return Response(
        {"code": str(invite.code), "expires_at": invite.expires_at.isoformat()}
    )
