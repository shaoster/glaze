"""Resolver functions for piece image operations."""

from __future__ import annotations

import uuid

from django.db import transaction
from django.db.models import Max
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..crops import apply_crop
from ..models import Image, PieceStateImage
from ..serializers import ImageCropInputSerializer
from .helpers import (
    PieceImageMoveSerializer,
    piece_detail_queryset,
    piece_queryset,
    serialize_piece_detail,
)
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
    if isinstance(result, Response):
        detail = result.data.get("detail", "Failed to fetch image.")
        raise ValidationError(detail)
    public_url, key = result
    _attach_image_to_piece_state_plain(
        piece_state, public_url, key, caption, request.user
    )
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_crop_image(
    image_id: str, x: float | None, y: float | None, width: float | None, height: float | None, request
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


def resolve_move_image(
    image_id: str,
    target_state_id: str,
    request,
    source_state_id: str | None = None,
) -> dict:
    """Move a user-owned image to a different piece state atomically."""
    image = get_object_or_404(Image, pk=image_id, user=request.user)
    serializer = PieceImageMoveSerializer(data={"piece_state_id": target_state_id})
    serializer.is_valid(raise_exception=True)
    validated_target = serializer.validated_data.get("piece_state_id")

    # Find the PieceStateImage link. When source_state_id is provided (REST bridge
    # passes the URL path param) we pin to that specific link to avoid ambiguity
    # when the same Image appears in multiple states.
    qs = (
        PieceStateImage.objects.select_related("piece_state__piece")
        .filter(image=image, piece_state__piece__user=request.user)
    )
    if source_state_id:
        qs = qs.filter(piece_state_id=uuid.UUID(source_state_id))
    link = qs.order_by("-id").first()
    if link is None:
        raise Http404

    current_piece_state_id = link.piece_state_id

    with transaction.atomic():
        link = get_object_or_404(
            PieceStateImage.objects.select_for_update().select_related(
                "piece_state__piece"
            ),
            image=image,
            piece_state_id=current_piece_state_id,
        )
        piece = link.piece_state.piece
        if piece.user_id != request.user.pk:
            raise Http404
        if not piece.is_editable:
            from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
            raise DjangoPermissionDenied("Piece is not in editable mode.")

        if validated_target and validated_target != link.piece_state_id:
            to_state = get_object_or_404(piece.states, pk=validated_target)
            duplicate_link = (
                PieceStateImage.objects.select_for_update()
                .filter(piece_state=to_state, image=image)
                .exclude(pk=link.pk)
                .first()
            )
            if duplicate_link is not None:
                link.delete()
            else:
                next_order = (
                    to_state.image_links.aggregate(m=Max("order"))["m"] or -1
                ) + 1
                link.piece_state = to_state
                link.order = next_order
                link.save(update_fields=["piece_state", "order"])

    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_upload_image_to_past_state(
    piece_id: str, state_id: str, url: str, caption: str, request
) -> dict:
    """Fetch image from URL and attach to a specific (past) piece state."""
    from .. import r2

    if not r2.is_r2_configured():
        raise ValidationError("Object storage is not configured on the server.")
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        raise ValidationError("Piece is not in editable mode.")
    piece_state = get_object_or_404(piece.states, pk=state_id)
    result = _fetch_url_to_r2(url, request.user.id)
    if isinstance(result, Response):
        detail = result.data.get("detail", "Failed to fetch image.")
        raise ValidationError(detail)
    public_url, key = result
    _attach_image_to_piece_state_plain(
        piece_state, public_url, key, caption, request.user
    )
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_upload_image_from_refs(
    piece_id: str, r2_keys: list[str], captions: list[str], request
) -> dict:
    """Create PieceStateImage records from already-uploaded R2 keys for the current state."""
    from .. import r2 as r2_module

    if not r2_module.is_r2_configured():
        raise ValidationError("Object storage is not configured on the server.")
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    piece_state = piece.current_state
    if piece_state is None:
        raise Http404("Piece has no current state.")
    _attach_r2_keys_to_piece_state(piece_state, r2_keys, captions, request.user)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_upload_image_from_refs_to_past_state(
    piece_id: str, state_id: str, r2_keys: list[str], captions: list[str], request
) -> dict:
    """Create PieceStateImage records from already-uploaded R2 keys for a past state."""
    from .. import r2 as r2_module

    if not r2_module.is_r2_configured():
        raise ValidationError("Object storage is not configured on the server.")
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        raise ValidationError("Piece is not in editable mode.")
    piece_state = get_object_or_404(piece.states, pk=state_id)
    _attach_r2_keys_to_piece_state(piece_state, r2_keys, captions, request.user)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def _attach_r2_keys_to_piece_state(
    piece_state, r2_keys: list[str], captions: list[str], user
) -> None:
    """Attach a list of already-uploaded R2 keys to a piece state."""
    from .. import r2 as r2_module

    for i, key in enumerate(r2_keys):
        caption = captions[i] if i < len(captions) else ""
        # Derive the public URL from the key.
        public_url = r2_module.public_url_for_key(key)
        _attach_image_to_piece_state_plain(piece_state, public_url, key, caption, user)


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
