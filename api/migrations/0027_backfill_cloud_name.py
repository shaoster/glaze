"""Backfill cloud_name for PieceState images and Piece thumbnails.

Migration 0025 was rewritten in-place to add a cloud_name backfill step for
PieceState.images and Piece.thumbnail.  Because Django tracks migrations by
name, that step never ran on databases where 0025 was already applied — only
the AlterField schema operations were recorded as pending and executed.

This migration performs the backfill that 0025 should have run.  It is
logically equivalent to migration 0025's piece_images_add_cloud_name
RunPython step, but as a new migration that will actually execute.
"""

import re
from urllib.parse import urlparse

from django.db import migrations


_CLOUDINARY_HOSTNAME = 'res.cloudinary.com'
_TRANSFORM_RE = re.compile(r'^[a-z]{1,4}_')
_VERSION_RE = re.compile(r'^v\d+$')


def _parse_cloud_name(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None
    parts = parsed.path.split('/')
    # parts: ['', cloud_name, 'image', 'upload', ...]
    if len(parts) < 4 or parts[2] != 'image' or parts[3] != 'upload':
        return None
    return parts[1] or None


def backfill_cloud_names(apps, schema_editor):
    PieceState = apps.get_model('api', 'PieceState')
    Piece = apps.get_model('api', 'Piece')

    for ps in PieceState.objects.exclude(images=[]):
        images = ps.images or []
        updated = []
        changed = False
        for img in images:
            if isinstance(img, dict) and 'cloud_name' not in img:
                updated.append({**img, 'cloud_name': _parse_cloud_name(img.get('url', ''))})
                changed = True
            else:
                updated.append(img)
        if changed:
            PieceState.objects.filter(pk=ps.pk).update(images=updated)

    for piece in Piece.objects.filter(thumbnail__isnull=False):
        t = piece.thumbnail
        if isinstance(t, dict) and 'cloud_name' not in t:
            Piece.objects.filter(pk=piece.pk).update(
                thumbnail={**t, 'cloud_name': _parse_cloud_name(t.get('url', ''))}
            )


def reverse_backfill_cloud_names(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0026_backfill_cloudinary_public_id"),
    ]

    operations = [
        migrations.RunPython(
            backfill_cloud_names,
            reverse_code=reverse_backfill_cloud_names,
        ),
    ]
