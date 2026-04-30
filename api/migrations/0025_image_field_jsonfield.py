"""Migrate image fields from plain URL strings to {url, cloudinary_public_id} JSON objects.

Step 1 (RunPython): while the columns are still VARCHAR, rewrite each non-empty
value from a bare URL string to a JSON-encoded string so that Django's JSONField
can round-trip them correctly after the AlterField in step 2.

Step 2 (AlterField x2): change the column type from CharField to JSONField.

Reverse direction: convert dicts back to bare URL strings and revert the field type.
"""

import json
import re

from django.db import migrations, models


_PUBLIC_ID_RE = re.compile(r'/image/upload/(?:v\d+/)?(.+?)(?:\.[^./]+)?$')


def _extract_public_id(url: str) -> str | None:
    m = _PUBLIC_ID_RE.search(url)
    return m.group(1) if m else None


def url_to_json(apps, schema_editor):
    """Convert bare URL strings to JSON-encoded {url, cloudinary_public_id} objects.

    The old column is NOT NULL (CharField blank=True), so we cannot store SQL NULL
    directly.  Instead we write the JSON string 'null' for empty/absent images;
    Django's JSONField will decode that as Python None when reading.  Non-empty
    URLs become {"url": "...", "cloudinary_public_id": "..."} JSON strings.
    """
    for table in ('api_glazetype', 'api_glazecombination'):
        # Empty strings → JSON 'null' (the old column is NOT NULL, so SQL NULL
        # is not an option here; JSONField decodes the string 'null' as None).
        schema_editor.execute(
            f"UPDATE {table} SET test_tile_image = 'null' WHERE test_tile_image = ''"
        )

    for model_name in ('GlazeType', 'GlazeCombination'):
        Model = apps.get_model('api', model_name)
        rows = list(Model.objects.exclude(test_tile_image='null'))
        for obj in rows:
            value = obj.test_tile_image
            # Already JSON-encoded (shouldn't happen, but skip gracefully)
            if value.startswith('{'):
                continue
            Model.objects.filter(pk=obj.pk).update(test_tile_image=json.dumps({
                'url': value,
                'cloudinary_public_id': _extract_public_id(value),
            }))


def json_to_url(apps, schema_editor):
    """Reverse: extract the URL from a JSON dict and store it as a bare string.

    NULL values (no image) become empty strings to match the old CharField default.
    """
    for model_name in ('GlazeType', 'GlazeCombination'):
        Model = apps.get_model('api', model_name)
        for obj in Model.objects.all():
            value = obj.test_tile_image
            if value is None:
                Model.objects.filter(pk=obj.pk).update(test_tile_image='')
            elif isinstance(value, dict):
                Model.objects.filter(pk=obj.pk).update(test_tile_image=value.get('url', ''))


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0024_alter_piece_workflow_version"),
    ]

    operations = [
        # Step 1: rewrite VARCHAR values to JSON strings before the column type changes.
        migrations.RunPython(url_to_json, reverse_code=json_to_url),

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
    ]
