from django.db import migrations


def populate_image_user(apps, schema_editor):
    """Backfill Image.user from the owning piece for images linked via PieceStateImage."""
    PieceStateImage = apps.get_model("api", "PieceStateImage")
    Image = apps.get_model("api", "Image")
    for link in PieceStateImage.objects.select_related(
        "image", "piece_state__piece__user"
    ).filter(image__user__isnull=True):
        piece_user = link.piece_state.piece.user
        if piece_user:
            Image.objects.filter(pk=link.image_id, user__isnull=True).update(
                user=piece_user
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
