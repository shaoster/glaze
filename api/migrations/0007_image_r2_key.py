"""Replace the Image model's Cloudinary identity with an R2 object key.

Schema-only apart from a preflight data dedup: the previous model allowed
multiple rows per URL (uniqueness was scoped to the Cloudinary identity), so
duplicate-URL rows must be merged before the unconditional UniqueConstraint
on ``url`` can be added. No network I/O happens here — asset migration to R2
is handled by the ``migrate_assets_to_r2`` management command.
"""

from django.db import IntegrityError, migrations, models, transaction
from django.db.models import Count, Q


def _dedup_image_urls(apps, schema_editor):
    """Merge Image rows sharing a URL into the oldest row per URL."""
    Image = apps.get_model("api", "Image")

    duplicate_urls = (
        Image.objects.values("url")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
        .values_list("url", flat=True)
    )
    for url in list(duplicate_urls):
        rows = list(Image.objects.filter(url=url).order_by("created", "id"))
        keeper, duplicates = rows[0], rows[1:]
        for duplicate in duplicates:
            for rel in Image._meta.related_objects:
                related_model = rel.related_model
                field_name = rel.field.name
                qs = related_model._default_manager.filter(**{field_name: duplicate.pk})
                for related_row in qs:
                    try:
                        with transaction.atomic():
                            setattr(related_row, f"{field_name}_id", keeper.pk)
                            related_row.save(update_fields=[f"{field_name}_id"])
                    except IntegrityError:
                        # The keeper is already linked where uniqueness applies
                        # (e.g. PieceStateImage's (piece_state, image)) — the
                        # duplicate link is redundant.
                        related_row.delete()
            duplicate.delete()


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("api", "0006_cascade_on_delete"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="image",
            name="uniq_image_cloudinary_identity",
        ),
        migrations.RemoveConstraint(
            model_name="image",
            name="uniq_image_url_without_cloudinary_id",
        ),
        migrations.RunPython(_dedup_image_urls, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="image",
            name="cloudinary_public_id",
        ),
        migrations.RemoveField(
            model_name="image",
            name="cloud_name",
        ),
        migrations.AddField(
            model_name="image",
            name="r2_key",
            field=models.CharField(blank=True, max_length=1024, null=True),
        ),
        migrations.AddConstraint(
            model_name="image",
            constraint=models.UniqueConstraint(fields=("url",), name="uniq_image_url"),
        ),
        migrations.AddConstraint(
            model_name="image",
            constraint=models.UniqueConstraint(
                condition=Q(("r2_key__isnull", False)),
                fields=("r2_key",),
                name="uniq_image_r2_key",
            ),
        ),
    ]
