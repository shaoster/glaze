"""Add Image lineage fields and replace PSI flat crop fields with a FK.

Image gains:
  - derived_from (FK → self, nullable)
  - derived_type (CharField 32, nullable)

PieceStateImage gains:
  - cropped_image (FK → Image, nullable, SET_NULL)

PieceStateImage loses:
  - cropped_r2_key
  - cropped_url

All existing cropped_r2_key / cropped_url data is discarded; the
migrate_assets_to_r2 command (pass 2) will regenerate crop derivatives and
populate cropped_image for any row that still has crop set.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0008_piecestateimage_cropped_fields"),
    ]

    operations = [
        # Image lineage
        migrations.AddField(
            model_name="image",
            name="derived_from",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="derivatives",
                to="api.image",
            ),
        ),
        migrations.AddField(
            model_name="image",
            name="derived_type",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        # Replace flat PSI crop fields with a first-class FK
        migrations.AddField(
            model_name="piecestateimage",
            name="cropped_image",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="crop_links",
                to="api.image",
            ),
        ),
        migrations.RemoveField(
            model_name="piecestateimage",
            name="cropped_r2_key",
        ),
        migrations.RemoveField(
            model_name="piecestateimage",
            name="cropped_url",
        ),
    ]
