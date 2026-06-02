"""Google OAuth login flow for the Glaze API.

Public helper entry points in this module are traced so login behavior remains
observable at the module boundary.
"""

import hashlib
from typing import Any, cast

import httpx
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..dev.bootstrap import bootstrap_dev_user
from ..models import InviteCode, UserProfile
from ..serializers import AuthUserSerializer, GoogleAuthSerializer


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
    """Verify a Google id_token JWT and return the payload dict.

    Uses google-auth's verify_token which fetches Google's public keys and
    validates the RSA signature, iss, aud, and exp.
    """
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    return cast(
        dict[Any, Any],
        google_id_token.verify_token(
            id_token,
            google_requests.Request(),
            audience=settings.GOOGLE_OAUTH_CLIENT_ID,
            certs_url="https://www.googleapis.com/oauth2/v3/certs",
        ),
    )


@traced
def auth_google_impl(
    request: Request,
    *,
    exchange_auth_code=_exchange_google_auth_code,
    verify_id_token=_verify_google_id_token,
    login_fn=login,
) -> Response:
    """Run the Google OAuth login flow and return the authenticated user payload."""
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

    User = get_user_model()

    profile = (
        UserProfile.objects.filter(openid_subject=hashed_sub)
        .select_related("user")
        .first()
    )

    if profile:
        user = profile.user
    else:
        dev_mode = getattr(settings, "DEV_BOOTSTRAP_ENABLED", False)

        if not dev_mode:
            if not invite_code_value:
                return Response(
                    {
                        "detail": "A valid invite code is required to create an account.",
                        "code": "invite_required",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                try:
                    invite_code = InviteCode.objects.select_for_update().get(
                        code=invite_code_value
                    )
                except InviteCode.DoesNotExist:
                    invite_code = None

                if invite_code is None or not invite_code.is_valid:
                    return Response(
                        {
                            "detail": "A valid invite code is required to create an account.",
                            "code": "invite_required",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                user = User.objects.create_user(
                    username=hashed_sub,
                    email="",
                    first_name="",
                    last_name="",
                    password=None,
                )
                UserProfile.objects.create(user=user, openid_subject=hashed_sub)
                # Delete (not mark) the code on redemption so no code↔account
                # tuple survives in the database. The row lock above keeps this
                # single-use under concurrent redemption. See issue #740.
                invite_code.delete()
        else:
            user = User.objects.create_user(
                username=hashed_sub,
                email="",
                first_name="",
                last_name="",
                password=None,
            )
            UserProfile.objects.create(user=user, openid_subject=hashed_sub)

    bootstrap_dev_user(user)
    login_fn(getattr(request, "_request", request), user)
    return Response(AuthUserSerializer(user).data)


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
    """Exchange a Google OAuth code and log the user in."""
    return auth_google_impl(request)
