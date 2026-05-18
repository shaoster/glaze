import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0014_croprun"),
    ]

    operations = [
        migrations.AddField(
            model_name="croprun",
            name="piece_state_image",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="crop_runs",
                to="api.piecestateimage",
            ),
        ),
        migrations.AddIndex(
            model_name="croprun",
            index=models.Index(
                fields=["piece_state_image", "-created"],
                name="api_croprun_psi_created_idx",
            ),
        ),
    ]
