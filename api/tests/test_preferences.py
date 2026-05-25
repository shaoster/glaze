from pathlib import Path

import jsonschema
import yaml

from api.preferences import (
    UserPreferencesSerializer,
    get_tutorials_config,
)


def test_user_preferences_yml_validates_against_schema():
    """Verify that user_preferences.yml strictly adheres to its JSON Schema."""
    root = Path(__file__).resolve().parent.parent.parent
    schema_path = root / "user_preferences.schema.yml"
    config_path = root / "user_preferences.yml"

    schema = yaml.safe_load(schema_path.read_text())
    config = yaml.safe_load(config_path.read_text())

    jsonschema.validate(instance=config, schema=schema)


def test_tutorials_yml_validates_against_schema():
    """Verify that tutorials.yml strictly adheres to its JSON Schema."""
    root = Path(__file__).resolve().parent.parent.parent
    schema_path = root / "tutorials.schema.yml"
    config_path = root / "tutorials.yml"

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

    # Dynamic tutorial fields should be present
    tutorials = get_tutorials_config().get("tutorials", {})
    for tutorial_id in tutorials:
        assert tutorial_id in pref_fields


def test_user_preferences_serializer_validation():
    """Verify that the generated serializer correctly validates typical data."""
    data = {
        "alias": "New Name",
        "preferences": {
            "process_summary_fields": ["piece.name"],
            "summary_customize_popover": False,
        },
    }
    serializer = UserPreferencesSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["alias"] == "New Name"
    assert (
        serializer.validated_data["preferences"]["summary_customize_popover"] is False
    )


def test_user_preferences_workflow_field_validation():
    """Verify that invalid workflow field references are rejected."""
    data = {
        "preferences": {
            "process_summary_fields": ["invalid.field"],
        },
    }
    serializer = UserPreferencesSerializer(data=data)
    assert not serializer.is_valid()
    assert "preferences" in serializer.errors
    assert "process_summary_fields" in serializer.errors["preferences"]
    assert "Invalid workflow field reference: invalid.field" in str(
        serializer.errors["preferences"]["process_summary_fields"]
    )
