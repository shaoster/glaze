"""Authentication bridge between Django/DRF and the GraphQL resolvers.

Reuses the existing DRF auth stack so GraphQL honors the same credentials as the
REST API: a Django session cookie (populated by ``AuthenticationMiddleware``) or
a JWT Bearer token (via ``JWTCookieAuthentication``).
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser

from api.auth.jwt_auth import JWTCookieAuthentication


def get_request_user(request) -> AbstractBaseUser | AnonymousUser:
    """Resolve the authenticated user for a GraphQL request.

    Session auth is already applied by Django middleware (``request.user``).
    If that user is anonymous, fall back to Bearer-token auth using the same
    ``JWTCookieAuthentication`` class the DRF endpoints use.
    """
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user

    result = JWTCookieAuthentication().authenticate(request)
    if result is not None:
        authenticated_user, _token = result
        # Attach so downstream resolvers and tooling see a consistent user.
        request.user = authenticated_user
        return authenticated_user

    return user if user is not None else AnonymousUser()
