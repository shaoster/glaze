"""ZIP streaming helpers for the user export endpoint."""

import logging
import posixpath
from collections.abc import AsyncIterator
from typing import Any, cast
from urllib.parse import urlparse
from zipfile import ZIP_DEFLATED, ZipFile

import httpx

from .cloudinary_cleanup import _StreamingZipBuffer
from .models import Image

logger = logging.getLogger(__name__)


def _export_image_name(image: Image) -> str:
    """Return the ZIP member path for an exported Cloudinary image."""
    public_id = cast(str, image.cloudinary_public_id)
    sanitized = public_id.replace("/", "__")
    _, ext = posixpath.splitext(urlparse(image.url).path)
    return f"images/{sanitized}{ext}"


async def _stream_export_archive(
    pieces_json: str, profile_json: str, images: list[Image]
) -> AsyncIterator[bytes]:
    """Stream the export archive as ZIP bytes."""
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
