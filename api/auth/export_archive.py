"""ZIP streaming helpers for the user export endpoint.

Public helper entry points in this module are traced so archive-building work
remains observable as a documented contract.
"""

import logging
import posixpath
from collections.abc import AsyncIterator
from typing import Any, cast
from urllib.parse import urlparse
from zipfile import ZIP_DEFLATED, ZipFile

import httpx

from backend.otel import traced

from ..models import Image

logger = logging.getLogger(__name__)


class _StreamingZipBuffer:
    """File-like sink that buffers ZIP bytes for incremental streaming."""

    def __init__(self) -> None:
        self._chunks: list[bytes] = []

    def write(self, data: bytes) -> int:
        self._chunks.append(bytes(data))
        return len(data)

    def flush_chunks(self) -> list[bytes]:
        chunks, self._chunks = self._chunks, []
        return chunks

    def flush(self) -> None:
        return None


@traced
def export_image_name(image: Image) -> str:
    """Return the ZIP member path for an exported hosted image."""
    identifier = image.r2_key or urlparse(image.url).path.lstrip("/")
    stem, _ = posixpath.splitext(identifier)
    sanitized = stem.replace("/", "__")
    _, ext = posixpath.splitext(urlparse(image.url).path)
    return f"images/{sanitized}{ext}"


@traced
async def stream_export_archive(
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
                member_name = export_image_name(image)
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
                        image.url,
                        exc,
                    )
                for c in buffer.flush_chunks():
                    yield c

    for c in buffer.flush_chunks():
        yield c
