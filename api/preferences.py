"""User preferences parsing and serializer generation logic.

Drives the backend serializers and frontend UI from user_preferences.yml.
"""

from pathlib import Path
from typing import Any

import yaml
from rest_framework import serializers

from .workflow import get_all_field_refs

# ---------------------------------------------------------------------------
# Load configurations at module import time and cache — do not re-read per request.
# ---------------------------------------------------------------------------
_root = Path(__file__).resolve().parent.parent
_config = yaml.safe_load((_root / "user_preferences.yml").read_text())
_tutorials_config = yaml.safe_load((_root / "tutorials.yml").read_text())


def validate_workflow_fields(values: list[str]) -> None:
    """Ensure all provided field refs exist in the current workflow definition."""
    valid_refs = get_all_field_refs()
    for val in values:
        if val not in valid_refs:
            raise serializers.ValidationError(f"Invalid workflow field reference: {val}")


def get_preferences_config() -> dict[str, Any]:
    """Return the raw preferences configuration from user_preferences.yml."""
    return _config


def get_tutorials_config() -> dict[str, Any]:
    """Return the raw tutorials configuration from tutorials.yml."""
    return _tutorials_config


def _get_serializer_field(field_def: dict[str, Any]) -> serializers.Field:
    """Map a YAML field definition to a DRF serializer field."""
    field_type = field_def["type"]
    if field_type == "string":
        return serializers.CharField(
            required=False,
            allow_blank=True,
            max_length=field_def.get("max_length", 255),
        )
    if field_type == "field-list":
        validators = []
        if field_def.get("provider") == "workflow_summary_fields":
            validators.append(validate_workflow_fields)
        return serializers.ListField(
            child=serializers.CharField(),
            required=False,
            validators=validators,
        )
    if field_type == "boolean":
        return serializers.BooleanField(required=False)

    # Fallback for unknown types
    return serializers.ReadOnlyField(required=False)


def _make_saved_user_preferences_serializer() -> type[serializers.Serializer]:
    """Generate the serializer for the nested 'preferences' JSON blob."""
    fields: dict[str, Any] = {}

    for section in _config["sections"]:
        for field_id, field_def in section["fields"].items():
            if field_def["storage"] == "UserProfile.preferences":
                fields[field_id] = _get_serializer_field(field_def)

    # Inject tutorial show/hide preferences.
    # Note: These are always stored in UserProfile.preferences and default to True.
    for tutorial_id in _tutorials_config.get("tutorials", {}):
        fields[tutorial_id] = serializers.BooleanField(
            required=False,
            default=True,
        )

    return type("SavedUserPreferencesSerializer", (serializers.Serializer,), fields)


SavedUserPreferencesSerializer = _make_saved_user_preferences_serializer()


def _make_user_preferences_serializer() -> type[serializers.Serializer]:
    """Generate the top-level UserPreferencesSerializer."""
    fields: dict[str, Any] = {
        "preferences": SavedUserPreferencesSerializer(required=False)
    }

    for section in _config["sections"]:
        for field_id, field_def in section["fields"].items():
            if field_def["storage"] == "UserProfile":
                fields[field_id] = _get_serializer_field(field_def)

    return type("UserPreferencesSerializer", (serializers.Serializer,), fields)


UserPreferencesSerializer = _make_user_preferences_serializer()
