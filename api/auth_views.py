# ruff: noqa: F401
import hashlib
import json
import os
import re
from collections import defaultdict
from typing import Callable

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

from .models import (
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
def auth_logout(request: Request) -> Response:
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={200: AuthUserSerializer, 401: None})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def auth_me(request: Request) -> Response:
    return Response(AuthUserSerializer(request.user).data)


@extend_schema(request=GoogleAuthSerializer, responses={200: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
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
def auth_register(request: Request) -> Response:
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user_model = get_user_model()
    if user_model.objects.filter(
        email__iexact=serializer.validated_data["email"]
    ).exists():
        return Response(
            {"email": ["A user with this email already exists."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = serializer.save()
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data, status=status.HTTP_201_CREATED)
