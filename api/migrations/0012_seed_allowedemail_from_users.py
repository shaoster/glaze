from django.db import migrations


def seed_allowedemail(apps, schema_editor):
    User = apps.get_model("auth", "User")
    AllowedEmail = apps.get_model("api", "AllowedEmail")
    emails = User.objects.values_list("email", flat=True).distinct()
    AllowedEmail.objects.bulk_create(
        [AllowedEmail(email=e, status="approved") for e in emails if e],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0011_allowedemail"),
    ]

    operations = [
        migrations.RunPython(seed_allowedemail, migrations.RunPython.noop),
    ]
