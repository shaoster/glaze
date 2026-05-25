from pathlib import Path

import jsonschema
import pytest
import yaml

from api.preferences import UserPreferencesSerializer, get_preferences_config


def test_user_preferences_yml_validates_against_schema():
    """Verify that user_preferences.yml strictly adheres to its JSON Schema."""
    root = Path(__file__).resolve().parent.parent.parent
    schema_path = root / "user_preferences.schema.yml"
    config_path = root / "user_preferences.yml"

    schema = yaml.safe_load(schema_path.read_text())
    config = yaml.safe_load(config_path.read_text())

    jsonschema.validate(instance=config, schema=schema)


def test_user_preferences_serializer_fields():
    """Verify that UserPreferencesSerializer is correctly generated from YAML."""
    serializer = UserPreferencesSerializer()
    fields = serializer.fields

    # storage: UserProfile fields should be at the top level
    assert "alias" in fields

    # storage: UserProfile.preferences fields should be inside 'preferences'
    assert "preferences" in fields
    pref_fields = fields["preferences"].fields
    assert "process_summary_fields" in pref_fields
    assert "summary_customize_popover" in pref_fields
    assert "change_alias_prompt" in pref_fields


def test_user_preferences_serializer_validation():
    """Verify that the generated serializer correctly validates typical data."""
    data = {
        "alias": "New Name",
        "preferences": {
            "process_summary_fields": ["field1"],
            "summary_customize_popover": False,
        },
    }
    serializer = UserPreferencesSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["alias"] == "New Name"
    assert (
        serializer.validated_data["preferences"]["summary_customize_popover"] is False
    )
