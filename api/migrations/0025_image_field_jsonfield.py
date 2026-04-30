"""Migrate image fields to {url, cloudinary_public_id, cloud_name} JSON.

GlobalImage fields on GlazeType and GlazeCombination:
  Step 1a (RunPython): convert empty VARCHAR values to the JSON string 'null'
    so the NOT NULL constraint is satisfied before the AlterField.
  Step 1b (RunPython): convert URL strings to JSON dicts with cloud_name backfilled.
  Step 2 (AlterField x2): change test_tile_image from CharField to JSONField.

Piece photos and thumbnails:
  Step 3 (RunPython): backfill cloud_name into PieceState.images array items
    and Piece.thumbnail dict in-place (column type does not change).

Reverse: extract URLs from dicts and revert field types.
"""

import json
import re
from urllib.parse import urlparse

from django.db import migrations, models


_CLOUDINARY_HOSTNAME = 'res.cloudinary.com'
_TRANSFORM_RE = re.compile(r'^[a-z][a-z0-9]*_')


def _parse_cloudinary_url(url: str) -> tuple[str | None, str | None]:
    """Return (cloud_name, public_id) parsed from a Cloudinary delivery URL.

    Skips leading transform segments (e.g. f_auto, w_100) before the public_id
    and strips the file extension from the last path segment.  Returns
    (None, None) for non-Cloudinary URLs.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return None, None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None, None
    parts = parsed.path.split('/')
    # parts: ['', cloudName, 'image', 'upload', ...rest]
    if len(parts) < 5 or parts[2] != 'image' or parts[3] != 'upload':
        return None, None
    cloud_name = parts[1] or None
    after_upload = parts[4:]
    i = 0
    while i < len(after_upload) - 1 and _TRANSFORM_RE.match(after_upload[i]):
        i += 1
    public_id_parts = after_upload[i:]
    if not public_id_parts:
        return cloud_name, None
    public_id_parts[-1] = re.sub(r'\.[^.]+$', '', public_id_parts[-1])
    result = '/'.join(public_id_parts)
    return cloud_name, (result if result else None)


# ---------------------------------------------------------------------------
# Step 1: GlobalImage fields (GlazeType, GlazeCombination)
# ---------------------------------------------------------------------------

def global_images_url_to_json(apps, schema_editor):
    """Convert bare URL strings in test_tile_image to JSON dicts.

    The old column is NOT NULL (CharField blank=True default=''), so SQL NULL
    cannot be written.  Empty strings become the JSON string 'null' (decoded
    by JSONField as Python None).  Non-empty URLs become full image dicts.
    """
    for table in ('api_glazetype', 'api_glazecombination'):
        schema_editor.execute(
            f"UPDATE {table} SET test_tile_image = 'null' WHERE test_tile_image = ''"
        )
    for model_name in ('GlazeType', 'GlazeCombination'):
        Model = apps.get_model('api', model_name)
        for obj in Model.objects.exclude(test_tile_image='null'):
            value = obj.test_tile_image
            if value.startswith('{'):
                # Already a JSON dict — add cloud_name if missing.
                try:
                    d = json.loads(value)
                    if 'cloud_name' not in d:
                        cloud_name, _ = _parse_cloudinary_url(d.get('url', ''))
                        d['cloud_name'] = cloud_name
                        Model.objects.filter(pk=obj.pk).update(
                            test_tile_image=json.dumps(d)
                        )
                except (ValueError, KeyError):
                    pass
                continue
            cloud_name, public_id = _parse_cloudinary_url(value)
            Model.objects.filter(pk=obj.pk).update(test_tile_image=json.dumps({
                'url': value,
                'cloudinary_public_id': public_id,
                'cloud_name': cloud_name,
            }))


def global_images_json_to_url(apps, schema_editor):
    for model_name in ('GlazeType', 'GlazeCombination'):
        Model = apps.get_model('api', model_name)
        for obj in Model.objects.all():
            value = obj.test_tile_image
            if value is None:
                Model.objects.filter(pk=obj.pk).update(test_tile_image='')
            elif isinstance(value, dict):
                Model.objects.filter(pk=obj.pk).update(
                    test_tile_image=value.get('url', '')
                )


# ---------------------------------------------------------------------------
# Step 3: PieceState.images and Piece.thumbnail
# ---------------------------------------------------------------------------

def _with_cloud_name(image: dict) -> dict:
    if 'cloud_name' not in image:
        cloud_name, _ = _parse_cloudinary_url(image.get('url', ''))
        return {**image, 'cloud_name': cloud_name}
    return image


def piece_images_add_cloud_name(apps, schema_editor):
    PieceState = apps.get_model('api', 'PieceState')
    Piece = apps.get_model('api', 'Piece')

    for ps in PieceState.objects.exclude(images=[]):
        images = ps.images or []
        updated = [_with_cloud_name(img) if isinstance(img, dict) else img
                   for img in images]
        if updated != images:
            PieceState.objects.filter(pk=ps.pk).update(images=updated)

    for piece in Piece.objects.filter(thumbnail__isnull=False):
        t = piece.thumbnail
        if isinstance(t, dict) and 'cloud_name' not in t:
            cloud_name, _ = _parse_cloudinary_url(t.get('url', ''))
            Piece.objects.filter(pk=piece.pk).update(
                thumbnail={**t, 'cloud_name': cloud_name}
            )


def piece_images_remove_cloud_name(apps, schema_editor):
    PieceState = apps.get_model('api', 'PieceState')
    Piece = apps.get_model('api', 'Piece')

    for ps in PieceState.objects.exclude(images=[]):
        images = ps.images or []
        updated = [{k: v for k, v in img.items() if k != 'cloud_name'}
                   if isinstance(img, dict) else img for img in images]
        if updated != images:
            PieceState.objects.filter(pk=ps.pk).update(images=updated)

    for piece in Piece.objects.filter(thumbnail__isnull=False):
        t = piece.thumbnail
        if isinstance(t, dict) and 'cloud_name' in t:
            Piece.objects.filter(pk=piece.pk).update(
                thumbnail={k: v for k, v in t.items() if k != 'cloud_name'}
            )


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0024_alter_piece_workflow_version"),
    ]

    operations = [
        # Step 1: convert GlazeType/GlazeCombination test_tile_image to JSON dicts.
        migrations.RunPython(global_images_url_to_json, reverse_code=global_images_json_to_url),

        # Step 2: change column type to JSONField.
        migrations.AlterField(
            model_name="glazecombination",
            name="test_tile_image",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AlterField(
            model_name="glazetype",
            name="test_tile_image",
            field=models.JSONField(blank=True, default=None, null=True),
        ),

        # Step 3: backfill cloud_name into PieceState.images and Piece.thumbnail.
        migrations.RunPython(
            piece_images_add_cloud_name,
            reverse_code=piece_images_remove_cloud_name,
        ),
    ]
