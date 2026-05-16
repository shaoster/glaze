import django.db.models.expressions
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0010_alter_piecestate_options_alter_piecestate_created"),
    ]

    operations = [
        migrations.CreateModel(
            name="AllowedEmail",
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
                (
                    "email",
                    models.EmailField(db_index=True, max_length=254, unique=True),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("waitlisted", "Waitlisted"),
                            ("approved", "Approved"),
                        ],
                        db_index=True,
                        default="approved",
                        max_length=20,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("last_modified", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": [
                    django.db.models.expressions.Case(
                        django.db.models.expressions.When(status="waitlisted", then=0),
                        default=1,
                        output_field=models.IntegerField(),
                    ),
                    "email",
                ],
            },
        ),
    ]
