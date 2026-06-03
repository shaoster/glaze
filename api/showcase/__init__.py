"""Showcase video planning.

The Storyboard is the render-ready, style-agnostic description of a showcase
slideshow video. Style builders (the first is "keepsake") turn a piece's
effective inputs into a Storyboard deterministically.
"""

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
    "IMAGE_SLIDE_MS",
    "KEEPSAKE_STYLE",
    "KEEPSAKE_STYLE_VERSION",
    "NOTE_SLIDE_MS",
    "STORYBOARD_SCHEMA",
    "STORYBOARD_VERSION",
    "Storyboard",
    "StoryboardSlide",
    "build_keepsake_storyboard",
    "validate_storyboard",
]
