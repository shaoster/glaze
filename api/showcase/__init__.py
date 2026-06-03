"""Showcase video planning.

The Storyboard is the render-ready, style-agnostic description of a showcase
slideshow video. Style builders (the first is "keepsake") turn a piece's
effective inputs into a Storyboard deterministically.
"""

from .music import (
    DEFAULT_TRACK_ID,
    MUSIC_CATALOG_SCHEMA,
    MusicAudio,
    MusicTrack,
    get_catalog,
    get_track,
    resolve_track_id,
)
from .storyboard import (
    COVER_SLIDE_MS,
    IMAGE_SLIDE_MS,
    KEEPSAKE_STYLE,
    KEEPSAKE_STYLE_VERSION,
    NOTE_SLIDE_MS,
    STORYBOARD_SCHEMA,
    STORYBOARD_VERSION,
    Storyboard,
    StoryboardSlide,
    build_keepsake_storyboard,
    validate_storyboard,
)

__all__ = [
    "COVER_SLIDE_MS",
    "DEFAULT_TRACK_ID",
    "IMAGE_SLIDE_MS",
    "KEEPSAKE_STYLE",
    "KEEPSAKE_STYLE_VERSION",
    "MUSIC_CATALOG_SCHEMA",
    "MusicAudio",
    "MusicTrack",
    "NOTE_SLIDE_MS",
    "STORYBOARD_SCHEMA",
    "STORYBOARD_VERSION",
    "Storyboard",
    "StoryboardSlide",
    "build_keepsake_storyboard",
    "get_catalog",
    "get_track",
    "resolve_track_id",
    "validate_storyboard",
]
