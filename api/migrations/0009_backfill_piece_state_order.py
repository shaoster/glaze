from django.db import migrations


def backfill_order(apps, schema_editor):
    Piece = apps.get_model("api", "Piece")
    PieceState = apps.get_model("api", "PieceState")
    for piece in Piece.objects.all():
        for i, ps in enumerate(
            PieceState.objects.filter(piece=piece).order_by("created"), start=1
        ):
            PieceState.objects.filter(pk=ps.pk).update(order=i)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0008_add_editable_mode"),
    ]

    operations = [
        migrations.RunPython(backfill_order, migrations.RunPython.noop),
    ]
