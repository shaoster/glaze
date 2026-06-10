"""Showcase video planning.

The Storyboard is the render-ready, style-agnostic description of a showcase
slideshow video. Style builders (the first is "keepsake") turn a piece's
effective inputs into a Storyboard deterministically.
"""

from .hash import compute_piece_input_hash
from .music import (
    DEFAULT_TRACK_ID,
    MUSIC_CATALOG_SCHEMA,
    MusicAudio,
    MusicTrack,
    get_catalog,
    get_track,
    resolve_track_id,
)
from .render import (
    SHOWCASE_VIDEO_CANVAS_SIZE,
    SHOWCASE_VIDEO_FORMAT,
    SHOWCASE_VIDEO_FPS,
    SHOWCASE_VIDEO_RENDER_VERSION,
    SHOWCASE_VIDEO_TASK_TYPE,
    compute_storyboard_hash,
    is_showcase_video_cloudinary_enabled,
    render_storyboard_to_mp4,
    upload_storyboard_video_to_cloudinary,
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
    "SHOWCASE_VIDEO_CANVAS_SIZE",
    "SHOWCASE_VIDEO_FORMAT",
    "SHOWCASE_VIDEO_FPS",
    "SHOWCASE_VIDEO_RENDER_VERSION",
    "SHOWCASE_VIDEO_TASK_TYPE",
    "STORYBOARD_SCHEMA",
    "STORYBOARD_VERSION",
    "Storyboard",
    "StoryboardSlide",
    "build_keepsake_storyboard",
    "compute_piece_input_hash",
    "compute_storyboard_hash",
    "is_showcase_video_cloudinary_enabled",
    "get_catalog",
    "get_track",
    "resolve_track_id",
    "render_storyboard_to_mp4",
    "upload_storyboard_video_to_cloudinary",
    "validate_storyboard",
]
