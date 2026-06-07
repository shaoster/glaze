"""Shared query and serialization helpers for piece-related API views."""

from uuid import UUID

from django.apps import apps
from django.db.models import (
    Count,
    DateTimeField,
    JSONField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
)
from django.db.models.functions import Coalesce, Greatest
from rest_framework import serializers as drf_serializers
from rest_framework.request import Request

from backend.otel import traced

from ..models import Piece, PieceState, PieceStateImage
from ..serializers import PieceDetailSerializer, PieceSummarySerializer
from ..workflow import get_global_config, get_state_global_ref_map

_PIECE_ORDERING_MAP = {
    "last_modified": "computed_last_modified",
    "-last_modified": "-computed_last_modified",
    "name": "name",
    "-name": "-name",
    "created": "created",
    "-created": "-created",
}
_DEFAULT_ORDERING = "-last_modified"
_DEFAULT_PAGE_SIZE = 16


def _thumbnail_crop_subquery():
    return Subquery(
        PieceStateImage.objects.filter(
            piece_state__piece=OuterRef("pk"),
            image_id=OuterRef("thumbnail_id"),
            crop__isnull=False,
        )
        .order_by("-pk")
        .values("crop")[:1],
        output_field=JSONField(),
    )


class PieceImageMoveSerializer(drf_serializers.Serializer):
    piece_state_id = drf_serializers.UUIDField(required=False)


def _base_piece_queryset():
    """Shared ORM base for all piece querysets: joins, annotation, and prefetches."""
    return (
        Piece.objects.select_related("current_location", "thumbnail", "user__profile")
        .annotate(thumbnail_crop=_thumbnail_crop_subquery())
        .prefetch_related("states", "tag_links__tag")
    )


def _latest_state_lm_subquery():
    return Subquery(
        PieceState.objects.filter(piece=OuterRef("pk"))
        .order_by("-last_modified")
        .values("last_modified")[:1],
        output_field=DateTimeField(),
    )


@traced
def piece_queryset(request: Request):
    """Return the authenticated user's piece queryset."""
    user_id = request.user.id
    assert user_id is not None
    return (
        _base_piece_queryset()
        .annotate(
            computed_last_modified=Greatest(
                "fields_last_modified",
                Coalesce(_latest_state_lm_subquery(), "fields_last_modified"),
            ),
        )
        .filter(user_id=user_id)
    )


@traced
def piece_read_queryset(request: Request):
    """Return the queryset for pieces visible to the current request."""
    qs = _base_piece_queryset()
    if request.user.is_authenticated:
        # Editable pieces are inaccessible to non-owners even when shared=True,
        # without altering the shared flag itself.
        return qs.filter(Q(user=request.user) | Q(shared=True, is_editable=False))
    return qs.filter(shared=True, is_editable=False)


@traced
def piece_state_ref_prefetches() -> list[Prefetch]:
    """Build Prefetch objects for workflow global refs on piece states."""
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


@traced
def piece_detail_queryset(request: Request):
    """Return the queryset needed to serialize full piece detail."""
    return piece_read_queryset(request).prefetch_related(
        "states__image_links__image", *piece_state_ref_prefetches()
    )


@traced
def serialize_piece_detail(piece: Piece, request: Request):
    """Serialize a single piece into the detail payload."""
    return PieceDetailSerializer(piece, context={"request": request}).data


@traced
def serialize_piece_summary(qs, request: Request):
    """Serialize a piece queryset into summary rows."""
    return PieceSummarySerializer(qs, many=True, context={"request": request}).data


@traced
def apply_piece_ordering(qs, ordering_param: str):
    """Apply the requested piece ordering to a queryset."""
    db_ordering = _PIECE_ORDERING_MAP.get(
        ordering_param, _PIECE_ORDERING_MAP[_DEFAULT_ORDERING]
    )
    return qs.order_by(db_ordering)


@traced
def piece_photo_counts(piece_ids: list[UUID]) -> dict[UUID, int]:
    """Return photo counts keyed by piece ID."""
    if not piece_ids:
        return {}
    rows = (
        PieceStateImage.objects.filter(piece_state__piece_id__in=piece_ids)
        .values("piece_state__piece_id")
        .annotate(photo_count=Count("id"))
    )
    return {row["piece_state__piece_id"]: row["photo_count"] for row in rows}
