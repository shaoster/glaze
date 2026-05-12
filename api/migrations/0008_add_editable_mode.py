from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0007_piece_showcase_fields_piece_showcase_story"),
    ]

    operations = [
        migrations.AddField(
            model_name="piece",
            name="is_editable",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="piecestate",
            name="order",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="piecestate",
            name="has_been_edited",
            field=models.BooleanField(default=False),
        ),
    ]
