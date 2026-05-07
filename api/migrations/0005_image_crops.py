from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0004_normalize_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="piece",
            name="thumbnail_crop",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="piecestateimage",
            name="crop",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
