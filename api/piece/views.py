from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..serializers import (
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
)
from .helpers import (
    _DEFAULT_ORDERING,
    _DEFAULT_PAGE_SIZE,
    _PIECE_ORDERING_MAP,
)
from .helpers import (
    apply_piece_ordering as _apply_piece_ordering,
)
from .helpers import (
    piece_detail_queryset as _piece_detail_queryset,
)
from .helpers import (
    piece_photo_counts as _piece_photo_counts,
)
from .helpers import (
    piece_queryset as _piece_queryset,
)
from .helpers import (
    piece_read_queryset as _piece_read_queryset,
)
from .helpers import (
    serialize_piece_detail as _serialize_piece_detail,
)
from .helpers import (
    serialize_piece_summary as _serialize_piece_summary,
)
from .helpers import (
    state_ref_prefetches as _state_ref_prefetches,
)


@extend_schema(
    methods=["GET"],
    operation_id="pieces_list",
    description="List the authenticated user's pieces, paginated and sortable.",
    parameters=[
        OpenApiParameter(
            name="ordering",
            description="Sort order. Prefix with '-' for descending.",
            required=False,
            type=str,
            enum=list(_PIECE_ORDERING_MAP.keys()),
        ),
        OpenApiParameter(
            name="limit", description="Page size.", required=False, type=int
        ),
        OpenApiParameter(
            name="offset", description="Pagination offset.", required=False, type=int
        ),
        OpenApiParameter(
            name="tag_ids",
            description="Comma-separated tag IDs (AND filter).",
            required=False,
            type=str,
        ),
    ],
    responses={
        200: inline_serializer(
            name="PiecePage",
            fields={
                "count": drf_serializers.IntegerField(),
                "results": PieceSummarySerializer(many=True),
            },
        )
    },
)
@extend_schema(
    methods=["POST"],
    request=PieceCreateSerializer,
    responses={201: PieceDetailSerializer},
    description="Create a new piece. The piece is initialized in the `designed` state.",
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@traced
def pieces(request: Request) -> Response:
    """List or create the current user's pieces."""
    if request.method == "GET":
        qs = _piece_queryset(request)
        raw_tag_ids = request.query_params.get("tag_ids", "").strip()
        if raw_tag_ids:
            for tag_id in (
                item.strip() for item in raw_tag_ids.split(",") if item.strip()
            ):
                qs = qs.filter(tag_links__tag_id=tag_id)
            qs = qs.distinct()
        ordering_param = request.query_params.get("ordering", _DEFAULT_ORDERING)
        qs = _apply_piece_ordering(qs, ordering_param)
        try:
            limit = max(
                1, min(100, int(request.query_params.get("limit", _DEFAULT_PAGE_SIZE)))
            )
            offset = max(0, int(request.query_params.get("offset", 0)))
        except (ValueError, TypeError):
            limit = _DEFAULT_PAGE_SIZE
            offset = 0
        count = qs.count()
        page_qs = list(qs[offset : offset + limit])
        photo_counts = _piece_photo_counts([piece.id for piece in page_qs])
        for piece in page_qs:
            piece.photo_count = photo_counts.get(piece.id, 0)
        return Response(
            {"count": count, "results": _serialize_piece_summary(page_qs, request)}
        )

    serializer = PieceCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    piece = serializer.save()
    return Response(
        _serialize_piece_detail(piece, request), status=status.HTTP_201_CREATED
    )


@extend_schema(
    methods=["GET"],
    operation_id="pieces_retrieve",
    responses={200: PieceDetailSerializer},
    description=(
        "Retrieve a single piece. Publicly shared terminal pieces are readable "
        "without authentication; all others require the owning user's session."
    ),
)
@extend_schema(
    methods=["PATCH"],
    request=PieceUpdateSerializer,
    responses={200: PieceDetailSerializer},
    description="Update piece metadata (name, notes, thumbnail, shared flag). Requires authentication.",
)
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
@traced
def piece_detail(request: Request, piece_id: str) -> Response:
    """Read, update, or delete a single piece owned by the current user."""
    if request.method == "GET":
        piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
        return Response(_serialize_piece_detail(piece, request))

    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_403_FORBIDDEN,
        )
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    if request.method == "PATCH":
        serializer = PieceUpdateSerializer(
            data=request.data, context={"request": request, "piece": piece}
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(piece, serializer.validated_data)
        piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    request=PieceStateCreateSerializer,
    responses={201: PieceDetailSerializer},
    description=(
        "Advance the piece to a new state. The `state` field must be a valid "
        "successor of the current state as defined in `workflow.yml`."
    ),
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def piece_states(request: Request, piece_id: str) -> Response:
    """List or append workflow states for a piece."""
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    serializer = PieceStateCreateSerializer(data=request.data, context={"piece": piece})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(
        _serialize_piece_detail(piece, request), status=status.HTTP_201_CREATED
    )


@extend_schema(
    methods=["GET"],
    responses={200: PieceStateSerializer},
    description="Return the current (most recent) state of the piece.",
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def piece_current_state_detail(request: Request, piece_id: str) -> Response:
    """Read or update the current workflow state detail for a piece."""
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_404_NOT_FOUND
        )
    return Response(PieceStateSerializer(current, context={"request": request}).data)


@extend_schema(
    methods=["PATCH"],
    request=PieceStateUpdateSerializer,
    responses={200: PieceDetailSerializer},
    description="Update fields on the current (unsealed) state: notes, location, custom fields, images.",
)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@traced
def piece_current_state(request: Request, piece_id: str) -> Response:
    """Read or update the current workflow state for a piece."""
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_404_NOT_FOUND
        )
    serializer = PieceStateUpdateSerializer(current, data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    methods=["PATCH"],
    request=PieceStateUpdateSerializer,
    responses={200: PieceDetailSerializer},
    description="Edit a sealed past state while the piece is in editable mode. Returns 403 if not editable.",
)
@extend_schema(
    methods=["DELETE"],
    responses={200: PieceDetailSerializer},
    description="Delete a sealed past state while in editable mode. Cannot delete the `designed` state.",
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@traced
def piece_past_state(request: Request, piece_id: str, state_id: str) -> Response:
    """Patch or delete a past (sealed) state while the piece is in editable mode.

    Returns 403 if the piece is not currently in editable mode.
    DELETE also returns 403 if the targeted state is 'designed'.
    """
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        return Response(
            {"detail": "Piece is not in editable mode."},
            status=status.HTTP_403_FORBIDDEN,
        )
    ps = get_object_or_404(piece.states, pk=state_id)
    if request.method == "DELETE":
        if ps.state == "designed":
            return Response(
                {"detail": "Cannot delete the 'designed' state."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if piece.thumbnail:
            state_image_urls = {img["url"] for img in ps.images}
            if piece.thumbnail.url in state_image_urls:
                return Response(
                    {
                        "detail": "Cannot delete a state that contains the current piece thumbnail."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        ps.delete()
        piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
        return Response(_serialize_piece_detail(piece, request))
    serializer = PieceStateUpdateSerializer(ps, data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(ps, serializer.validated_data)
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    methods=["GET"],
    responses={200: PieceStateSerializer(many=True)},
    description="Retrieve the full state history of a single piece.",
)
@api_view(["GET"])
@permission_classes([AllowAny])
@traced
def piece_history(request: Request, piece_id: str) -> Response:
    """Retrieve the full state history of a single piece."""
    piece = get_object_or_404(
        _piece_read_queryset(request).prefetch_related(None), pk=piece_id
    )
    states = piece.states.all().prefetch_related(
        "image_links__image",
        "image_links__cropped_image",
        *_state_ref_prefetches(),
    )
    serializer = PieceStateSerializer(
        states, many=True, context={"request": request, "piece": piece}
    )
    return Response(serializer.data)
