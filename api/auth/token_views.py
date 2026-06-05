"""JWT access-token endpoints for the migration away from session-only auth."""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpResponseBase
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from typing import cast

from backend.otel import traced

_AUTH_TOKEN_NAME = "AuthToken"
_REFRESH_COOKIE_NAME = "potterdoc_refresh"
_REFRESH_COOKIE_MAX_AGE = int(timedelta(days=30).total_seconds())


def _refresh_cookie_domain() -> str | None:
    return getattr(settings, "SESSION_COOKIE_DOMAIN", None)


def _set_refresh_cookie(response: HttpResponseBase, refresh_token: RefreshToken) -> None:
    domain = _refresh_cookie_domain()
    if domain:
        response.set_cookie(
            _REFRESH_COOKIE_NAME,
            str(refresh_token),
            httponly=True,
            secure=getattr(settings, "SESSION_COOKIE_SECURE", False),
            samesite="Strict",
            path="/api/auth/",
            max_age=_REFRESH_COOKIE_MAX_AGE,
            domain=domain,
        )
        return

    response.set_cookie(
        _REFRESH_COOKIE_NAME,
        str(refresh_token),
        httponly=True,
        secure=getattr(settings, "SESSION_COOKIE_SECURE", False),
        samesite="Strict",
        path="/api/auth/",
        max_age=_REFRESH_COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: HttpResponseBase) -> None:
    domain = _refresh_cookie_domain()
    if domain:
        response.delete_cookie(
            _REFRESH_COOKIE_NAME,
            path="/api/auth/",
            domain=domain,
        )
        return

    response.delete_cookie(
        _REFRESH_COOKIE_NAME,
        path="/api/auth/",
    )


def _issue_access_token_response(refresh_token: RefreshToken) -> Response:
    return Response(
        {"accessToken": str(refresh_token.access_token)},
    )


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            _AUTH_TOKEN_NAME,
            fields={
                "accessToken": drf_serializers.CharField(),
            },
        )
    },
    description=(
        "Issue an access token for the current authenticated session and set a "
        "long-lived httpOnly refresh cookie."
    ),
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def auth_token(request: Request) -> Response:
    """Issue a fresh access token for the authenticated user."""
    refresh_token = RefreshToken.for_user(cast(User, request.user))
    response = _issue_access_token_response(refresh_token)
    set_refresh_cookie(response, refresh_token)
    return response


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            _AUTH_TOKEN_NAME,
            fields={
                "accessToken": drf_serializers.CharField(),
            },
        ),
        401: None,
    },
    description="Exchange the refresh cookie for a new access token.",
)
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_token_refresh(request: Request) -> Response:
    """Return a new access token if the refresh cookie is still valid."""
    raw_refresh_token = request.COOKIES.get(_REFRESH_COOKIE_NAME)
    if not raw_refresh_token:
        return Response(
            {"detail": "Refresh token cookie is missing."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        refresh_token = RefreshToken(raw_refresh_token)  # type: ignore[arg-type]
    except TokenError:
        return Response(
            {"detail": "Refresh token cookie is invalid or expired."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return _issue_access_token_response(refresh_token)


@extend_schema(
    request=None,
    responses={204: None},
    description="Clear the refresh cookie without touching the session.",
)
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def auth_token_revoke(request: Request) -> Response:
    """Clear the refresh cookie used for silent re-authentication."""
    response = Response(status=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


def clear_refresh_cookie(response: HttpResponseBase) -> None:
    """Delete the refresh cookie from a response object."""
    _clear_refresh_cookie(response)


def set_refresh_cookie(
    response: HttpResponseBase, refresh_token: RefreshToken
) -> None:
    """Attach a refresh token cookie to an auth response."""
    _set_refresh_cookie(response, refresh_token)
