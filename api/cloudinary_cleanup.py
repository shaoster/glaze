import os
from dataclasses import dataclass

import cloudinary
import cloudinary.api
import cloudinary.exceptions
from cloudinary import CloudinaryImage

from .models import Image


@dataclass(frozen=True)
class CloudinaryCleanupAsset:
    public_id: str
    url: str
    thumbnail_url: str
    bytes: int | None
    created_at: str | None
    referenced: bool


def configure_cloudinary_admin() -> None:
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


def list_referenced_public_ids() -> set[str]:
    public_ids = (
        Image.objects.filter(cloudinary_public_id__isnull=False)
        .exclude(cloudinary_public_id="")
        .values_list("cloudinary_public_id", flat=True)
    )
    return {public_id for public_id in public_ids if public_id is not None}


def list_cloudinary_assets(max_results: int = 500) -> list[CloudinaryCleanupAsset]:
    configure_cloudinary_admin()
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
                    url=str(resource.get("secure_url") or resource.get("url") or ""),
                    thumbnail_url=CloudinaryImage(public_id).build_url(
                        width=96,
                        height=96,
                        crop="fill",
                        format="jpg",
                        secure=True,
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
        raise ValueError("Unable to delete Cloudinary assets.") from exc
    deleted = result.get("deleted", {})
    if not isinstance(deleted, dict):
        raise ValueError("Cloudinary returned an unexpected delete payload.")
    return {
        str(public_id): str(delete_status)
        for public_id, delete_status in deleted.items()
    }
