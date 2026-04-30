"""Backfill cloudinary_public_id for image fields where it is currently null.

This migration has already been applied in all environments. The RunPython
step is now a no-op; the migration record is kept to preserve the dependency
chain.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0025_image_field_jsonfield"),
    ]

    operations = [
        migrations.RunPython(
            migrations.RunPython.noop,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
