"""SQL+Python composite hash for showcase-video input deduplication and staleness detection.

The hash has two independent halves that are combined into a single sha256 hex string:

- **SQL half** (PostgreSQL): a single query that joins piece → states → images,
  applies the exclusion lists via array anti-joins, and produces an md5 over the
  ordered result set.  All DB-resident data lives here.
- **Python half**: a sha256 over non-DB constants (version strings, music track id,
  and the workflow state-label map) so that bumping any of those constants invalidates
  previously stored hashes.

On non-PostgreSQL backends (e.g. SQLite in dev/test) the DB half falls back to an
equivalent Python implementation using Django ORM queries so that tests can exercise
all code paths without requiring PostgreSQL.
"""

from __future__ import annotations

import hashlib
import json
from uuid import UUID

from django.db import connection

from ..workflow import get_state_label_map
from .music import resolve_track_id
from .render import SHOWCASE_VIDEO_RENDER_VERSION
from .storyboard import KEEPSAKE_STYLE, KEEPSAKE_STYLE_VERSION, STORYBOARD_VERSION

_FIELD = "\x01"  # within-row field separator
_ROW = "\x02"  # between-row separator
_SECTION = "\x03"  # between hash sections in the Python fallback

_DB_HASH_SQL = """
SELECT md5(
  md5(
    COALESCE(p.name, '')            || chr(1) ||
    COALESCE(p.showcase_story, '')  || chr(1) ||
    COALESCE(thumb.id::text, '')    || chr(1) ||
    COALESCE(thumb.url, '')         || chr(1) ||
    COALESCE(thumb.width::text, '') || chr(1) ||
    COALESCE(thumb.height::text, '')
  ) ||
  COALESCE((
    SELECT md5(string_agg(
      ps.state     || chr(1) ||
      ps.id::text  || chr(1) ||
      CASE WHEN ps.id::text = ANY(%s::text[])
        THEN ''
        ELSE COALESCE(ps.notes, '')
      END,
      chr(2) ORDER BY ps."order" ASC NULLS LAST, ps.created ASC
    ))
    FROM api_piecestate ps
    WHERE ps.piece_id = p.id
  ), '') ||
  COALESCE((
    SELECT md5(string_agg(
      psi.image_id::text                       || chr(1) ||
      COALESCE(img.url, '')                    || chr(1) ||
      COALESCE(img.width::text, '')            || chr(1) ||
      COALESCE(img.height::text, '')           || chr(1) ||
      COALESCE(psi.caption, '')                || chr(1) ||
      COALESCE(psi.crop::text, ''),
      chr(2) ORDER BY
        ps2."order" ASC NULLS LAST,
        ps2.created ASC,
        psi."order" ASC,
        psi.id ASC
    ))
    FROM api_piecestate ps2
    JOIN api_piecestateimage psi ON psi.piece_state_id = ps2.id
    JOIN api_image img ON img.id = psi.image_id
    WHERE ps2.piece_id = p.id
      AND (ps2.id::text || ':' || psi.image_id::text) != ALL(%s::text[])
  ), '')
) AS db_hash
FROM api_piece p
LEFT JOIN api_image thumb ON p.thumbnail_id = thumb.id
WHERE p.id = %s::uuid
"""


def _compute_db_hash_postgres(
    piece_id: str,
    excluded_note_keys: list[str],
    excluded_image_keys: list[str],
) -> str:
    with connection.cursor() as cursor:
        cursor.execute(
            _DB_HASH_SQL,
            [excluded_note_keys, excluded_image_keys, piece_id],
        )
        row = cursor.fetchone()
    return row[0] if row and row[0] else ""


def _compute_db_hash_python(
    piece_id: str,
    excluded_note_keys: list[str],
    excluded_image_keys: list[str],
) -> str:
    """Backend-agnostic fallback used on non-PostgreSQL databases (e.g. SQLite in tests)."""
    from ..models import Piece, PieceState, PieceStateImage

    try:
        piece = Piece.objects.select_related("thumbnail").get(pk=piece_id)
    except Piece.DoesNotExist:
        return ""

    thumb = piece.thumbnail
    piece_part = _FIELD.join(
        [
            piece.name or "",
            piece.showcase_story or "",
            str(thumb.id) if thumb else "",
            thumb.url if thumb else "",
            str(thumb.width) if (thumb and thumb.width is not None) else "",
            str(thumb.height) if (thumb and thumb.height is not None) else "",
        ]
    )

    excluded_notes = set(excluded_note_keys)
    states = list(
        PieceState.objects.filter(piece_id=piece_id).order_by("order", "created")
    )
    state_rows = []
    for ps in states:
        note = "" if str(ps.id) in excluded_notes else (ps.notes or "")
        state_rows.append(ps.state + _FIELD + str(ps.id) + _FIELD + note)
    states_part = _ROW.join(state_rows)

    excluded_images = set(excluded_image_keys)
    state_ids = [ps.id for ps in states]
    state_order_map: dict = {
        ps.id: (ps.order if ps.order is not None else 2**31, ps.created)
        for ps in states
    }
    image_links = list(
        PieceStateImage.objects.filter(piece_state_id__in=state_ids).select_related(
            "image"
        )
    )
    image_links.sort(
        key=lambda lnk: (
            state_order_map.get(lnk.piece_state_id, (2**31, ""))[0],
            state_order_map.get(lnk.piece_state_id, (2**31, ""))[1],
            lnk.order,
            lnk.id,
        )
    )
    image_rows = []
    for lnk in image_links:
        key = str(lnk.piece_state_id) + ":" + str(lnk.image_id)
        if key in excluded_images:
            continue
        img = lnk.image
        image_rows.append(
            _FIELD.join(
                [
                    str(lnk.image_id),
                    img.url or "",
                    str(img.width) if img.width is not None else "",
                    str(img.height) if img.height is not None else "",
                    lnk.caption or "",
                    str(lnk.crop) if lnk.crop else "",
                ]
            )
        )
    images_part = _ROW.join(image_rows)

    combined = _SECTION.join([piece_part, states_part, images_part])
    return hashlib.md5(combined.encode("utf-8")).hexdigest()


def _compute_db_hash(
    piece_id: str,
    excluded_note_keys: list[str],
    excluded_image_keys: list[str],
) -> str:
    if connection.vendor == "postgresql":
        return _compute_db_hash_postgres(
            piece_id, excluded_note_keys, excluded_image_keys
        )
    return _compute_db_hash_python(piece_id, excluded_note_keys, excluded_image_keys)


def _compute_python_hash(music_track_id: str | None) -> str:
    data = {
        "storyboard_version": STORYBOARD_VERSION,
        "style": KEEPSAKE_STYLE,
        "style_version": KEEPSAKE_STYLE_VERSION,
        "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        "music_track_id": resolve_track_id(music_track_id),
        "state_labels": get_state_label_map(),
    }
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode("utf-8")).hexdigest()


def compute_piece_input_hash(
    piece_id: str | UUID,
    excluded_image_keys: list[str],
    excluded_note_keys: list[str],
    music_track_id: str | None,
) -> str:
    """Return a deterministic hash over a piece's DB content and render constants.

    The hash encodes which images and notes are included (via the exclusion lists),
    the music track, all version strings, and the current workflow state labels.
    Changing any of these inputs produces a different hash.

    Existing tasks carry hashes computed by the old Python-only ``compute_storyboard_hash``
    function.  Those hashes will not match hashes produced by this function, so existing
    tasks will appear stale until the user triggers a regeneration.
    """
    pid = str(piece_id)
    db_hash = _compute_db_hash(pid, excluded_note_keys, excluded_image_keys)
    python_hash = _compute_python_hash(music_track_id)
    combined = (db_hash + "|" + python_hash).encode("utf-8")
    return hashlib.sha256(combined).hexdigest()
