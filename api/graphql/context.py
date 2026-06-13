"""Authentication bridge between Django/DRF and the GraphQL resolvers.

Reuses the existing DRF auth stack so GraphQL honors the same credentials as the
REST API: a Django session cookie (populated by ``AuthenticationMiddleware``),
a long-lived agent bearer token (``pdagent_`` prefix), or a JWT Bearer token.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser

from api.auth.agent_auth import AgentTokenAuthentication
from api.auth.jwt_auth import JWTCookieAuthentication

_AGENT_AUTH = AgentTokenAuthentication()
_JWT_AUTH = JWTCookieAuthentication()

_AGENT_PREFIX = "Bearer pdagent_"


def get_request_user(request) -> AbstractBaseUser | AnonymousUser:
    """Resolve the authenticated user for a GraphQL request.

    If the request carries an agent bearer token (``pdagent_`` prefix), run
    agent auth first — this enforces the is_staff/is_superuser downgrade even
    when a session cookie is also present (e.g. a developer testing via
    GraphiQL while logged in).  For all other requests, the session user set
    by Django middleware takes priority, with JWT as the final fallback.
    """
    auth_header: str = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith(_AGENT_PREFIX):
        result = _AGENT_AUTH.authenticate(request)
        if result is not None:
            authenticated_user, _token = result
            request.user = authenticated_user
            return authenticated_user

    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user

    result = _JWT_AUTH.authenticate(request)
    if result is not None:
        authenticated_user, _token = result
        request.user = authenticated_user
        return authenticated_user

    return user if user is not None else AnonymousUser()
