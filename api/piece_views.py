# ruff: noqa: F401
import hashlib
import json
import os
import re
from collections import defaultdict
from typing import Callable

from django.apps import apps
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import DateTimeField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce, Greatest
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import (
    AsyncTask,
    FavoriteGlazeCombination,
    GlazeCombination,
    Piece,
    PieceState,
    UserProfile,
)
from .serializer_registry import (
    _GLOBAL_ENTRY_SERIALIZERS,  # auto-generated in _register_globals(); hand-written serializers overwrite
)
from .serializers import (
    AsyncTaskSerializer,
    AuthUserSerializer,
    GlazeCombinationImageEntrySerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    RegisterSerializer,
    TaskSubmissionSerializer,
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_config,
    get_global_model_and_field,
    get_state_global_ref_map,
    is_private_global,
    is_public_global,
)

_PIECE_ORDERING_MAP = {
    "last_modified": "computed_last_modified",
    "-last_modified": "-computed_last_modified",
    "name": "name",
    "-name": "-name",
    "created": "created",
    "-created": "-created",
}
_DEFAULT_ORDERING = "-last_modified"
_DEFAULT_PAGE_SIZE = 24


def _piece_queryset(request: Request):
    user_id = request.user.id
    assert user_id is not None
    return (
        Piece.objects.select_related("current_location", "thumbnail")
        .prefetch_related("states", "tag_links__tag")
        .filter(user_id=user_id)
    )


def _piece_read_queryset(request: Request):
    qs = Piece.objects.select_related("current_location", "thumbnail").prefetch_related(
        "states", "tag_links__tag"
    )
    if request.user.is_authenticated:
        # Editable pieces are inaccessible to non-owners even when shared=True,
        # without altering the shared flag itself.
        return qs.filter(Q(user=request.user) | Q(shared=True, is_editable=False))
    return qs.filter(shared=True, is_editable=False)


def _piece_detail_queryset(request: Request):
    return _piece_read_queryset(request).prefetch_related(
        "states__image_links__image", *_piece_state_ref_prefetches()
    )


def _piece_state_ref_prefetches() -> list[Prefetch]:
    prefetches: list[Prefetch] = []
    for global_name in get_state_global_ref_map():
        config = get_global_config(global_name)
        ref_model = apps.get_model("api", f"PieceState{config['model']}Ref")
        related_name = ref_model._meta.get_field("piece_state").remote_field.related_name
        assert related_name is not None
        prefetches.append(
            Prefetch(
                f"states__{related_name}",
                queryset=ref_model.objects.select_related(global_name),
            )
        )
    return prefetches


def _serialize_piece_detail(piece: Piece, request: Request):
    return PieceDetailSerializer(piece, context={"request": request}).data


def _serialize_piece_summary(qs, request: Request):
    return PieceSummarySerializer(qs, many=True, context={"request": request}).data


def _piece_state_ref_prefetches() -> list[Prefetch]:
    prefetches: list[Prefetch] = []
    for global_name in get_state_global_ref_map():
        config = get_global_config(global_name)
        ref_model = apps.get_model("api", f"PieceState{config['model']}Ref")
        related_name = ref_model._meta.get_field(
            "piece_state"
        ).remote_field.related_name
        assert related_name is not None
        prefetches.append(
            Prefetch(
                f"states__{related_name}",
                queryset=ref_model.objects.select_related(global_name),
            )
        )
    return prefetches


def _piece_detail_queryset(request: Request):
    return _piece_read_queryset(request).prefetch_related(
        "states__image_links__image", *_piece_state_ref_prefetches()
    )


def _apply_piece_ordering(qs, ordering_param: str):
    db_ordering = _PIECE_ORDERING_MAP.get(
        ordering_param, _PIECE_ORDERING_MAP[_DEFAULT_ORDERING]
    )
    if "computed_last_modified" in db_ordering:
        latest_state_lm = (
            PieceState.objects.filter(piece=OuterRef("pk"))
            .order_by("-last_modified")
            .values("last_modified")[:1]
        )
        qs = qs.annotate(
            computed_last_modified=Greatest(
                "fields_last_modified",
                Coalesce(
                    Subquery(latest_state_lm, output_field=DateTimeField()),
                    "fields_last_modified",
                ),
            )
        )
    return qs.order_by(db_ordering)


@extend_schema(
    methods=["GET"],
    operation_id="pieces_list",
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
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def pieces(request: Request) -> Response:
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
        page_qs = qs[offset : offset + limit]
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
)
@extend_schema(
    methods=["PATCH"],
    request=PieceUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def piece_detail(request: Request, piece_id: str) -> Response:
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
        piece.refresh_from_db()
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    request=PieceStateCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def piece_states(request: Request, piece_id: str) -> Response:
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
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def piece_current_state_detail(request: Request, piece_id: str) -> Response:
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
)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def piece_current_state(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_404_NOT_FOUND
        )
    serializer = PieceStateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    methods=["PATCH"],
    request=PieceStateUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@extend_schema(
    methods=["DELETE"],
    responses={200: PieceDetailSerializer},
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
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
        ps.delete()
        piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
        return Response(_serialize_piece_detail(piece, request))
    serializer = PieceStateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(ps, serializer.validated_data)
    piece = get_object_or_404(_piece_detail_queryset(request), pk=piece_id)
    return Response(_serialize_piece_detail(piece, request))
