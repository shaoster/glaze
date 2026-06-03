"""Showcase video music catalog.

A small, curated catalog of royalty-free tracks the potter can attach to a
Keepsake video. The catalog is static data defined in ``music_catalog.yml`` at
the repo root (validated against ``music_catalog.schema.yml``) and shared with
the frontend, which imports the same YAML directly.

The catalog is the lookup table behind the storyboard's ``music_track_id``: the
storyboard stores the stable id, and the renderer resolves it to an audio asset
through :func:`get_track`. :func:`resolve_track_id` applies the deterministic
default so a track is always present in the hashed storyboard inputs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import jsonschema
import yaml

# __file__ is api/showcase/music.py, so parent.parent.parent is the repo root
# where the catalog and its schema live (mirrors storyboard.py).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MUSIC_CATALOG_SCHEMA: dict = yaml.safe_load(
    (_REPO_ROOT / "music_catalog.schema.yml").read_text()
)
_RAW_CATALOG: dict = yaml.safe_load((_REPO_ROOT / "music_catalog.yml").read_text())


@dataclass(frozen=True)
class MusicAudio:
    # ``format`` is the target lossless container; ``url`` is the hosted asset,
    # or None until the render pipeline hosts one.
    format: Literal["flac", "wav"]
    url: str | None


@dataclass(frozen=True)
class MusicTrack:
    track_id: str
    title: str
    artist: str
    genre: str
    mood: str
    license: str
    license_url: str | None
    artist_url: str
    source_url: str
    download_url: str
    attribution: str
    audio: MusicAudio

    def to_dict(self) -> dict:
        return asdict(self)


def _build_catalog() -> dict[str, MusicTrack]:
    """Validate the raw catalog and build the ordered track map."""
    jsonschema.validate(instance=_RAW_CATALOG, schema=MUSIC_CATALOG_SCHEMA)

    default_id = _RAW_CATALOG["default_track_id"]
    raw_tracks: dict = _RAW_CATALOG["tracks"]
    if default_id not in raw_tracks:
        raise ValueError(
            f"default_track_id {default_id!r} is not a track in music_catalog.yml"
        )

    tracks: dict[str, MusicTrack] = {}
    for track_id, raw in raw_tracks.items():
        audio = raw["audio"]
        audio_url: str | None = audio["url"]
        if audio_url is not None and not audio_url.startswith(("http://", "https://")):
            # Repo-relative path: verify the file actually exists so a typo
            # surfaces at startup rather than silently at render time.
            resolved = _REPO_ROOT / audio_url
            if not resolved.exists():
                raise FileNotFoundError(
                    f"audio.url for track {track_id!r} points at {audio_url!r} "
                    f"but {resolved} does not exist. "
                    "Check that git-LFS objects are fetched."
                )
        tracks[track_id] = MusicTrack(
            track_id=track_id,
            title=raw["title"],
            artist=raw["artist"],
            genre=raw["genre"],
            mood=raw["mood"],
            license=raw["license"],
            license_url=raw["license_url"],
            artist_url=raw["artist_url"],
            source_url=raw["source_url"],
            download_url=raw["download_url"],
            attribution=raw["attribution"],
            audio=MusicAudio(format=audio["format"], url=audio_url),
        )
    return tracks


_CATALOG: dict[str, MusicTrack] | None = None
DEFAULT_TRACK_ID: str = _RAW_CATALOG["default_track_id"]


def _catalog() -> dict[str, MusicTrack]:
    global _CATALOG
    if _CATALOG is None:
        _CATALOG = _build_catalog()
    return _CATALOG


def get_catalog() -> list[MusicTrack]:
    """Return all tracks in catalog (declaration) order."""
    return list(_catalog().values())


def get_track(track_id: str | None) -> MusicTrack | None:
    """Return the track for ``track_id``, or ``None`` if it is unknown/None."""
    if track_id is None:
        return None
    return _catalog().get(track_id)


def resolve_track_id(track_id: str | None) -> str:
    """Resolve an optional selection to a concrete catalog track id.

    ``None`` resolves to :data:`DEFAULT_TRACK_ID` (the deterministic default). A
    non-null id that is not in the catalog is a programming/data error and
    raises :class:`ValueError`.

    This is intentionally strict: an unknown id reaching here means the storyboard
    inputs are inconsistent, and silently defaulting would hide that. Validate a
    potter-supplied selection at the API/serializer boundary (where it can be
    surfaced as a 400) rather than relying on this to coerce bad input.
    """
    if track_id is None:
        return DEFAULT_TRACK_ID
    if track_id not in _catalog():
        raise ValueError(f"Unknown music track id: {track_id!r}")
    return track_id
