"""Shared query and serialization helpers for piece-related API views."""

from uuid import UUID

from django.apps import apps
from django.db.models import (
    CharField,
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

from ..models import CURRENT_STATE_ORDERING, Piece, PieceState, PieceStateImage
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


def _latest_cropped_thumbnail_link():
    """Latest PSI link for the piece's thumbnail that has crop coordinates."""
    return PieceStateImage.objects.filter(
        piece_state__piece=OuterRef("pk"),
        image_id=OuterRef("thumbnail_id"),
        crop__isnull=False,
    ).order_by("-pk")


def _thumbnail_crop_subquery():
    return Subquery(
        _latest_cropped_thumbnail_link().values("crop")[:1],
        output_field=JSONField(),
    )


def _thumbnail_cropped_url_subquery():
    """Eagerly generated crop derivative URL from the same link as the crop."""
    return Subquery(
        _latest_cropped_thumbnail_link().values("cropped_url")[:1],
        output_field=CharField(),
    )


class PieceImageMoveSerializer(drf_serializers.Serializer):
    piece_state_id = drf_serializers.UUIDField(required=False)


def _base_piece_queryset():
    """Shared ORM base for all piece querysets: joins, annotation, and prefetches."""
    return (
        Piece.objects.select_related("current_location", "thumbnail", "user__profile")
        .annotate(
            thumbnail_crop=_thumbnail_crop_subquery(),
            thumbnail_cropped_url=_thumbnail_cropped_url_subquery(),
        )
        .prefetch_related("states", "tag_links__tag")
    )


def _current_state_name_subquery():
    return Subquery(
        PieceState.objects.filter(piece=OuterRef("pk"))
        .order_by(*CURRENT_STATE_ORDERING)
        .values("state")[:1],
        output_field=CharField(),
    )


def _latest_state_lm_subquery():
    # Uses CURRENT_STATE_ORDERING so the result matches Piece.last_modified
    # (current-state timestamp only, not the max across all states).
    return Subquery(
        PieceState.objects.filter(piece=OuterRef("pk"))
        .order_by(*CURRENT_STATE_ORDERING)
        .values("last_modified")[:1],
        output_field=DateTimeField(),
    )


def piece_queryset_for_user(user_id):
    """Return the annotated piece queryset for a given user id.

    Holds the annotations (current_state_name, computed_last_modified,
    thumbnail_crop) and prefetches shared by the REST list serializer and the
    GraphQL resolver. Annotating current_state_name and computed_last_modified
    in the SELECT lets callers avoid the full states prefetch (one fewer
    round-trip).
    """
    assert user_id is not None
    return (
        Piece.objects.select_related("current_location", "thumbnail", "user__profile")
        .annotate(
            thumbnail_crop=_thumbnail_crop_subquery(),
            thumbnail_cropped_url=_thumbnail_cropped_url_subquery(),
            computed_last_modified=Greatest(
                "fields_last_modified",
                Coalesce(_latest_state_lm_subquery(), "fields_last_modified"),
            ),
            current_state_name=_current_state_name_subquery(),
        )
        .prefetch_related("tag_links__tag")
        .filter(user_id=user_id)
    )


@traced
def piece_queryset(request: Request):
    """Return the authenticated user's piece queryset."""
    return piece_queryset_for_user(request.user.id)


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
