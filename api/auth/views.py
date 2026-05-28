"""Compatibility wrappers for auth endpoints.

Public wrapper functions in this module keep the stable import surface visible
while the actual implementations live in focused feature submodules.
"""

from django.conf import settings
from django.contrib.auth import logout
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..serializers import AuthUserSerializer
from .account_views import delete_account_impl as auth_delete_account
from .export_views import auth_export
from .google_views import auth_google
from .invite_views import staff_invite_code, validate_invite
from .mock_idp_views import mock_idp_authorize, mock_idp_complete
from .preferences_views import auth_preferences

__all__ = [
    "auth_delete_account",
    "auth_export",
    "auth_google",
    "auth_logout",
    "auth_me",
    "auth_preferences",
    "csrf",
    "mock_idp_authorize",
    "mock_idp_complete",
    "staff_invite_code",
    "validate_invite",
]


@extend_schema(
    request=None,
    responses={204: None},
    description="Set the CSRF cookie. Call this before any POST/PATCH/DELETE request from a browser client.",
)
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
@traced
def csrf(request: Request) -> Response:
    """Return the CSRF cookie used by browser clients before mutating requests."""
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
    """Log the current user out of the active session."""
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            "AppInit",
            fields={
                "googleOauthClientId": drf_serializers.CharField(),
                "mockIdpUrl": drf_serializers.CharField(allow_null=True),
                "adminBaseUrl": drf_serializers.CharField(allow_null=True),
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
    """Return the current app bootstrap payload and authenticated user, if any."""
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    mock_idp_enabled = getattr(settings, "DEV_BOOTSTRAP_ENABLED", False)
    if not client_id and not mock_idp_enabled:
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
    mock_idp_url = (
        "/api/auth/mock-idp/authorize/?redirect_uri=/api/auth/mock-idp/complete/"
        if mock_idp_enabled
        else None
    )
    return Response(
        {
            "googleOauthClientId": client_id,
            "mockIdpUrl": mock_idp_url,
            "adminBaseUrl": (
                f"https://{admin_host}"
                if (request.user.is_staff and admin_host)
                else None
            ),
            "user": AuthUserSerializer(user).data if user else None,
        }
    )
