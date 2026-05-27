"""User data export endpoint for the Glaze API."""

import json
import logging
import posixpath
from collections.abc import AsyncIterator
from typing import Any, cast
from urllib.parse import urlparse
from zipfile import ZIP_DEFLATED, ZipFile

import httpx
from django.db.models import Q
from django.http import StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from backend.otel import traced

from .cloudinary_cleanup import _StreamingZipBuffer
from .models import Image, Piece, UserProfile
from .serializers import PieceDetailSerializer

logger = logging.getLogger(__name__)


def _collect_export_data(user: Any, request: Request) -> tuple[str, str, list[Image]]:
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
    pieces_json = json.dumps(list(pieces_data), default=str)

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
    return pieces_json, profile_json, images


def _export_image_name(image: Image) -> str:
    """Return the ZIP member path for an exported Cloudinary image."""
    public_id = cast(str, image.cloudinary_public_id)
    sanitized = public_id.replace("/", "__")
    _, ext = posixpath.splitext(urlparse(image.url).path)
    return f"images/{sanitized}{ext}"


async def _stream_export_archive(
    pieces_json: str, profile_json: str, images: list[Image]
) -> AsyncIterator[bytes]:
    buffer = _StreamingZipBuffer()
    async with httpx.AsyncClient(timeout=60) as client:
        with ZipFile(cast(Any, buffer), "w", ZIP_DEFLATED) as archive:
            archive.writestr("pieces.json", pieces_json)
            archive.writestr("profile.json", profile_json)
            for c in buffer.flush_chunks():
                yield c

            for image in images:
                member_name = _export_image_name(image)
                try:
                    async with client.stream("GET", image.url) as response:
                        response.raise_for_status()
                        with archive.open(member_name, "w") as member:
                            async for data in response.aiter_bytes(1024 * 1024):
                                member.write(data)
                                for c in buffer.flush_chunks():
                                    yield c
                except httpx.HTTPError as exc:
                    logger.warning(
                        "Export: failed to fetch image %s: %s",
                        image.cloudinary_public_id,
                        exc,
                    )
                for c in buffer.flush_chunks():
                    yield c

    for c in buffer.flush_chunks():
        yield c


@extend_schema(
    request=None,
    responses={200: None},
    description=(
        "Download a ZIP archive of all the current user's data: "
        "pieces.json (full piece history as JSON), profile.json (alias and preferences), "
        "and images/ (Cloudinary-backed images). Download this before deleting your account."
    ),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def auth_export(request: Request) -> StreamingHttpResponse:
    """Download a ZIP archive of the current user's data."""
    pieces_json, profile_json, images = _collect_export_data(request.user, request)
    response = StreamingHttpResponse(
        _stream_export_archive(pieces_json, profile_json, images),
        content_type="application/zip",
    )
    response["Content-Disposition"] = 'attachment; filename="potterdoc-export.zip"'
    response["Cache-Control"] = "no-store"
    response["X-Accel-Buffering"] = "no"
    return response
