"""
Django-backed validation that globals declared in workflow.yml match api/models.py.

These tests require a live Django app registry and therefore live in api/tests/
rather than the pure-YAML tests/ suite.

  TestGlobals      — each global's model and fields exist in the api app.
  TestComposeFrom  — compose_from M2M wiring matches Django through models.
"""

from pathlib import Path

import pytest
import yaml
from django.apps import apps

ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(scope="module")
def workflow():
    return yaml.safe_load((ROOT / "workflow.yml").read_text())


@pytest.fixture(scope="module")
def globals_section(workflow):
    return workflow.get("globals", {})


# ---------------------------------------------------------------------------
# Globals — verify against api/models.py via Django introspection
# ---------------------------------------------------------------------------

class TestGlobals:
    def test_all_globals_map_to_real_models(self, globals_section):
        """Every global's `model` must be a real model in the api app."""
        for alias, global_def in globals_section.items():
            model_name = global_def["model"]
            try:
                apps.get_model("api", model_name)
            except LookupError:
                pytest.fail(
                    f"Global '@{alias}' declares model '{model_name}' "
                    f"which does not exist in the api app"
                )

    def test_all_global_fields_exist_on_model(self, globals_section):
        """Every field declared in a global must exist on the corresponding Django model."""
        for alias, global_def in globals_section.items():
            model = apps.get_model("api", global_def["model"])
            for field_name in global_def.get("fields", {}):
                try:
                    model._meta.get_field(field_name)
                except Exception:
                    pytest.fail(
                        f"Global '@{alias}' declares field '{field_name}' "
                        f"which does not exist on model '{global_def['model']}'"
                    )

    def test_public_globals_have_nullable_user_field(self, globals_section):
        """Models for globals declared public: true must allow a null user (for public entries)."""
        for alias, global_def in globals_section.items():
            if not global_def.get("public", False):
                continue
            model = apps.get_model("api", global_def["model"])
            try:
                user_field = model._meta.get_field("user")
            except Exception:
                pytest.fail(
                    f"Global '@{alias}' is declared public: true but its model "
                    f"'{global_def['model']}' has no 'user' field"
                )
            assert user_field.null, (
                f"Global '@{alias}' is declared public: true but '{global_def['model']}.user' "
                f"does not allow null — public objects need a null user"
            )

    def test_public_and_private_flags_are_booleans(self, globals_section):
        """public and private flags in global defs must be booleans when present."""
        for alias, global_def in globals_section.items():
            for flag in ("public", "private"):
                value = global_def.get(flag)
                if value is not None:
                    assert isinstance(value, bool), (
                        f"Global '@{alias}' flag '{flag}' must be a boolean, got {type(value).__name__}"
                    )

    def test_at_most_one_thumbnail_field_per_global(self, globals_section):
        """At most one field per global may carry use_as_thumbnail: true."""
        for alias, global_def in globals_section.items():
            thumbnail_fields = [
                name
                for name, field_def in global_def.get("fields", {}).items()
                if isinstance(field_def, dict) and field_def.get("use_as_thumbnail")
            ]
            assert len(thumbnail_fields) <= 1, (
                f"Global '@{alias}' declares use_as_thumbnail: true on multiple fields: "
                f"{thumbnail_fields!r} — at most one thumbnail field is allowed per global"
            )

    def test_thumbnail_field_must_be_image_type(self, globals_section):
        """A field with use_as_thumbnail: true must have type: image."""
        for alias, global_def in globals_section.items():
            for name, field_def in global_def.get("fields", {}).items():
                if not (isinstance(field_def, dict) and field_def.get("use_as_thumbnail")):
                    continue
                field_type = field_def.get("type")
                assert field_type == "image", (
                    f"Global '@{alias}' field '{name}' has use_as_thumbnail: true "
                    f"but type is '{field_type}' — only image fields may be used as thumbnails"
                )

    def test_filterable_global_ref_fields_reference_declared_globals(self, globals_section):
        """A global ref field with filterable: true must point to a declared global."""
        for alias, global_def in globals_section.items():
            for field_name, field_def in global_def.get("fields", {}).items():
                if not isinstance(field_def, dict):
                    continue
                ref = field_def.get("$ref", "")
                # Only validate global refs (@ prefix) that carry filterable: true.
                if not (ref.startswith("@") and field_def.get("filterable")):
                    continue
                ref_global = ref[1:].split(".", 1)[0]
                assert ref_global in globals_section, (
                    f"Global '@{alias}' field '{field_name}' has filterable: true "
                    f"and $ref '@{ref_global}.*' but '@{ref_global}' is not a declared global"
                )


# ---------------------------------------------------------------------------
# compose_from — ordered M2M composition relationships
# ---------------------------------------------------------------------------

class TestComposeFrom:
    def test_compose_from_referenced_global_exists(self, globals_section):
        """Each compose_from entry's 'global' must reference a declared global."""
        for global_name, global_def in globals_section.items():
            for field_name, entry in global_def.get("compose_from", {}).items():
                referenced = entry["global"]
                assert referenced in globals_section, (
                    f"Global '@{global_name}' compose_from '{field_name}' "
                    f"references undeclared global '@{referenced}'"
                )

    def test_compose_from_field_exists_on_model(self, globals_section):
        """Each compose_from key must be a field that exists on the Django model."""
        for global_name, global_def in globals_section.items():
            model = apps.get_model("api", global_def["model"])
            for field_name in global_def.get("compose_from", {}).keys():
                try:
                    model._meta.get_field(field_name)
                except Exception:
                    pytest.fail(
                        f"Global '@{global_name}' compose_from declares field '{field_name}' "
                        f"which does not exist on model '{global_def['model']}'"
                    )

    def test_through_fields_global_refs_valid(self, globals_section):
        """Each through_fields global ref must point to a declared global with a declared field."""
        for global_name, global_def in globals_section.items():
            for m2m_field, entry in global_def.get("compose_from", {}).items():
                for tf_name, tf_def in entry.get("through_fields", {}).items():
                    ref = tf_def.get("$ref", "")
                    if not ref.startswith("@"):
                        continue
                    # Parse "@global_name.field_name"
                    parts = ref[1:].split(".", 1)
                    assert len(parts) == 2, (
                        f"Global '@{global_name}' compose_from '{m2m_field}' through_fields "
                        f"'{tf_name}' has malformed $ref '{ref}' (expected @global.field)"
                    )
                    ref_global, ref_field = parts
                    assert ref_global in globals_section, (
                        f"Global '@{global_name}' compose_from '{m2m_field}' through_fields "
                        f"'{tf_name}' refs undeclared global '@{ref_global}'"
                    )
                    assert ref_field in globals_section[ref_global].get("fields", {}), (
                        f"Global '@{global_name}' compose_from '{m2m_field}' through_fields "
                        f"'{tf_name}' refs undeclared field '{ref_field}' on '@{ref_global}'"
                    )

    def test_through_fields_exist_on_through_model(self, globals_section):
        """Each through_fields key must exist as a field on the M2M through model."""
        for global_name, global_def in globals_section.items():
            parent_model = apps.get_model("api", global_def["model"])
            for m2m_field_name, entry in global_def.get("compose_from", {}).items():
                through_fields = entry.get("through_fields", {})
                if not through_fields:
                    continue
                try:
                    m2m_field = parent_model._meta.get_field(m2m_field_name)
                    through_model = m2m_field.remote_field.through
                except Exception:
                    pytest.fail(
                        f"Global '@{global_name}' compose_from '{m2m_field_name}' "
                        f"could not resolve through model"
                    )
                for tf_name in through_fields:
                    try:
                        through_model._meta.get_field(tf_name)
                    except Exception:
                        pytest.fail(
                            f"Global '@{global_name}' compose_from '{m2m_field_name}' "
                            f"through_fields declares '{tf_name}' which does not exist on "
                            f"through model '{through_model.__name__}'"
                        )
