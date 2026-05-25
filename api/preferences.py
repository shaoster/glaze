"""User preferences parsing and serializer generation logic.

Drives the backend serializers and frontend UI from user_preferences.yml.
"""

from pathlib import Path
from typing import Any

import yaml
from rest_framework import serializers

# ---------------------------------------------------------------------------
# Load preferences at module import time and cache — do not re-read per request.
# ---------------------------------------------------------------------------
_config = yaml.safe_load(
    (Path(__file__).resolve().parent.parent / "user_preferences.yml").read_text()
)


def get_preferences_config() -> dict[str, Any]:
    """Return the raw preferences configuration from user_preferences.yml."""
    return _config


def _make_saved_user_preferences_serializer() -> type[serializers.Serializer]:
    """Generate the serializer for the nested 'preferences' JSON blob."""
    fields: dict[str, Any] = {}

    for section in _config["sections"]:
        for field_id, field_def in section["fields"].items():
            if field_def["storage"] == "UserProfile.preferences":
                if field_def["type"] == "visibility-toggle":
                    fields[field_id] = serializers.BooleanField(required=False)
                elif field_def["type"] == "field-multiselect":
                    fields[field_id] = serializers.ListField(
                        child=serializers.CharField(),
                        required=False,
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
                if field_def["type"] == "string":
                    fields[field_id] = serializers.CharField(
                        required=False,
                        allow_blank=True,
                        max_length=field_def.get("max_length", 255),
                    )

    return type("UserPreferencesSerializer", (serializers.Serializer,), fields)


UserPreferencesSerializer = _make_user_preferences_serializer()
