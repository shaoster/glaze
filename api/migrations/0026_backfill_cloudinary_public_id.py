"""Backfill cloudinary_public_id for image fields where it is currently null.

Migration 0025 added cloud_name to all image dicts but did not fix
cloudinary_public_id when it was already null in existing JSON dicts.
That left thumbnails and PieceState images without a public_id, causing
CloudinaryImage to fall back to full-resolution plain <img> instead of
requesting a size-appropriate rendition.  HEIC images became invisible
entirely because browsers cannot display raw HEIC URLs.

This migration re-runs the public_id extraction for every image dict that
has a non-null Cloudinary URL but a null or missing cloudinary_public_id.
"""

import re
from urllib.parse import urlparse

from django.db import migrations


_CLOUDINARY_HOSTNAME = 'res.cloudinary.com'
_TRANSFORM_RE = re.compile(r'^[a-z][a-z0-9]*_')
_VERSION_RE = re.compile(r'^v\d+$')


def _parse_cloudinary_public_id(url: str) -> str | None:
    """Return the public_id parsed from a Cloudinary delivery URL, or None."""
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None
    parts = parsed.path.split('/')
    # parts: ['', cloud_name, 'image', 'upload', ...rest]
    if len(parts) < 5 or parts[2] != 'image' or parts[3] != 'upload':
        return None
    after_upload = parts[4:]
    i = 0
    # Skip leading transform segments (e.g. f_auto, w_100) and version segments.
    while i < len(after_upload) - 1 and (
        _TRANSFORM_RE.match(after_upload[i]) or _VERSION_RE.match(after_upload[i])
    ):
        i += 1
    public_id_parts = after_upload[i:]
    if not public_id_parts:
        return None
    # Strip file extension from the last segment.
    public_id_parts[-1] = re.sub(r'\.[^.]+$', '', public_id_parts[-1])
    result = '/'.join(public_id_parts)
    return result or None


def _fix_image_dict(img: dict) -> dict | None:
    """Return an updated dict with cloudinary_public_id filled in, or None if no change needed."""
    if not isinstance(img, dict):
        return None
    if img.get('cloudinary_public_id') is not None:
        return None
    url = img.get('url') or ''
    public_id = _parse_cloudinary_public_id(url)
    if public_id is None:
        return None
    return {**img, 'cloudinary_public_id': public_id}


def backfill_public_ids(apps, schema_editor):
    PieceState = apps.get_model('api', 'PieceState')
    Piece = apps.get_model('api', 'Piece')
    GlazeType = apps.get_model('api', 'GlazeType')
    GlazeCombination = apps.get_model('api', 'GlazeCombination')

    # Fix PieceState.images arrays.
    for ps in PieceState.objects.exclude(images=[]):
        images = ps.images or []
        updated = []
        changed = False
        for img in images:
            fixed = _fix_image_dict(img)
            if fixed is not None:
                updated.append(fixed)
                changed = True
            else:
                updated.append(img)
        if changed:
            PieceState.objects.filter(pk=ps.pk).update(images=updated)

    # Fix Piece.thumbnail dicts.
    for piece in Piece.objects.filter(thumbnail__isnull=False):
        fixed = _fix_image_dict(piece.thumbnail)
        if fixed is not None:
            Piece.objects.filter(pk=piece.pk).update(thumbnail=fixed)

    # Fix GlazeType and GlazeCombination test_tile_image.
    for Model in (GlazeType, GlazeCombination):
        for obj in Model.objects.filter(test_tile_image__isnull=False):
            fixed = _fix_image_dict(obj.test_tile_image)
            if fixed is not None:
                Model.objects.filter(pk=obj.pk).update(test_tile_image=fixed)


def reverse_backfill_public_ids(apps, schema_editor):
    # The reverse is a no-op: we cannot know which public_ids were originally
    # null vs legitimately populated by the upload flow.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0025_image_field_jsonfield"),
    ]

    operations = [
        migrations.RunPython(
            backfill_public_ids,
            reverse_code=reverse_backfill_public_ids,
        ),
    ]
