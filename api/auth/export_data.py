"""Data assembly helpers for the user export endpoint.

Public helper entry points in this module are traced so export assembly stays
observable as a documented contract.
"""

import json
from typing import Any

from django.db.models import Q
from rest_framework.request import Request

from backend.otel import traced

from ..models import Image, Piece, UserProfile
from ..piece.helpers import piece_state_ref_prefetches
from ..serializers import PieceDetailSerializer


@traced
def collect_export_data(user: Any, request: Request) -> tuple[str, str, list[Image]]:
    """Assemble the JSON payloads and referenced images for a user export."""
    pieces = (
        Piece.objects.filter(user=user)
        .select_related("thumbnail", "current_location")
        .prefetch_related(
            "states",
            "states__image_links",
            "states__image_links__image",
            "states__image_links__cropped_image",
            "tag_links",
            "tag_links__tag",
            *piece_state_ref_prefetches(),
        )
    )
    pieces_data = PieceDetailSerializer(
        pieces, many=True, context={"request": request, "exclude_history": False}
    ).data

    profile = UserProfile.objects.filter(user=user).first()
    profile_json = json.dumps(
        {
            "alias": profile.alias if profile else None,
            "preferences": profile.preferences
            if profile and isinstance(profile.preferences, dict)
            else {},
        },
        default=str,
    )

    # Restrict to R2-backed images and transitional Cloudinary-hosted images.
    # An overly broad URL filter (url__startswith="http") would let an
    # authenticated user attach arbitrary URLs and trigger SSRF via the
    # export's httpx fetch of image.url during ZIP assembly.
    images = list(
        Image.objects.filter(
            Q(r2_key__isnull=False) | Q(url__icontains="res.cloudinary.com")
        )
        .filter(
            Q(thumbnail_for_pieces__user=user)
            | Q(piece_state_links__piece_state__user=user)
            | Q(crop_links__piece_state__user=user)
        )
        .distinct()
    )
    return json.dumps(list(pieces_data), default=str), profile_json, images
