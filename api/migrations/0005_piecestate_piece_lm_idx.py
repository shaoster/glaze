from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0004_supportthread_supportmessage"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="piecestate",
            index=models.Index(
                fields=["piece", "-last_modified"], name="piecestate_piece_lm_idx"
            ),
        ),
    ]
