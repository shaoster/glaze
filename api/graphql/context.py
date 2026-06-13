"""Authentication bridge between Django/DRF and the GraphQL resolvers.

Reuses the existing DRF auth stack so GraphQL honors the same credentials as the
REST API: a Django session cookie (populated by ``AuthenticationMiddleware``),
a long-lived agent bearer token (``pdagent_`` prefix), or a JWT Bearer token.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser

from api.auth.agent_auth import AgentTokenAuthentication
from api.auth.jwt_auth import JWTCookieAuthentication

_AUTH_BACKENDS = [AgentTokenAuthentication(), JWTCookieAuthentication()]


def get_request_user(request) -> AbstractBaseUser | AnonymousUser:
    """Resolve the authenticated user for a GraphQL request.

    Session auth is already applied by Django middleware (``request.user``).
    If that user is anonymous, try each token-based backend in order:
    agent bearer tokens first, then JWT cookies.
    """
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user

    for backend in _AUTH_BACKENDS:
        result = backend.authenticate(request)
        if result is not None:
            authenticated_user, _token = result
            request.user = authenticated_user
            return authenticated_user

    return user if user is not None else AnonymousUser()
