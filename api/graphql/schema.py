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
from .mutations import Mutation
from .types import JSON, PieceDetailType, PiecePage, PieceType


@strawberry.enum(description="Sort order for a piece list.")
class PieceOrdering(Enum):
    LAST_MODIFIED_DESC = "-last_modified"
    LAST_MODIFIED_ASC = "last_modified"
    NAME_ASC = "name"
    NAME_DESC = "-name"
    CREATED_ASC = "created"
    CREATED_DESC = "-created"


@strawberry.input(
    description="Filters for the pieces query. All filters are AND-combined."
)
class PieceFilter:
    state: list[str] | None = strawberry.field(
        default=strawberry.UNSET,
        description='Workflow state names to match (e.g. "completed"). Multiple values are OR-combined.',
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
    return PiecePage(count=count, results=[PieceType.from_summary(row) for row in rows])


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

    @strawberry.field(
        description=(
            "Return the full GraphQL SDL (Schema Definition Language) as a string. "
            "LLM agents can call this query to discover all available types, fields, "
            "and descriptions in a single request without running multi-step introspection queries."
        )
    )
    def schema_sdl(self) -> str:
        return str(schema)

    @strawberry.field(
        description=(
            "Fetch a single piece by ID, including the complete state history "
            "and all detail fields (notes, photo count, tags, thumbnail)."
        )
    )
    def piece(self, info: strawberry.Info, id: strawberry.ID) -> PieceDetailType | None:
        from django.http import Http404

        from api.piece.resolvers import resolve_piece_detail

        request = info.context.request
        user = get_request_user(request)
        if user is None or not user.is_authenticated:
            raise StrawberryGraphQLError("Authentication required.")
        request.user = user
        try:
            data = resolve_piece_detail(str(id), request)
        except Http404:
            return None
        return PieceDetailType.from_detail(data)

    @strawberry.field(
        description=(
            "Fetch the full workflow schema: states, transitions, field definitions, "
            "and global type names."
        )
    )
    def workflow_schema(self, info: strawberry.Info) -> JSON:
        request = info.context.request
        user = get_request_user(request)
        if user is None or not user.is_authenticated:
            raise StrawberryGraphQLError("Authentication required.")
        request.user = user
        from api.workflow import build_workflow_schema

        return build_workflow_schema()

    @strawberry.field(
        description=(
            "List entries for a global library type "
            "(e.g. clay_body, glaze_type, location)."
        )
    )
    def globals(
        self, info: strawberry.Info, global_name: str, filters: JSON | None = None
    ) -> JSON:
        request = info.context.request
        user = get_request_user(request)
        if user is None or not user.is_authenticated:
            raise StrawberryGraphQLError("Authentication required.")
        request.user = user
        from api.global_entries.logic import global_entries_impl

        if filters:
            from django.http import QueryDict

            qd = QueryDict(mutable=True)
            for k, v in filters.items():
                qd[k] = str(v)
            request.GET = qd

        # global_entries_impl dispatches on request.method; GraphQL uses POST,
        # so we explicitly set GET to activate the list branch.
        original_method = request.method
        request.method = "GET"
        try:
            response = global_entries_impl(request, global_name)
        finally:
            request.method = original_method
        return response.data

    @strawberry.field(
        description="Return the JSON Schema + UI hints for a specific workflow state."
    )
    def state_schema(self, info: strawberry.Info, state_id: str) -> JSON:
        user = get_request_user(info.context.request)
        if user is None or not user.is_authenticated:
            raise StrawberryGraphQLError("Authentication required.")
        info.context.request.user = user
        from api.workflow import build_ui_schema

        return build_ui_schema(state_id)

    @strawberry.field(
        description=(
            "Images grouped by applied glaze combination, "
            "for the authenticated user's completed pieces."
        )
    )
    def glaze_combination_images(self, info: strawberry.Info) -> JSON:
        request = info.context.request
        user = get_request_user(request)
        if user is None or not user.is_authenticated:
            raise StrawberryGraphQLError("Authentication required.")
        request.user = user
        from api.analysis_views import glaze_combination_images as _view

        response = _view(request)
        return response.data


schema = strawberry.Schema(query=Query, mutation=Mutation)
