"""Django view wiring for the GraphQL endpoint.

Uses Strawberry's synchronous ``GraphQLView`` to stay consistent with the
synchronous DRF views (Django runs them in a threadpool under ASGI, which keeps
the ORM access async-safe).

Bearer-token requests (Authorization: Bearer …) are CSRF-exempt because the
token itself is the credential and CSRF cannot be exploited without a session
cookie. Session-authenticated mutation requests (POST without a Bearer header)
have CSRF enforced manually so that browser callers cannot perform cross-site
writes. Read-only queries (GET or any request that isn't a mutation) are safe
regardless of CSRF status, but we check for any POST without a Bearer header
for simplicity.
"""

from __future__ import annotations

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from django.views.decorators.csrf import csrf_exempt
from strawberry.django.views import GraphQLView

from .schema import schema

_csrf_middleware = CsrfViewMiddleware(lambda request: None)  # type: ignore[arg-type]


class _GlazeGraphQLView(GraphQLView):
    """GraphQL view that enforces CSRF for session-authenticated POST requests."""

    def dispatch(self, request, *args, **kwargs):
        # Bearer-token requests are CSRF-exempt (the token itself proves intent).
        has_bearer = request.META.get("HTTP_AUTHORIZATION", "").startswith("Bearer ")
        if request.method == "POST" and not has_bearer:
            reason = _csrf_middleware.process_view(request, None, (), {})  # type: ignore[arg-type]
            if reason is not None:
                # CSRF check failed — return the 403 response Django produced.
                return reason
        return super().dispatch(request, *args, **kwargs)


def graphql_view():
    """Return the configured GraphQL view callable for URL registration."""
    # The GraphiQL IDE is served only in DEBUG; production exposes the bare
    # endpoint (introspection still works for the MCP wrapper).
    graphql_ide = "graphiql" if settings.DEBUG else None
    view = _GlazeGraphQLView.as_view(schema=schema, graphql_ide=graphql_ide)
    return csrf_exempt(view)
