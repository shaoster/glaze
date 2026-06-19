"""Resolver functions for piece image operations."""

from __future__ import annotations

from django.db.models import Max
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from ..models import Image, PieceStateImage
from ..crops import apply_crop
from ..serializers import ImageCropInputSerializer
from .helpers import piece_queryset, piece_detail_queryset, serialize_piece_detail
from .image_views import (
    _fetch_url_to_r2,
    _needs_jpeg_conversion,
)


def resolve_upload_image(piece_id: str, url: str, caption: str, request) -> dict:
    """Fetch image from URL and attach to piece's current state."""
    from .. import r2

    if not r2.is_r2_configured():
        raise ValidationError("Object storage is not configured on the server.")
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    piece_state = piece.current_state
    if piece_state is None:
        raise Http404("Piece has no current state.")
    result = _fetch_url_to_r2(url, request.user.id)
    if hasattr(result, "status_code"):
        # It's a Response error object
        detail = result.data.get("detail", "Failed to fetch image.")
        raise ValidationError(detail)
    public_url, key = result
    _attach_image_to_piece_state_plain(piece_state, public_url, key, caption, request.user)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_crop_image(
    image_id: str, x: float, y: float, width: float, height: float, request
) -> dict:
    """Update crop bounds for image, returns serialized PieceDetail dict."""
    image = get_object_or_404(Image, pk=image_id, user=request.user)
    serializer = ImageCropInputSerializer(
        data={"x": x, "y": y, "width": width, "height": height}
    )
    serializer.is_valid(raise_exception=True)
    link = (
        PieceStateImage.objects.select_related("piece_state__piece", "image")
        .filter(image=image, piece_state__piece__user=request.user)
        .order_by("-id")
        .first()
    )
    if link is None:
        raise Http404
    piece = link.piece_state.piece
    apply_crop(link, serializer.validated_data)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def _attach_image_to_piece_state_plain(
    piece_state, public_url: str, key: str, caption: str, user
) -> str | None:
    """Create PieceStateImage from an already-uploaded R2 key."""
    from ..models import AsyncTask
    from ..tasks import get_task_interface
    from ..utils import normalize_image_payload

    conversion_task_id = None
    if _needs_jpeg_conversion(key):
        task = AsyncTask.objects.create(
            user=user,
            task_type="convert_image_to_jpeg",
            input_params={"key": key, "image_id": None},
        )
        get_task_interface().submit(task)
        conversion_task_id = str(task.id)

    image = normalize_image_payload(public_url, user=user)
    next_order = (piece_state.image_links.aggregate(m=Max("order"))["m"] or -1) + 1
    PieceStateImage.objects.create(
        piece_state=piece_state,
        image=image,
        caption=caption,
        order=next_order,
    )
    return conversion_task_id
