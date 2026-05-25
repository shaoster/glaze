from __future__ import annotations

from typing import Any

from django.db import migrations


def _normalize_tutorial_value(value: Any) -> bool:
    return value is not False and value != "don't"


def backfill_tutorial_preferences(apps, schema_editor) -> None:
    UserProfile = apps.get_model("api", "UserProfile")
    db_alias = schema_editor.connection.alias

    for profile in UserProfile.objects.using(db_alias).all():
        preferences = profile.preferences
        if not isinstance(preferences, dict):
            continue

        tutorials = preferences.get("tutorials")
        if not isinstance(tutorials, dict):
            continue

        normalized_tutorials = {
            key: _normalize_tutorial_value(value) for key, value in tutorials.items()
        }
        if normalized_tutorials == tutorials:
            continue

        updated_preferences = dict(preferences)
        updated_preferences["tutorials"] = normalized_tutorials
        UserProfile.objects.using(db_alias).filter(pk=profile.pk).update(
            preferences=updated_preferences
        )


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0026_glazecombinationlayer_cascade_on_delete"),
    ]

    operations = [
        migrations.RunPython(
            backfill_tutorial_preferences,
            migrations.RunPython.noop,
        ),
    ]
