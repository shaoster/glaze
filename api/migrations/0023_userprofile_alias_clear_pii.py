from django.db import migrations, models


def clear_pii_fields(apps, schema_editor):
    User = apps.get_model("auth", "User")
    User.objects.all().update(first_name="", last_name="", email="")


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0022_scrub_pii_from_existing_users"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="alias",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.RunPython(clear_pii_fields, migrations.RunPython.noop),
    ]
