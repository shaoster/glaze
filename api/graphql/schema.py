"""The Glaze GraphQL schema.

Currently exposes a single ``pieces`` query that supersedes the REST
``GET /api/pieces/`` filtering surface. The filter/ordering/pagination semantics
match the REST view exactly; the difference is that the queryable surface is
introspectable, which is what the MCP server wrapper needs.
"""

from __future__ import annotations

from enum import Enum

import strawberry
from strawberry.exceptions import StrawberryGraphQLError

from api.piece.helpers import (
    _DEFAULT_PAGE_SIZE,
    apply_piece_ordering,
    piece_photo_counts,
    piece_queryset_for_user,
    serialize_piece_summary,
)

from .context import get_request_user
from .types import PiecePage, PieceType


@strawberry.enum(description="Sort order for a piece list.")
class PieceOrdering(Enum):
    LAST_MODIFIED_DESC = "-last_modified"
    LAST_MODIFIED_ASC = "last_modified"
    NAME_ASC = "name"
    NAME_DESC = "-name"
    CREATED_ASC = "created"
    CREATED_DESC = "-created"


@strawberry.input(description="Filters for the pieces query. All filters are AND-combined.")
class PieceFilter:
    state: list[str] | None = strawberry.field(
        default=strawberry.UNSET,
        description="Workflow state names to match (e.g. \"completed\"). Multiple values are OR-combined.",
    )
    shared: bool | None = strawberry.field(
        default=strawberry.UNSET,
        description="If set, return only pieces whose shared flag matches.",
    )
    search: str | None = strawberry.field(
        default=strawberry.UNSET,
        description="Case-insensitive partial match on the piece name.",
    )
    tag_ids: list[strawberry.ID] | None = strawberry.field(
        default=strawberry.UNSET,
        description="Tag IDs the piece must have. Multiple values are AND-combined.",
    )


def _resolve_pieces(
    info: strawberry.Info,
    filter: PieceFilter | None,
    ordering: PieceOrdering,
    limit: int,
    offset: int,
) -> PiecePage:
    request = info.context.request
    user = get_request_user(request)
    if user is None or not user.is_authenticated:
        raise StrawberryGraphQLError("Authentication credentials were not provided.")

    qs = piece_queryset_for_user(user.pk)

    f = filter or PieceFilter()
    if f.state:
        qs = qs.filter(current_state_name__in=list(f.state))
    if f.shared is not strawberry.UNSET and f.shared is not None:
        qs = qs.filter(shared=bool(f.shared))
    if f.search:
        qs = qs.filter(name__icontains=f.search)
    if f.tag_ids:
        for tag_id in f.tag_ids:
            qs = qs.filter(tag_links__tag_id=tag_id)
        qs = qs.distinct()

    qs = apply_piece_ordering(qs, ordering.value)

    # Clamp pagination identically to the REST view (api/piece/views.py).
    limit = max(1, min(100, limit))
    offset = max(0, offset)

    count = qs.count()
    page_qs = list(qs[offset : offset + limit])
    photo_counts = piece_photo_counts([piece.id for piece in page_qs])
    for piece in page_qs:
        piece.photo_count = photo_counts.get(piece.id, 0)

    rows = serialize_piece_summary(page_qs, request)
    return PiecePage(
        count=count, results=[PieceType.from_summary(row) for row in rows]
    )


@strawberry.type
class Query:
    @strawberry.field(
        description="List the authenticated user's pieces, filtered, ordered, and paginated.",
    )
    def pieces(
        self,
        info: strawberry.Info,
        filter: PieceFilter | None = None,
        ordering: PieceOrdering = PieceOrdering.LAST_MODIFIED_DESC,
        limit: int = _DEFAULT_PAGE_SIZE,
        offset: int = 0,
    ) -> PiecePage:
        return _resolve_pieces(info, filter, ordering, limit, offset)


schema = strawberry.Schema(query=Query)
