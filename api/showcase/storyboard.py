"""Deterministic Keepsake storyboard planning.

Given a piece's effective inputs — metadata, the workflow-backed state timeline,
included images and notes, the potter's narrative, and a selected music track —
``build_keepsake_storyboard`` produces a render-ready :class:`Storyboard`.

The function is pure and deterministic: the same effective inputs always produce
an identical Storyboard. There is no randomness and no wall-clock dependence;
slide ordering is derived entirely from stored fields, and workflow state names
are never hardcoded (labels come from :func:`get_state_friendly_name`).

The authoritative contract is ``storyboard.schema.yml`` at the repo root; every
Storyboard validates against it via :func:`validate_storyboard`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import jsonschema
import yaml

from ..models import Piece
from ..utils import image_to_dict
from ..workflow import get_state_friendly_name

# ── Versions (consumed by the input-hash layer, issue #747) ───────────────────
# Bump STORYBOARD_VERSION when the Storyboard data shape changes; bump
# KEEPSAKE_STYLE_VERSION when the Keepsake builder's output changes for the same
# inputs. They are independent so future styles can reuse the same data shape.
STORYBOARD_VERSION = "1"
KEEPSAKE_STYLE = "keepsake"
KEEPSAKE_STYLE_VERSION = "1"

# ── Deterministic slide durations (milliseconds) ──────────────────────────────
COVER_SLIDE_MS = 4000
IMAGE_SLIDE_MS = 3500
NOTE_SLIDE_MS = 5000

_IMAGE_FIT = "cover"

# Load the JSON Schema once at import. __file__ is api/showcase/storyboard.py, so
# parent.parent.parent is the repo root where the schema lives.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STORYBOARD_SCHEMA: dict = yaml.safe_load(
    (_REPO_ROOT / "storyboard.schema.yml").read_text()
)


def validate_storyboard(data: dict) -> None:
    """Validate a serialized Storyboard against ``storyboard.schema.yml``.

    Raises ``jsonschema.ValidationError`` if the data does not conform.
    """
    jsonschema.validate(instance=data, schema=STORYBOARD_SCHEMA)


# ── Contract dataclasses ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class StoryboardSlide:
    kind: str  # "cover" | "image" | "note"
    key: str
    duration_ms: int
    state_label: str
    image: dict | None = None
    heading: str | None = None
    caption: str | None = None
    text: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Storyboard:
    piece_id: str
    eligible: bool
    ineligible_reason: str | None = None
    music_track_id: str | None = None
    slides: list[StoryboardSlide] = field(default_factory=list)
    storyboard_version: str = STORYBOARD_VERSION
    style: str = KEEPSAKE_STYLE
    style_version: str = KEEPSAKE_STYLE_VERSION

    @property
    def total_duration_ms(self) -> int:
        return sum(slide.duration_ms for slide in self.slides)

    @property
    def slide_count(self) -> int:
        return len(self.slides)

    def to_dict(self) -> dict:
        return {
            "storyboard_version": self.storyboard_version,
            "style": self.style,
            "style_version": self.style_version,
            "piece_id": self.piece_id,
            "eligible": self.eligible,
            "ineligible_reason": self.ineligible_reason,
            "music_track_id": self.music_track_id,
            "total_duration_ms": self.total_duration_ms,
            "slide_count": self.slide_count,
            "slides": [slide.to_dict() for slide in self.slides],
        }


# ── Builder ───────────────────────────────────────────────────────────────────


def _ordered_states(piece: Piece) -> list:
    """Return the piece's states in ascending timeline order.

    Uses the same sort key as ``Piece.current_state`` so ordering is consistent
    with the rest of the app and never depends on workflow state names.
    """
    return sorted(piece.states.all(), key=Piece._state_sort_key)


def _image_key(state_id: str, image: dict, index: int) -> str:
    """Mirror the frontend picker's image key scheme so exclusions line up."""
    ident = image.get("image_id") or image.get("cloudinary_public_id") or str(index)
    return ":".join(part for part in (str(state_id), str(ident)) if part)


def _slide_image(image: dict) -> dict:
    return {
        "url": image.get("url") or "",
        "image_id": image.get("image_id"),
        "cloudinary_public_id": image.get("cloudinary_public_id"),
        "cloud_name": image.get("cloud_name"),
        "crop": image.get("crop"),
        "fit": _IMAGE_FIT,
    }


def _thumbnail_public_id(piece: Piece) -> str:
    if not piece.thumbnail_id:
        return ""
    return (piece.thumbnail.cloudinary_public_id or "").strip()


def build_keepsake_storyboard(
    piece: Piece,
    *,
    excluded_image_keys: Any = (),
    excluded_note_keys: Any = (),
    music_track_id: str | None = None,
) -> Storyboard:
    """Build a deterministic Keepsake :class:`Storyboard` for ``piece``.

    ``excluded_image_keys`` / ``excluded_note_keys`` use the same key schemes as
    the frontend ``ShowcaseVideoInputPicker`` so the potter's exclusions apply
    directly. The piece's thumbnail is the locked cover and cannot be excluded.
    """
    excluded_images = set(excluded_image_keys)
    excluded_notes = set(excluded_note_keys)
    thumb_pid = _thumbnail_public_id(piece)

    # Walk the timeline once, collecting included images (with their captions and
    # state labels) and the included note per state.
    timeline: list[dict] = []
    cover_key: str | None = None
    for state in _ordered_states(piece):
        label = get_state_friendly_name(state.state)
        images: list[dict] = []
        for index, image in enumerate(state.images):
            key = _image_key(state.id, image, index)
            is_thumbnail = (
                bool(thumb_pid)
                and (image.get("cloudinary_public_id") or "").strip() == thumb_pid
            )
            # The thumbnail is the locked cover and is never excluded.
            if not is_thumbnail and key in excluded_images:
                continue
            item = {
                "key": key,
                "image": image,
                "label": label,
                "caption": (image.get("caption") or "").strip() or None,
                "is_thumbnail": is_thumbnail,
            }
            if is_thumbnail and cover_key is None:
                cover_key = key
            images.append(item)

        note_text = (state.notes or "").strip()
        note = (
            {"key": str(state.id), "label": label, "text": note_text}
            if note_text and str(state.id) not in excluded_notes
            else None
        )
        timeline.append({"label": label, "images": images, "note": note})

    all_images = [item for entry in timeline for item in entry["images"]]

    # Resolve the cover slide: prefer the thumbnail-matching state image, then the
    # thumbnail Image directly, then the first included image.
    cover_slide: StoryboardSlide | None = None
    if cover_key is not None:
        cover_item = next(item for item in all_images if item["key"] == cover_key)
        cover_slide = StoryboardSlide(
            kind="cover",
            key=cover_item["key"],
            duration_ms=COVER_SLIDE_MS,
            state_label=cover_item["label"],
            image=_slide_image(cover_item["image"]),
            heading=piece.name,
            text=(piece.showcase_story or "").strip() or None,
        )
    elif piece.thumbnail_id:
        thumb = image_to_dict(piece.thumbnail) or {}
        cover_key = "cover:thumbnail"
        cover_slide = StoryboardSlide(
            kind="cover",
            key=cover_key,
            duration_ms=COVER_SLIDE_MS,
            state_label=get_state_friendly_name(piece.current_state.state)
            if piece.current_state
            else "",
            image=_slide_image(thumb),
            heading=piece.name,
            text=(piece.showcase_story or "").strip() or None,
        )
    elif all_images:
        first = all_images[0]
        cover_key = first["key"]
        cover_slide = StoryboardSlide(
            kind="cover",
            key=first["key"],
            duration_ms=COVER_SLIDE_MS,
            state_label=first["label"],
            image=_slide_image(first["image"]),
            heading=piece.name,
            text=(piece.showcase_story or "").strip() or None,
        )

    if cover_slide is None:
        # Sparse-data fallback: no usable imagery, so there is nothing to show.
        return Storyboard(
            piece_id=str(piece.id),
            eligible=False,
            ineligible_reason="This piece has no included images to build a video.",
            music_track_id=music_track_id,
            slides=[],
        )

    slides: list[StoryboardSlide] = [cover_slide]
    for entry in timeline:
        for item in entry["images"]:
            # The cover image is already shown; do not repeat it.
            if item["key"] == cover_key:
                continue
            slides.append(
                StoryboardSlide(
                    kind="image",
                    key=item["key"],
                    duration_ms=IMAGE_SLIDE_MS,
                    state_label=item["label"],
                    image=_slide_image(item["image"]),
                    caption=item["caption"],
                )
            )
        note = entry["note"]
        if note is not None:
            slides.append(
                StoryboardSlide(
                    kind="note",
                    key=note["key"],
                    duration_ms=NOTE_SLIDE_MS,
                    state_label=note["label"],
                    text=note["text"],
                )
            )

    return Storyboard(
        piece_id=str(piece.id),
        eligible=True,
        ineligible_reason=None,
        music_track_id=music_track_id,
        slides=slides,
    )
