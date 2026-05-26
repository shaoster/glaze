from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0028_flatten_tutorial_preferences"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="piece",
            name="thumbnail_crop",
        ),
    ]
