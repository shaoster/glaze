# ruff: noqa: F401
import hashlib
import json
import os
import re
from collections import defaultdict
from typing import Any, Callable

from django.apps import apps
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, Greatest
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .invitations import make_invite_token, send_invitation_email, verify_invite_token
from .models import (
    AllowedEmail,
    AsyncTask,
    FavoriteGlazeCombination,
    GlazeCombination,
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
    LoginSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    RegisterSerializer,
    TaskSubmissionSerializer,
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)


@extend_schema(request=None, responses={204: None})
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=LoginSerializer, responses={200: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_login(request: Request) -> Response:
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    password = serializer.validated_data["password"]
    user_model = get_user_model()
    matched = user_model.objects.filter(email__iexact=email).first()
    auth_username = matched.username if matched else email
    user = authenticate(request=request, username=auth_username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid email or password."}, status=status.HTTP_400_BAD_REQUEST
        )
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def auth_logout(request: Request) -> Response:
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={200: AuthUserSerializer, 401: None})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def auth_me(request: Request) -> Response:
    return Response(AuthUserSerializer(request.user).data)


@extend_schema(request=GoogleAuthSerializer, responses={200: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_google(request: Request) -> Response:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        return Response(
            {"detail": "Google sign-in is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = GoogleAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    credential = serializer.validated_data["credential"]

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError as e:
        import logging

        logging.getLogger(__name__).error("Google token verification failed: %s", e)
        return Response(
            {"detail": "Invalid Google credential."}, status=status.HTTP_400_BAD_REQUEST
        )

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "")
    first_name = idinfo.get("given_name", "")
    last_name = idinfo.get("family_name", "")
    picture = idinfo.get("picture", "")

    User = get_user_model()

    not_invited = _check_not_invited(email)
    if not_invited:
        return not_invited

    # Look up by Google subject first (handles email changes gracefully).
    profile = (
        UserProfile.objects.filter(openid_subject=google_sub)
        .select_related("user")
        .first()
    )
    if profile:
        user = profile.user
        # Refresh display name and picture in case they changed.
        changed = False
        if picture and profile.profile_image_url != picture:
            profile.profile_image_url = picture
            changed = True
        if changed:
            profile.save()
    else:
        # Fall back to matching by email so existing email/password accounts
        # can sign in via Google without creating a duplicate.
        existing_profile = (
            UserProfile.objects.filter(user__email__iexact=email)
            .select_related("user")
            .first()
        )
        found_user = existing_profile.user if existing_profile else None
        if found_user is None:
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            # No usable password — Google-only account.
            user.set_unusable_password()
            user.save()
        else:
            user = found_user

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.openid_subject = google_sub
        profile.profile_image_url = picture
        profile.save()

    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


@extend_schema(request=RegisterSerializer, responses={201: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_register(request: Request) -> Response:
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user_model = get_user_model()
    email = serializer.validated_data["email"]
    not_invited = _check_not_invited(email)
    if not_invited:
        return not_invited
    if user_model.objects.filter(email__iexact=email).exists():
        return Response(
            {"email": ["A user with this email already exists."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = serializer.save()
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data, status=status.HTTP_201_CREATED)


# ── Allowlist gate ────────────────────────────────────────────────────────────


def _check_not_invited(email: str) -> Response | None:
    """Return a 403 Response if *email* is not approved, else None.

    In dev (IS_PRODUCTION=False) the very first login (no User rows yet) is
    allowed unconditionally and the email is auto-approved so the same account
    can return. Every subsequent login — including a second Google account in
    dev — must have an AllowedEmail row like in production.

    Grandfathering of existing production users is handled once at migration
    time (0012 seeds AllowedEmail from User), not at runtime.
    """
    if AllowedEmail.objects.filter(
        email__iexact=email, status=AllowedEmail.Status.APPROVED
    ).exists():
        return None

    if not settings.IS_PRODUCTION and not get_user_model().objects.exists():
        # Fresh dev environment: bootstrap the first account and pre-approve it.
        AllowedEmail.objects.get_or_create(
            email=email.lower(),
            defaults={"status": AllowedEmail.Status.APPROVED},
        )
        return None

    return Response(
        {
            "detail": "This email is not invited to PotterDoc yet. Ask an admin to add it.",
            "code": "not_invited",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


# ── Invitation endpoints ──────────────────────────────────────────────────────


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAdminUser])
@traced
def admin_invite(request: Request) -> Response:
    email = request.data.get("email", "").strip().lower()
    if not email:
        return Response(
            {"detail": "email is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    AllowedEmail.objects.update_or_create(
        email=email,
        defaults={"status": AllowedEmail.Status.APPROVED},
    )
    token = make_invite_token(email)
    send_invitation_email(email, token)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={200: None})
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def accept_invite(request: Request) -> Response:
    from django.core import signing

    token = request.data.get("token", "")
    try:
        email = verify_invite_token(token)
    except signing.SignatureExpired:
        return Response(
            {"detail": "Invitation link has expired.", "code": "token_expired"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except signing.BadSignature:
        return Response(
            {"detail": "Invalid invitation link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"email": email})


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def waitlist_request(request: Request) -> Response:
    email = request.data.get("email", "").strip().lower()
    if not email:
        return Response(
            {"detail": "email is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    # Never demote an approved row; never create a second row.
    existing = AllowedEmail.objects.filter(email__iexact=email).first()
    if existing is None:
        AllowedEmail.objects.create(email=email, status=AllowedEmail.Status.WAITLISTED)
    return Response(status=status.HTTP_204_NO_CONTENT)
