"""GraphQL API layer for Glaze.

A Strawberry schema served at ``/api/graphql/``. This is the introspectable
query protocol intended to back the MCP server wrapper: an agent can discover
the queryable surface (filters, fields) via GraphQL introspection rather than
us documenting every REST query-param combination.

The schema reuses the existing ORM annotations and DRF serializers
(``api.piece.helpers``, ``api.serializers``) so the response shape matches the
REST ``/api/pieces/`` endpoint exactly.
"""

from .schema import schema

__all__ = ["schema"]
