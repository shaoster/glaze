"""Add the eagerly generated cropped-derivative fields to PieceStateImage.

Schema-only. Backfill for existing coordinate-only crops happens in the
``migrate_assets_to_r2`` management command (pass 2), not here — migrations
must not perform network I/O.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0007_image_r2_key"),
    ]

    operations = [
        migrations.AddField(
            model_name="piecestateimage",
            name="cropped_r2_key",
            field=models.CharField(blank=True, max_length=1024, null=True),
        ),
        migrations.AddField(
            model_name="piecestateimage",
            name="cropped_url",
            field=models.CharField(blank=True, max_length=1024, null=True),
        ),
    ]
