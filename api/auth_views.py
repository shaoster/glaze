# ruff: noqa: F401
import hashlib
import json
import logging
import posixpath
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any, Callable, cast
from urllib.parse import urlparse
from zipfile import ZIP_DEFLATED, ZipFile

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

from .auth_account_views import _delete_account_impl, auth_export
from .auth_google_views import (
    _exchange_google_auth_code,
    _verify_google_id_token,
    auth_google_impl,
)
from .auth_invite_views import staff_invite_code, validate_invite
from .auth_preferences_views import auth_preferences
from .dev_bootstrap import bootstrap_dev_user
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
)
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
    responses={204: None},
    description=(
        "Permanently delete the current user's account and all associated data. "
        "This action cannot be undone. Download your data first via GET /api/auth/export/. "
        "The session is invalidated before deletion. Cloudinary-hosted images are "
        "removed from this database but Cloudinary assets are cleaned up separately "
        "by the admin cleanup tool."
    ),
)
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
@traced
def auth_delete_account(request: Request) -> Response:
    return _delete_account_impl(request, logout_fn=logout)


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            "AppInit",
            fields={
                "googleOauthClientId": drf_serializers.CharField(),
                "user": drf_serializers.JSONField(allow_null=True),
            },
        ),
        503: None,
    },
    description="Bootstrap response: public config plus the current user if authenticated.",
)
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
@traced
def auth_me(request: Request) -> Response:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        return Response(
            {"detail": "Authentication provider is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    user = request.user if request.user.is_authenticated else None
    if user is not None and getattr(settings, "SESSION_COOKIE_DOMAIN", None):
        # Re-issue the authenticated session with the shared parent-domain
        # cookie so the admin subdomain can receive the same login state.
        request.session.modified = True
    admin_host = settings.ADMIN_INGRESS_HOST
    return Response(
        {
            "googleOauthClientId": client_id,
            "adminBaseUrl": (
                f"https://{admin_host}"
                if (request.user.is_staff and admin_host)
                else None
            ),
            "user": AuthUserSerializer(user).data if user else None,
        }
    )


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
    return auth_google_impl(
        request,
        exchange_auth_code=_exchange_google_auth_code,
        verify_id_token=_verify_google_id_token,
        login_fn=login,
    )
