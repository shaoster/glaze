import hashlib

from django.db import migrations


def scrub_pii(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("api", "UserProfile")

    for profile in UserProfile.objects.select_related("user").all():
        raw_sub = profile.openid_subject
        # Skip accounts already holding a sha256 hex digest (64 chars, all hex).
        if len(raw_sub) == 64 and all(c in "0123456789abcdef" for c in raw_sub):
            continue

        hashed = hashlib.sha256(raw_sub.encode()).hexdigest()
        profile.openid_subject = hashed
        profile.save(update_fields=["openid_subject"])

        user = profile.user
        user.username = hashed
        user.email = ""
        user.save(update_fields=["username", "email"])


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0021_set_unusable_passwords"),
    ]

    operations = [
        migrations.RunPython(scrub_pii, migrations.RunPython.noop),
    ]
