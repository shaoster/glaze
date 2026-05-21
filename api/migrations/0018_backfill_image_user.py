from django.db import migrations


def populate_image_user(apps, schema_editor):
    """Backfill Image.user from the owning piece for images linked via PieceStateImage."""
    PieceStateImage = apps.get_model("api", "PieceStateImage")
    Image = apps.get_model("api", "Image")
    image_ids = (
        PieceStateImage.objects.filter(image__user__isnull=True)
        .values_list("image_id", flat=True)
        .distinct()
    )
    for image_id in image_ids:
        owner_ids = list(
            PieceStateImage.objects.filter(image_id=image_id)
            .exclude(piece_state__piece__user_id__isnull=True)
            .values_list("piece_state__piece__user_id", flat=True)
            .distinct()
        )
        if len(owner_ids) != 1:
            continue
        Image.objects.filter(pk=image_id, user__isnull=True).update(
            user_id=owner_ids[0]
        )


def reverse_populate_image_user(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0017_userprofile_preferences"),
    ]

    operations = [
        migrations.RunPython(
            populate_image_user,
            reverse_code=reverse_populate_image_user,
        ),
    ]
