"""Backfill cloud_name for PieceState images and Piece thumbnails.

This migration has already been applied in all environments. The RunPython
step is now a no-op; the migration record is kept to preserve the dependency
chain.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0026_backfill_cloudinary_public_id"),
    ]

    operations = [
        migrations.RunPython(
            migrations.RunPython.noop,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
