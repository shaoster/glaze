import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0013_remove_allowedemail_email_redundant_index"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CropRun",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("source", models.JSONField()),
                ("crop", models.JSONField(blank=True, null=True)),
                ("mask_asset", models.JSONField(blank=True, null=True)),
                ("latency_ms", models.PositiveIntegerField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("success", "Success"),
                            ("no_subject", "No Subject"),
                            ("error", "Error"),
                        ],
                        max_length=32,
                    ),
                ),
                ("error", models.TextField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created", models.DateTimeField(auto_now_add=True)),
                (
                    "async_task",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="crop_runs",
                        to="api.asynctask",
                    ),
                ),
                (
                    "image",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="crop_runs",
                        to="api.image",
                    ),
                ),
                (
                    "submitter",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="submitted_crop_runs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created"],
            },
        ),
        migrations.AddIndex(
            model_name="croprun",
            index=models.Index(
                fields=["image", "-created"], name="api_croprun_image_i_idx"
            ),
        ),
    ]
