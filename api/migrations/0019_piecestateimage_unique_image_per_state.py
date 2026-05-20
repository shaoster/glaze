from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0018_backfill_image_user"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="piecestateimage",
            constraint=models.UniqueConstraint(
                fields=["piece_state", "image"],
                name="uniq_piece_state_image",
            ),
        ),
    ]
