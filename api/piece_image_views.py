"""Piece image mutation endpoints for the Glaze API.

This module owns the image move/crop flows so ``piece_views.py`` can stay focused
on piece list/detail/state behavior.
"""

from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import Image, PieceStateImage
from .piece_helpers import piece_detail_queryset, serialize_piece_detail
from .serializers import ImageCropSerializer, PieceDetailSerializer


class PieceImageMoveSerializer(drf_serializers.Serializer):
    piece_state_id = drf_serializers.UUIDField(required=False)


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

    from django.db import transaction
    from django.db.models import Max

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


@extend_schema(request=ImageCropSerializer, responses=PieceDetailSerializer)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@traced
def patch_image_crop(request, image_id):
    image = get_object_or_404(Image, pk=image_id, user=request.user)
    serializer = ImageCropSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # An Image can appear in multiple PieceStateImages (e.g. after a "Move to"
    # operation). Callers pass only image_id with no way to disambiguate, so we
    # target the most recently created PSI (highest id) which is the one the user
    # last interacted with.
    link = (
        PieceStateImage.objects.select_related("piece_state__piece")
        .filter(image=image, piece_state__piece__user=request.user)
        .order_by("-id")
        .first()
    )
    if link is None:
        raise Http404
    piece = link.piece_state.piece

    link.crop = serializer.validated_data
    link.save(update_fields=["crop"])

    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return Response(serialize_piece_detail(piece, request))
