"""JWT authentication helpers for the migration path.

The JWT access token is the primary auth signal for the new client, but we keep
session auth in the DRF auth stack so existing browser flows continue to work
while the rollout is in progress.
"""

from rest_framework.authentication import get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

__all__ = ["JWTCookieAuthentication"]


class JWTCookieAuthentication(JWTAuthentication):
    """Bearer-token auth that gracefully yields to session auth on failure."""

    def authenticate(self, request: Request):
        header = get_authorization_header(request)
        if not header:
            return None

        try:
            return super().authenticate(request)
        except (AuthenticationFailed, InvalidToken, TokenError):
            return None
