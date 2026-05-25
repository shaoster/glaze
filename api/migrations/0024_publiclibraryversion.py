from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0001_squashed_0001_0023"),
    ]

    operations = [
        migrations.CreateModel(
            name="PublicLibraryVersion",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("fixture_hash", models.CharField(max_length=64)),
                ("imported_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "public library version",
            },
        ),
    ]
