"""Django view wiring for the GraphQL endpoint.

Uses Strawberry's synchronous ``GraphQLView`` to stay consistent with the
synchronous DRF views (Django runs them in a threadpool under ASGI, which keeps
the ORM access async-safe).

The view is CSRF-exempt. GraphQL requests are POSTs, so Django's CSRF
middleware would otherwise reject every caller that lacks a CSRF cookie —
including the bearer-token clients this endpoint exists for (the MCP wrapper,
Expo/mobile). That is safe here because the schema is **read-only** (a single
``pieces`` query, no mutations), and CSRF only guards state-changing requests.
Authorization is still enforced per-request in the resolver via
``get_request_user`` (session cookie or JWT Bearer). If mutations are added
later, reinstate CSRF protection for cookie-authenticated mutations.
"""

from __future__ import annotations

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from strawberry.django.views import GraphQLView

from .schema import schema


def graphql_view():
    """Return the configured GraphQL view callable for URL registration."""
    # The GraphiQL IDE is served only in DEBUG; production exposes the bare
    # endpoint (introspection still works for the MCP wrapper).
    graphql_ide = "graphiql" if settings.DEBUG else None
    view = GraphQLView.as_view(schema=schema, graphql_ide=graphql_ide)
    return csrf_exempt(view)
