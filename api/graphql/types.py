"""Strawberry object types for the GraphQL schema.

The types mirror the ``PieceSummarySerializer`` output shape (api/serializers.py)
so the existing frontend mappers consume GraphQL and REST identically. Each type
is constructed from the serializer's dict output via ``from_summary`` rather than
re-deriving field logic.
"""

from __future__ import annotations

import datetime
from typing import Any

import strawberry


def _to_iso(value: Any) -> str | None:
    """Coerce a datetime or already-rendered string to an ISO 8601 string."""
    if value is None:
        return None
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return str(value)


@strawberry.type
class ImageCropType:
    x: float = strawberry.field(
        description="Left edge of the crop region as a fraction of the image width (0–1)."
    )
    y: float = strawberry.field(
        description="Top edge of the crop region as a fraction of the image height (0–1)."
    )
    width: float = strawberry.field(
        description="Width of the crop region as a fraction of the image width (0–1)."
    )
    height: float = strawberry.field(
        description="Height of the crop region as a fraction of the image height (0–1)."
    )

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ImageCropType | None:
        if not data:
            return None
        return cls(x=data["x"], y=data["y"], width=data["width"], height=data["height"])


@strawberry.type
class ThumbnailType:
    url: str = strawberry.field(
        description="Public URL of the original (uncropped) image."
    )
    image_id: str | None = strawberry.field(
        default=None, description="Internal image record ID."
    )
    width: int | None = strawberry.field(
        default=None, description="Original image width in pixels."
    )
    height: int | None = strawberry.field(
        default=None, description="Original image height in pixels."
    )
    crop: ImageCropType | None = strawberry.field(
        default=None,
        description="User-defined crop region applied to the original image.",
    )
    cropped_url: str | None = strawberry.field(
        default=None,
        description="Public URL of the cropped thumbnail, or null if no crop has been applied.",
    )
    r2_key: str | None = strawberry.field(
        default=None, description="Cloudflare R2 storage key for the original image."
    )
    crop_task_failed: bool = strawberry.field(
        default=False,
        description="True if the background crop task for this thumbnail failed.",
    )

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ThumbnailType | None:
        if not data:
            return None
        image_id = data.get("image_id")
        return cls(
            url=data["url"],
            image_id=str(image_id) if image_id is not None else None,
            width=data.get("width"),
            height=data.get("height"),
            crop=ImageCropType.from_dict(data.get("crop")),
            cropped_url=data.get("cropped_url"),
            r2_key=data.get("r2_key"),
            crop_task_failed=data.get("crop_task_failed", False),
        )


@strawberry.type
class TagType:
    id: strawberry.ID = strawberry.field(description="Unique tag identifier.")
    name: str = strawberry.field(description="Human-readable tag label.")
    color: str = strawberry.field(
        description="Hex color string for the tag chip (e.g. '#4caf50')."
    )
    is_public: bool = strawberry.field(
        default=False,
        description="True if this tag belongs to the public library rather than the user.",
    )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TagType:
        return cls(
            id=strawberry.ID(str(data["id"])),
            name=data["name"],
            color=data.get("color", "") or "",
            is_public=bool(data.get("is_public", False)),
        )


@strawberry.type
class CurrentStateType:
    """The piece's current workflow state name (e.g. "completed")."""

    state: str = strawberry.field(
        description='Workflow state name (e.g. "designed", "bisque", "glazed", "completed").'
    )


@strawberry.type
class PieceType:
    id: strawberry.ID = strawberry.field(description="Unique piece identifier (UUID).")
    name: str = strawberry.field(description="User-given name of the piece.")
    created: str | None = strawberry.field(
        description="ISO 8601 timestamp when the piece was first created."
    )
    last_modified: str | None = strawberry.field(
        description="ISO 8601 timestamp of the most recent change to the piece or any of its states."
    )
    photo_count: int = strawberry.field(
        description="Total number of photos attached to this piece across all states."
    )
    shared: bool = strawberry.field(
        description="True if the piece is publicly visible via a share link."
    )
    is_editable: bool = strawberry.field(
        description="True if the piece can have new states added (not in a terminal workflow state)."
    )
    can_edit: bool = strawberry.field(
        description="True if the authenticated user has write permission on this piece."
    )
    showcase_story: str = strawberry.field(
        description="Free-text story field displayed on the public showcase page."
    )
    showcase_fields: list[str] = strawberry.field(
        description="Ordered list of field names shown on the public showcase page."
    )
    current_location: str | None = strawberry.field(
        description="Human-readable label of the kiln or shelf where the piece currently resides, if any."
    )
    current_state: CurrentStateType = strawberry.field(
        description="The piece's current workflow state."
    )
    thumbnail: ThumbnailType | None = strawberry.field(
        description="Thumbnail image for the piece, or null if no photo has been uploaded."
    )
    tags: list[TagType] = strawberry.field(description="Tags attached to this piece.")

    @classmethod
    def from_summary(cls, data: dict[str, Any]) -> PieceType:
        """Build from a ``PieceSummarySerializer`` row."""
        current_state = data.get("current_state") or {}
        return cls(
            id=strawberry.ID(str(data["id"])),
            name=data["name"],
            created=_to_iso(data.get("created")),
            last_modified=_to_iso(data.get("last_modified")),
            photo_count=int(data.get("photo_count") or 0),
            shared=bool(data.get("shared", False)),
            is_editable=bool(data.get("is_editable", False)),
            can_edit=bool(data.get("can_edit", False)),
            showcase_story=data.get("showcase_story") or "",
            showcase_fields=list(data.get("showcase_fields") or []),
            current_location=data.get("current_location"),
            current_state=CurrentStateType(state=current_state.get("state", "")),
            thumbnail=ThumbnailType.from_dict(data.get("thumbnail")),
            tags=[TagType.from_dict(t) for t in (data.get("tags") or [])],
        )


@strawberry.type
class PiecePage:
    """A page of pieces plus the total count of the filtered set."""

    count: int = strawberry.field(
        description="Total number of pieces matching the applied filters (before pagination)."
    )
    results: list[PieceType] = strawberry.field(description="The pieces on this page.")
