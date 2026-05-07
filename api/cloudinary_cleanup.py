import logging
import os
import posixpath
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import urlparse
from urllib.request import urlopen
from zipfile import ZIP_DEFLATED, ZipFile

import cloudinary
import cloudinary.api
import cloudinary.exceptions
from cloudinary import CloudinaryImage

from .models import GlazeCombination, GlazeType, Image, Piece, PieceStateImage

logger = logging.getLogger(__name__)

REFERENCED_BREAKDOWN_WORKFLOW_IMAGE_PATHS = frozenset(
    {
        "globals.glaze_type.test_tile_image",
        "globals.glaze_combination.test_tile_image",
    }
)


@dataclass(frozen=True)
class CloudinaryCleanupAsset:
    public_id: str
    cloud_name: str
    path_prefix: str | None
    url: str
    thumbnail_url: str
    format: str | None
    bytes: int | None
    created_at: str | None
    referenced: bool


@dataclass(frozen=True)
class CloudinaryCleanupReferenceBreakdownItem:
    key: str
    label: str
    count: int


@dataclass(frozen=True)
class CloudinaryCleanupReferenceBreakdown:
    sources: list[CloudinaryCleanupReferenceBreakdownItem]
    warnings: list[str]


def configure_cloudinary_admin() -> tuple[str, str | None]:
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    if not cloud_name or not api_key or not api_secret:
        raise ValueError("Cloudinary is not configured on the server.")
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    return cloud_name, os.environ.get("CLOUDINARY_UPLOAD_FOLDER") or None


def list_referenced_public_ids() -> set[str]:
    public_ids = (
        Image.objects.filter(cloudinary_public_id__isnull=False)
        .exclude(cloudinary_public_id="")
        .values_list("cloudinary_public_id", flat=True)
    )
    return {public_id for public_id in public_ids if public_id is not None}


def summarize_referenced_public_ids(
    scanned_public_ids: set[str] | None = None,
) -> CloudinaryCleanupReferenceBreakdown:
    source_counts: Counter[str] = Counter()
    warnings: list[str] = []

    piece_thumbnail_refs = (
        Piece.objects.exclude(thumbnail__isnull=True)
        .exclude(thumbnail__cloudinary_public_id__isnull=True)
        .exclude(thumbnail__cloudinary_public_id="")
    )
    piece_state_image_refs = PieceStateImage.objects.exclude(
        image__cloudinary_public_id__isnull=True
    ).exclude(image__cloudinary_public_id="")
    glaze_tile_image_refs = (
        GlazeType.objects.exclude(test_tile_image__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id="")
    )
    glaze_combination_image_refs = (
        GlazeCombination.objects.exclude(test_tile_image__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id="")
    )

    if scanned_public_ids is not None:
        piece_thumbnail_refs = piece_thumbnail_refs.filter(
            thumbnail__cloudinary_public_id__in=scanned_public_ids
        )
        piece_state_image_refs = piece_state_image_refs.filter(
            image__cloudinary_public_id__in=scanned_public_ids
        )
        glaze_tile_image_refs = glaze_tile_image_refs.filter(
            test_tile_image__cloudinary_public_id__in=scanned_public_ids
        )
        glaze_combination_image_refs = glaze_combination_image_refs.filter(
            test_tile_image__cloudinary_public_id__in=scanned_public_ids
        )

    glaze_tile_count = GlazeType.objects.count()
    glaze_tile_image_count = (
        GlazeType.objects.exclude(test_tile_image__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id="")
        .count()
    )
    glaze_combination_count = GlazeCombination.objects.count()
    glaze_combination_image_count = (
        GlazeCombination.objects.exclude(test_tile_image__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id__isnull=True)
        .exclude(test_tile_image__cloudinary_public_id="")
        .count()
    )

    source_counts["piece_list"] = piece_thumbnail_refs.count()
    source_counts["piece_state_images"] = piece_state_image_refs.count()
    source_counts["glaze_tiles"] = glaze_tile_image_refs.count()
    source_counts["glaze_combinations"] = glaze_combination_image_refs.count()

    covered_public_ids = (
        set(
            piece_thumbnail_refs.values_list(
                "thumbnail__cloudinary_public_id", flat=True
            )
        )
        | set(
            piece_state_image_refs.values_list("image__cloudinary_public_id", flat=True)
        )
        | set(
            glaze_tile_image_refs.values_list(
                "test_tile_image__cloudinary_public_id", flat=True
            )
        )
        | set(
            glaze_combination_image_refs.values_list(
                "test_tile_image__cloudinary_public_id", flat=True
            )
        )
    )
    if scanned_public_ids is None:
        unknown_referenced_public_ids: set[str] = set()
    else:
        unknown_referenced_public_ids = (
            scanned_public_ids & list_referenced_public_ids()
        ) - covered_public_ids
    source_counts["unknown_referenced_assets"] = len(unknown_referenced_public_ids)

    if glaze_tile_image_count < glaze_tile_count:
        warnings.append(
            f"Found fewer references than glaze tiles "
            f"({glaze_tile_image_count} of {glaze_tile_count})."
        )
    if glaze_combination_image_count < glaze_combination_count:
        warnings.append(
            f"Found fewer references than glaze combinations "
            f"({glaze_combination_image_count} of {glaze_combination_count})."
        )
    if unknown_referenced_public_ids:
        warnings.append(
            f"Found {len(unknown_referenced_public_ids)} referenced assets "
            f"not explained by known source paths."
        )

    return CloudinaryCleanupReferenceBreakdown(
        sources=[
            CloudinaryCleanupReferenceBreakdownItem(
                key="piece_list",
                label="PieceList",
                count=source_counts["piece_list"],
            ),
            CloudinaryCleanupReferenceBreakdownItem(
                key="piece_state_images",
                label="Piece State Images",
                count=source_counts["piece_state_images"],
            ),
            CloudinaryCleanupReferenceBreakdownItem(
                key="glaze_tiles",
                label="Glaze Tiles",
                count=source_counts["glaze_tiles"],
            ),
            CloudinaryCleanupReferenceBreakdownItem(
                key="glaze_combinations",
                label="Glaze Combinations",
                count=source_counts["glaze_combinations"],
            ),
            CloudinaryCleanupReferenceBreakdownItem(
                key="unknown_referenced_assets",
                label="Unknown Referenced Assets",
                count=source_counts["unknown_referenced_assets"],
            ),
        ],
        warnings=warnings,
    )


def list_cloudinary_assets(max_results: int = 500) -> list[CloudinaryCleanupAsset]:
    cloud_name, path_prefix = configure_cloudinary_admin()
    referenced_public_ids = list_referenced_public_ids()
    assets: list[CloudinaryCleanupAsset] = []
    next_cursor = None

    while True:
        params: dict[str, object] = {
            "resource_type": "image",
            "type": "upload",
            "max_results": min(max_results, 500),
        }
        if next_cursor:
            params["next_cursor"] = next_cursor

        result = cloudinary.api.resources(**params)
        resources = result.get("resources", [])
        if not isinstance(resources, list):
            raise ValueError("Cloudinary returned an unexpected resources payload.")

        for resource in resources:
            if not isinstance(resource, dict):
                continue
            public_id = resource.get("public_id")
            if not isinstance(public_id, str) or not public_id:
                continue
            assets.append(
                CloudinaryCleanupAsset(
                    public_id=public_id,
                    cloud_name=cloud_name,
                    path_prefix=path_prefix,
                    url=str(resource.get("secure_url") or resource.get("url") or ""),
                    thumbnail_url=CloudinaryImage(public_id).build_url(
                        width=96,
                        height=96,
                        crop="fill",
                        format="jpg",
                        secure=True,
                    ),
                    format=resource.get("format")
                    if isinstance(resource.get("format"), str)
                    else _extension_from_url(
                        str(resource.get("secure_url") or resource.get("url") or "")
                    ),
                    bytes=resource.get("bytes")
                    if isinstance(resource.get("bytes"), int)
                    else None,
                    created_at=resource.get("created_at")
                    if isinstance(resource.get("created_at"), str)
                    else None,
                    referenced=public_id in referenced_public_ids,
                )
            )

        next_cursor = result.get("next_cursor")
        if not next_cursor:
            break

    return assets


def _extension_from_url(url: str) -> str | None:
    suffix = posixpath.splitext(urlparse(url).path)[1].lstrip(".").lower()
    return suffix or None


def _archive_member_name(asset: CloudinaryCleanupAsset) -> str:
    prefix = (asset.path_prefix or "").strip("/")
    cloud_id = asset.public_id.strip("/")
    if prefix and cloud_id == prefix:
        cloud_id = posixpath.basename(cloud_id)
    elif prefix and cloud_id.startswith(f"{prefix}/"):
        cloud_id = cloud_id[len(prefix) + 1 :]

    extension = (asset.format or _extension_from_url(asset.url) or "bin").lstrip(".")
    return posixpath.join(asset.cloud_name, prefix, f"{cloud_id}.{extension}")


class _StreamingZipBuffer:
    def __init__(self) -> None:
        self._chunks: list[bytes] = []

    def write(self, data: bytes) -> int:
        self._chunks.append(bytes(data))
        return len(data)

    def flush_chunks(self) -> Iterator[bytes]:
        while self._chunks:
            yield self._chunks.pop(0)

    def flush(self) -> None:
        return None


def stream_cloudinary_cleanup_archive(
    assets: list[CloudinaryCleanupAsset],
) -> Iterator[bytes]:
    buffer = _StreamingZipBuffer()
    with ZipFile(cast(Any, buffer), "w", ZIP_DEFLATED) as archive:
        used_names: set[str] = set()
        for asset in assets:
            if not asset.url:
                continue
            member_name = _archive_member_name(asset)
            if member_name in used_names:
                stem, extension = posixpath.splitext(member_name)
                index = 2
                while f"{stem}-{index}{extension}" in used_names:
                    index += 1
                member_name = f"{stem}-{index}{extension}"
            used_names.add(member_name)

            with urlopen(asset.url, timeout=30) as response:
                with archive.open(member_name, "w") as member:
                    while chunk := response.read(1024 * 1024):
                        member.write(chunk)
                        yield from buffer.flush_chunks()
            yield from buffer.flush_chunks()

    yield from buffer.flush_chunks()


def delete_cloudinary_assets(public_ids: list[str]) -> dict[str, str]:
    configure_cloudinary_admin()
    referenced_public_ids = list_referenced_public_ids()
    unsafe_public_ids = sorted(set(public_ids) & referenced_public_ids)
    if unsafe_public_ids:
        joined = ", ".join(unsafe_public_ids)
        raise ValueError(f"Cannot delete referenced Cloudinary assets: {joined}")

    if not public_ids:
        return {}

    try:
        result = cloudinary.api.delete_resources(public_ids, resource_type="image")
    except cloudinary.exceptions.Error as exc:
        logger.exception(
            "Cloudinary delete_resources failed for %d cleanup assets.",
            len(public_ids),
        )
        raise ValueError("Unable to delete Cloudinary assets.") from exc
    deleted = result.get("deleted", {})
    if not isinstance(deleted, dict):
        raise ValueError("Cloudinary returned an unexpected delete payload.")
    return {
        str(public_id): str(delete_status)
        for public_id, delete_status in deleted.items()
    }
