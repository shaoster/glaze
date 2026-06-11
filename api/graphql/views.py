"""Django view wiring for the GraphQL endpoint.

Uses Strawberry's synchronous ``GraphQLView`` to stay consistent with the
synchronous DRF views (Django runs them in a threadpool under ASGI, which keeps
the ORM access async-safe). CSRF protection is left intact: browser clients
authenticate with a session cookie and must send the ``X-CSRFToken`` header,
exactly like the REST endpoints.
"""

from __future__ import annotations

from django.conf import settings
from strawberry.django.views import GraphQLView

from .schema import schema


def graphql_view():
    """Return the configured GraphQL view callable for URL registration."""
    # The GraphiQL IDE is served only in DEBUG; production exposes the bare
    # endpoint (introspection still works for the MCP wrapper).
    graphql_ide = "graphiql" if settings.DEBUG else None
    return GraphQLView.as_view(schema=schema, graphql_ide=graphql_ide)
