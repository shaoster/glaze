from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0016_image_dimensions"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="preferences",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
