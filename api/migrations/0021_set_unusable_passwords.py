from django.db import migrations


def set_unusable_passwords(apps, schema_editor):
    User = apps.get_model("auth", "User")
    for user in User.objects.all():
        user.set_unusable_password()
        user.save(update_fields=["password"])


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0020_invitecode"),
    ]

    operations = [
        migrations.RunPython(set_unusable_passwords, migrations.RunPython.noop),
    ]
