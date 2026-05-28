"""Compatibility wrappers for piece endpoints.

Public wrapper functions in this module are traced so the stable import surface
remains observable even while implementation details move into feature
subpackages.
"""

# ruff: noqa: F401
from backend.otel import traced

from .piece import views as _impl
from .piece.views import (
    Http404,
    Image,
    ImageCropSerializer,
    Max,
    Piece,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceImageMoveSerializer,
    PieceState,
    PieceStateCreateSerializer,
    PieceStateImage,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    Prefetch,
    Q,
    _apply_piece_ordering,
    _piece_detail_queryset,
    _piece_photo_counts,
    _piece_queryset,
    _serialize_piece_detail,
    apps,
    bootstrap_dev_user,
    get_global_config,
    get_global_model_and_field,
    get_object_or_404,
    get_state_global_ref_map,
    transaction,
)


def _sync_impl() -> None:
    for name in [
        "Image",
        "ImageCropSerializer",
        "Piece",
        "PieceCreateSerializer",
        "PieceDetailSerializer",
        "PieceImageMoveSerializer",
        "PieceState",
        "PieceStateCreateSerializer",
        "PieceStateImage",
        "PieceStateSerializer",
        "PieceStateUpdateSerializer",
        "PieceSummarySerializer",
        "PieceUpdateSerializer",
        "Prefetch",
        "Q",
        "Max",
        "apps",
        "bootstrap_dev_user",
        "get_global_config",
        "get_global_model_and_field",
        "get_state_global_ref_map",
        "transaction",
        "get_object_or_404",
        "Http404",
        "_apply_piece_ordering",
        "_piece_detail_queryset",
        "_piece_photo_counts",
        "_piece_queryset",
        "_serialize_piece_detail",
    ]:
        setattr(_impl, name, globals()[name])


@traced
def pieces(request):
    _sync_impl()
    return _impl.pieces(request)


@traced
def piece_detail(request, piece_id):
    _sync_impl()
    return _impl.piece_detail(request, piece_id)


@traced
def piece_states(request, piece_id):
    _sync_impl()
    return _impl.piece_states(request, piece_id)


@traced
def piece_current_state_detail(request, piece_id):
    _sync_impl()
    return _impl.piece_current_state_detail(request, piece_id)


@traced
def piece_current_state(request, piece_id):
    _sync_impl()
    return _impl.piece_current_state(request, piece_id)


@traced
def piece_past_state(request, piece_id, state_id):
    _sync_impl()
    return _impl.piece_past_state(request, piece_id, state_id)


@traced
def piece_image_detail(request, image_id, piece_state_id):
    _sync_impl()
    return _impl.piece_image_detail(request, image_id, piece_state_id)


@traced
def patch_image_crop(request, image_id):
    _sync_impl()
    return _impl.patch_image_crop(request, image_id)


def _copy_view_metadata(name: str) -> None:
    proxy = globals()[name]
    target = getattr(_impl, name)
    proxy.__dict__.update(target.__dict__)
    proxy.__doc__ = target.__doc__


for _name in [
    "pieces",
    "piece_detail",
    "piece_states",
    "piece_current_state_detail",
    "piece_current_state",
    "piece_past_state",
    "piece_image_detail",
    "patch_image_crop",
]:
    _copy_view_metadata(_name)
