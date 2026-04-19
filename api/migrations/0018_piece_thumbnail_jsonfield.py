import json

from django.db import migrations


def convert_thumbnail_to_json(apps, schema_editor):
    """
    Convert existing string thumbnail values to JSON while the column is still
    VARCHAR. Empty strings become NULL; non-empty strings become the JSON
    representation of {"url": "...", "cloudinary_public_id": null}.
    This runs before the AlterField migration so that all rows contain either
    NULL or valid JSON when the JSONField's CHECK constraint is applied.
    """
    schema_editor.execute(
        "UPDATE api_piece SET thumbnail = NULL WHERE thumbnail = ''"
    )
    # Fetch and update rows with non-null, non-empty thumbnails.
    # Use raw SQL so we stay independent of the model state at migration time.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT id, thumbnail FROM api_piece WHERE thumbnail IS NOT NULL")
        rows = cursor.fetchall()
    for piece_id, raw in rows:
        if not raw.startswith('{'):
            json_value = json.dumps({'url': raw, 'cloudinary_public_id': None})
            schema_editor.execute(
                "UPDATE api_piece SET thumbnail = %s WHERE id = %s",
                [json_value, piece_id],
            )


def revert_thumbnail_to_string(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT id, thumbnail FROM api_piece WHERE thumbnail IS NOT NULL")
        rows = cursor.fetchall()
    for piece_id, raw in rows:
        try:
            obj = json.loads(raw)
            schema_editor.execute(
                "UPDATE api_piece SET thumbnail = %s WHERE id = %s",
                [obj.get('url', '') or '', piece_id],
            )
        except (json.JSONDecodeError, TypeError):
            pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_add_apply_thin_to_glaze_combination'),
    ]

    operations = [
        migrations.RunPython(convert_thumbnail_to_json, revert_thumbnail_to_string),
    ]
