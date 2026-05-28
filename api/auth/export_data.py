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
            "tag_links",
            "tag_links__tag",
        )
    )
    pieces_data = PieceDetailSerializer(
        pieces, many=True, context={"request": request}
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

    images = list(
        Image.objects.filter(cloudinary_public_id__isnull=False)
        .filter(
            Q(thumbnail_for_pieces__user=user)
            | Q(piece_state_links__piece_state__user=user)
        )
        .distinct()
    )
    return json.dumps(list(pieces_data), default=str), profile_json, images


_collect_export_data = collect_export_data
