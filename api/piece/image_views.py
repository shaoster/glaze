"""Piece image mutation endpoints for the Glaze API.

This module owns the image move/crop flows so ``piece_views.py`` can stay focused
on piece list/detail/state behavior.
"""

import uuid

from django.db import transaction
from django.db.models import Max
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .. import r2
from ..crops import apply_crop
from ..models import AsyncTask, Image, PieceStateImage
from ..serializers import (
    ImageCropInputSerializer,
    PieceDetailSerializer,
    UploadImageSerializer,
)
from ..utils import captioned_image_to_dict, normalize_image_payload
from .helpers import (
    PieceImageMoveSerializer,
    piece_detail_queryset,
    piece_queryset,
    serialize_piece_detail,
)


@extend_schema(
    methods=["PATCH"],
    request=PieceImageMoveSerializer,
    responses={200: PieceDetailSerializer},
    description=(
        "Move a user-owned image from one piece state to another atomically. "
        "Requires the piece to be in editable mode. Returns the full updated piece. "
        "Omitting `piece_state_id` is a no-op that returns the current piece state."
    ),
)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@traced
def piece_image_detail(request: Request, image_id, piece_state_id):
    """Move a user-owned PieceStateImage link to a different state atomically."""
    image = get_object_or_404(Image, pk=image_id, user=request.user)
    request_serializer = PieceImageMoveSerializer(data=request.data)
    request_serializer.is_valid(raise_exception=True)
    target_state_id = request_serializer.validated_data.get("piece_state_id")

    with transaction.atomic():
        link = get_object_or_404(
            PieceStateImage.objects.select_for_update().select_related(
                "piece_state__piece"
            ),
            image=image,
            piece_state_id=piece_state_id,
        )
        piece = link.piece_state.piece
        if piece.user_id != request.user.pk:
            raise Http404
        if not piece.is_editable:
            return Response(
                {"detail": "Piece is not in editable mode."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target_state_id and target_state_id != link.piece_state_id:
            to_state = get_object_or_404(piece.states, pk=target_state_id)
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
    return Response(serialize_piece_detail(piece, request))


_IMAGE_CONTENT_TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
}
_JPEG_EXTENSIONS = {"jpg", "jpeg"}
_NON_JPEG_IMAGE_EXTENSIONS = set(_IMAGE_CONTENT_TYPE_TO_EXT.values()) - _JPEG_EXTENSIONS
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _ext_for_content_type(content_type: str) -> str:
    base = content_type.split(";")[0].strip().lower()
    return _IMAGE_CONTENT_TYPE_TO_EXT.get(base, "jpg")


def _needs_jpeg_conversion(key: str) -> bool:
    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    return ext in _NON_JPEG_IMAGE_EXTENSIONS


def _upload_image_to_piece_state(request: Request, piece_state) -> Response:
    """Shared implementation for direct multipart image upload to a piece state."""
    from ..tasks import get_task_interface

    serializer = UploadImageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not r2.is_r2_configured():
        return Response(
            {"detail": "Object storage is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    validated = serializer.validated_data
    caption = validated.get("caption", "")
    file_obj = validated["file"]

    content_type = file_obj.content_type or "image/jpeg"
    if content_type not in _IMAGE_CONTENT_TYPE_TO_EXT:
        return Response(
            {"detail": f"Unsupported image type: {content_type}."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if (file_obj.size or 0) > _MAX_UPLOAD_BYTES:
        return Response(
            {"detail": "Image exceeds 10 MB size limit."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ext = _ext_for_content_type(content_type)
    key = f"images/{request.user.id}/{uuid.uuid4()}.{ext}"
    public_url = r2.upload_bytes(key, file_obj.read(), content_type)

    conversion_task_id = None
    if _needs_jpeg_conversion(key):
        task = AsyncTask.objects.create(  # type: ignore[misc]
            user=request.user,
            task_type="convert_image_to_jpeg",
            input_params={"key": key, "image_id": None},
        )
        get_task_interface().submit(task)
        conversion_task_id = str(task.id)

    image = normalize_image_payload(public_url, user=request.user)
    next_order = (piece_state.image_links.aggregate(m=Max("order"))["m"] or -1) + 1
    link = PieceStateImage.objects.create(
        piece_state=piece_state,
        image=image,
        caption=caption,
        order=next_order,
    )

    return Response(
        {
            "piece_state_image": captioned_image_to_dict(link),
            "background_tasks": {"conversion_task_id": conversion_task_id},
        },
        status=status.HTTP_201_CREATED,
    )


@extend_schema(
    operation_id="pieces_past_state_upload_image",
    request={"multipart/form-data": UploadImageSerializer},
    responses={
        201: {
            "type": "object",
            "properties": {
                "piece_state_image": {"type": "object"},
                "background_tasks": {
                    "type": "object",
                    "properties": {
                        "conversion_task_id": {
                            "type": "string",
                            "format": "uuid",
                            "nullable": True,
                        }
                    },
                },
            },
        },
        400: {"type": "object"},
        403: {"type": "object"},
        404: {"type": "object"},
        503: {"type": "object"},
    },
    description=(
        "Upload an image file to a specific past state. "
        "Requires the piece to be in editable mode. "
        "Send as multipart/form-data with a `file` field (JPEG, PNG, WebP, HEIC, max 10 MB) "
        "and an optional `caption`. "
        "Returns the created `PieceStateImage` and background task IDs."
    ),
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def upload_image_to_past_state(request: Request, piece_id, state_id) -> Response:
    """Upload an image to a specific (possibly past) piece state."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        return Response(
            {"detail": "Piece is not in editable mode."},
            status=status.HTTP_403_FORBIDDEN,
        )
    piece_state = get_object_or_404(piece.states, pk=state_id)
    return _upload_image_to_piece_state(request, piece_state)


@extend_schema(
    operation_id="pieces_current_state_upload_image",
    request={"multipart/form-data": UploadImageSerializer},
    responses={
        201: {
            "type": "object",
            "properties": {
                "piece_state_image": {"type": "object"},
                "background_tasks": {
                    "type": "object",
                    "properties": {
                        "conversion_task_id": {
                            "type": "string",
                            "format": "uuid",
                            "nullable": True,
                        }
                    },
                },
            },
        },
        400: {"type": "object"},
        403: {"type": "object"},
        404: {"type": "object"},
        503: {"type": "object"},
    },
    description=(
        "Upload an image file to the current unsealed state. "
        "Send as multipart/form-data with a `file` field (JPEG, PNG, WebP, HEIC, max 10 MB) "
        "and an optional `caption`. "
        "Returns the created `PieceStateImage` and background task IDs."
    ),
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def upload_image_to_current_state(request: Request, piece_id) -> Response:
    """Upload an image to the piece's current (unsealed) state."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    piece_state = piece.current_state
    if piece_state is None:
        return Response(
            {"detail": "Piece has no current state."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return _upload_image_to_piece_state(request, piece_state)


@extend_schema(
    operation_id="images_crop_partial_update",
    request=ImageCropInputSerializer,
    responses=PieceDetailSerializer,
    description="Update the crop bounds for an image. Returns the updated piece detail.",
)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@traced
def patch_image_crop(request, image_id):
    """Update the crop metadata for the most recent piece-state image link."""
    image = get_object_or_404(Image, pk=image_id, user=request.user)
    serializer = ImageCropInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # An Image can appear in multiple PieceStateImages (e.g. after a "Move to"
    # operation). Callers pass only image_id with no way to disambiguate, so we
    # target the most recently created PSI (highest id) which is the one the user
    # last interacted with.
    link = (
        PieceStateImage.objects.select_related("piece_state__piece", "image")
        .filter(image=image, piece_state__piece__user=request.user)
        .order_by("-id")
        .first()
    )
    if link is None:
        raise Http404
    piece = link.piece_state.piece

    # Eager crop pipeline: clears cropped_* and enqueues generate_cropped_image;
    # the response therefore carries crop set and cropped_url null, and the
    # frontend polls the piece until the task populates cropped_url.
    apply_crop(link, serializer.validated_data)

    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return Response(serialize_piece_detail(piece, request))
