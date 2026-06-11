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
    x: float
    y: float
    width: float
    height: float

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ImageCropType | None:
        if not data:
            return None
        return cls(x=data["x"], y=data["y"], width=data["width"], height=data["height"])


@strawberry.type
class ThumbnailType:
    url: str
    image_id: str | None = None
    width: int | None = None
    height: int | None = None
    crop: ImageCropType | None = None
    cropped_url: str | None = None

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
        )


@strawberry.type
class TagType:
    id: strawberry.ID
    name: str
    color: str
    is_public: bool = False

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

    state: str


@strawberry.type
class PieceType:
    id: strawberry.ID
    name: str
    created: str | None
    last_modified: str | None
    photo_count: int
    shared: bool
    is_editable: bool
    can_edit: bool
    showcase_story: str
    showcase_fields: list[str]
    current_location: str | None
    current_state: CurrentStateType
    thumbnail: ThumbnailType | None
    tags: list[TagType]

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

    count: int
    results: list[PieceType]
