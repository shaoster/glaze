from django.contrib.auth.hashers import make_password
from django.db import migrations


def set_unusable_passwords(apps, schema_editor):
    User = apps.get_model("auth", "User")
    # apps.get_model() returns a historical proxy without model methods like
    # set_unusable_password(); use make_password(None) directly instead.
    User.objects.all().update(password=make_password(None))


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0020_invitecode"),
    ]

    operations = [
        migrations.RunPython(set_unusable_passwords, migrations.RunPython.noop),
    ]
