"""Shared query and serialization helpers for piece-related API views."""

from uuid import UUID

from django.apps import apps
from django.db.models import (
    Count,
    DateTimeField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
)
from django.db.models.functions import Coalesce, Greatest
from rest_framework.request import Request

from backend.otel import traced

from .models import Piece, PieceState, PieceStateImage
from .serializers import PieceDetailSerializer, PieceSummarySerializer
from .workflow import get_global_config, get_state_global_ref_map

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


@traced
def piece_queryset(request: Request):
    user_id = request.user.id
    assert user_id is not None
    return (
        Piece.objects.select_related("current_location", "thumbnail")
        .prefetch_related("states", "tag_links__tag")
        .filter(user_id=user_id)
    )


def piece_read_queryset(request: Request):
    qs = Piece.objects.select_related("current_location", "thumbnail").prefetch_related(
        "states", "tag_links__tag"
    )
    if request.user.is_authenticated:
        # Editable pieces are inaccessible to non-owners even when shared=True,
        # without altering the shared flag itself.
        return qs.filter(Q(user=request.user) | Q(shared=True, is_editable=False))
    return qs.filter(shared=True, is_editable=False)


def piece_state_ref_prefetches() -> list[Prefetch]:
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
    return piece_read_queryset(request).prefetch_related(
        "states__image_links__image", *piece_state_ref_prefetches()
    )


@traced
def serialize_piece_detail(piece: Piece, request: Request):
    return PieceDetailSerializer(piece, context={"request": request}).data


@traced
def serialize_piece_summary(qs, request: Request):
    return PieceSummarySerializer(qs, many=True, context={"request": request}).data


@traced
def apply_piece_ordering(qs, ordering_param: str):
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


def piece_photo_counts(piece_ids: list[UUID]) -> dict[UUID, int]:
    if not piece_ids:
        return {}
    rows = (
        PieceStateImage.objects.filter(piece_state__piece_id__in=piece_ids)
        .values("piece_state__piece_id")
        .annotate(photo_count=Count("id"))
    )
    return {row["piece_state__piece_id"]: row["photo_count"] for row in rows}
