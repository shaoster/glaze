"""
Structural and semantic validation of workflow.yml.

Three test classes cover different validation layers:

  TestSchemaValidation     — structural: jsonschema against workflow.schema.yml.
  TestReferentialIntegrity — semantic: state graph rules JSON Schema cannot express.
  TestAdditionalFieldsDSL  — semantic: field DSL referential integrity.
  TestGlobals              — semantic: declared globals match api/models.py exactly.
"""

from pathlib import Path

import django
import jsonschema
import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent

# Ensure Django is set up so we can introspect models in TestGlobals.
django.setup()
from django.apps import apps  # noqa: E402 — must come after django.setup()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def workflow():
    return yaml.safe_load((ROOT / "workflow.yml").read_text())


@pytest.fixture(scope="module")
def schema():
    return yaml.safe_load((ROOT / "workflow.schema.yml").read_text())


@pytest.fixture(scope="module")
def state_ids(workflow):
    return {s["id"] for s in workflow["states"]}


@pytest.fixture(scope="module")
def globals_section(workflow):
    return workflow.get("globals", {})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _successors_map(workflow):
    return {s["id"]: s.get("successors", []) for s in workflow["states"]}


def _ancestors(state_id, successors_map):
    """All state IDs from which state_id is reachable through the successor graph."""
    predecessors: dict[str, list[str]] = {s: [] for s in successors_map}
    for s, succs in successors_map.items():
        for succ in succs:
            if succ in predecessors:
                predecessors[succ].append(s)
    visited: set[str] = set()
    queue = [state_id]
    while queue:
        curr = queue.pop()
        for pred in predecessors.get(curr, []):
            if pred not in visited:
                visited.add(pred)
                queue.append(pred)
    return visited


def _parse_ref(ref_str):
    """Parse a $ref string.

    Returns ('global', global_name, field_name) or ('state', state_id, field_name).
    """
    if ref_str.startswith("@"):
        global_name, field_name = ref_str[1:].split(".", 1)
        return "global", global_name, field_name
    else:
        state_id, field_name = ref_str.split(".", 1)
        return "state", state_id, field_name


def _all_refs(workflow):
    """Yield (host_state_id, local_field_name, ref_str) for every $ref in additional_fields."""
    for state in workflow["states"]:
        for field_name, field_def in state.get("additional_fields", {}).items():
            if "$ref" in field_def:
                yield state["id"], field_name, field_def["$ref"]


def _all_inline_fields(workflow):
    """Yield (context, field_name, field_def) for every inline field in states and globals."""
    for state in workflow["states"]:
        for field_name, field_def in state.get("additional_fields", {}).items():
            if "type" in field_def:
                yield f"state '{state['id']}'", field_name, field_def
    for global_name, global_def in workflow.get("globals", {}).items():
        for field_name, field_def in global_def.get("fields", {}).items():
            if "type" in field_def:
                yield f"global '{global_name}'", field_name, field_def


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

class TestSchemaValidation:
    def test_valid_workflow_passes_schema(self, workflow, schema):
        """workflow.yml must be structurally valid against workflow.schema.yml."""
        jsonschema.validate(instance=workflow, schema=schema)

    def test_missing_version_fails(self, schema):
        bad = {"states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}]}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_missing_states_fails(self, schema):
        bad = {"version": "1.0.0"}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_invalid_version_format_fails(self, schema):
        bad = {"version": "v1", "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}]}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_invalid_state_id_format_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [{"id": "Bad-ID", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_duplicate_successor_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                {"id": "a", "visible": True, "successors": ["b", "b"]},
                {"id": "b", "visible": True, "terminal": True},
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_extra_top_level_key_fails(self, schema):
        bad = {"version": "1.0.0", "states": [{"id": "a", "visible": True}], "extra": True}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_extra_state_key_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [{"id": "a", "visible": True, "unknown_field": "x"}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_global_ref_accepted(self, schema):
        """A global ref (@global.field) in additional_fields must pass the schema."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "location": {
                    "model": "Location",
                    "fields": {"name": {"type": "string"}},
                }
            },
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "successors": ["b"],
                    "additional_fields": {
                        "kiln": {"$ref": "@location.name"},
                    },
                },
                {"id": "b", "visible": True, "terminal": True},
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_can_create_accepted_on_global_ref(self, schema):
        """can_create: true must be accepted on a global ref."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "location": {
                    "model": "Location",
                    "fields": {"name": {"type": "string"}},
                }
            },
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "successors": ["b"],
                    "additional_fields": {
                        "kiln": {"$ref": "@location.name", "can_create": True},
                    },
                },
                {"id": "b", "visible": True, "terminal": True},
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_can_create_rejected_on_state_ref(self, schema):
        """can_create must not be accepted on a state ref — it is only valid on global refs."""
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "successors": ["b"],
                    "additional_fields": {
                        "x": {"type": "number"},
                    },
                },
                {
                    "id": "b",
                    "visible": True,
                    "successors": ["c"],
                    "additional_fields": {
                        "y": {"$ref": "a.x", "can_create": True},
                    },
                },
                {"id": "c", "visible": True, "terminal": True},
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_can_create_rejected_on_inline_field(self, schema):
        """can_create must not be accepted on an inline field."""
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "successors": ["b"],
                    "additional_fields": {
                        "x": {"type": "number", "can_create": True},
                    },
                },
                {"id": "b", "visible": True, "terminal": True},
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_invalid_ref_pattern_fails(self, schema):
        """A $ref that matches neither form must be rejected by the schema."""
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "successors": ["b"],
                    "additional_fields": {"x": {"$ref": "not-valid"}},
                },
                {"id": "b", "visible": True, "terminal": True},
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_global_with_no_model_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "globals": {"location": {"fields": {"name": {"type": "string"}}}},
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_global_with_no_fields_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "globals": {"location": {"model": "Location", "fields": {}}},
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_compose_from_accepted(self, schema):
        """A valid compose_from object on a global must pass the schema."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "glaze_type": {
                    "model": "GlazeType",
                    "fields": {"name": {"type": "string"}},
                },
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {"global": "glaze_type"},
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_compose_from_missing_global_fails(self, schema):
        """A compose_from entry without a 'global' key must be rejected."""
        bad = {
            "version": "1.0.0",
            "globals": {
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {},
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_compose_from_extra_key_fails(self, schema):
        """A compose_from entry with an unknown key must be rejected (additionalProperties: false)."""
        bad = {
            "version": "1.0.0",
            "globals": {
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {"global": "glaze_type", "unknown_key": True},
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_compose_from_with_through_fields_accepted(self, schema):
        """A compose_from entry with valid through_fields and ordered must pass the schema."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "glaze_method": {
                    "model": "GlazeMethod",
                    "fields": {"name": {"type": "string"}},
                },
                "glaze_type": {
                    "model": "GlazeType",
                    "fields": {"name": {"type": "string"}},
                },
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {
                            "global": "glaze_type",
                            "ordered": True,
                            "through_fields": {
                                "glaze_method": {
                                    "$ref": "@glaze_method.name",
                                    "required": False,
                                },
                            },
                        },
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_compose_from_ordered_non_boolean_fails(self, schema):
        """A compose_from entry with ordered set to a non-boolean must be rejected."""
        bad = {
            "version": "1.0.0",
            "globals": {
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {"global": "glaze_type", "ordered": "yes"},
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_compose_from_through_fields_bad_type_fails(self, schema):
        """A through_fields entry with an invalid type must be rejected."""
        bad = {
            "version": "1.0.0",
            "globals": {
                "glaze_combination": {
                    "model": "GlazeCombination",
                    "fields": {"name": {"type": "string"}},
                    "compose_from": {
                        "glaze_types": {
                            "global": "glaze_type",
                            "through_fields": {
                                "glaze_method": {"type": "not_a_valid_type"},
                            },
                        },
                    },
                },
            },
            "states": [{"id": "a", "visible": True}, {"id": "b", "visible": True, "terminal": True}],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)


# ---------------------------------------------------------------------------
# Referential integrity (things JSON Schema cannot express)
# ---------------------------------------------------------------------------

class TestReferentialIntegrity:
    def test_all_successor_ids_exist(self, workflow, state_ids):
        """Every id listed in a state's successors must be a known state id."""
        for state in workflow["states"]:
            for successor in state.get("successors", []):
                assert successor in state_ids, (
                    f"State '{state['id']}' has unknown successor '{successor}'"
                )

    def test_terminal_states_have_no_successors(self, workflow):
        """Terminal states must not declare any successors."""
        for state in workflow["states"]:
            if state.get("terminal"):
                successors = state.get("successors", [])
                assert successors == [], (
                    f"Terminal state '{state['id']}' must not have successors, got {successors}"
                )

    def test_non_terminal_states_have_successors(self, workflow):
        """Every non-terminal state must have at least one successor."""
        for state in workflow["states"]:
            if not state.get("terminal"):
                assert state.get("successors"), (
                    f"Non-terminal state '{state['id']}' has no successors"
                )

    def test_state_ids_are_unique(self, workflow):
        """Each state id must appear exactly once."""
        ids = [s["id"] for s in workflow["states"]]
        assert len(ids) == len(set(ids)), (
            f"Duplicate state ids: {[i for i in ids if ids.count(i) > 1]}"
        )

    def test_no_state_is_its_own_successor(self, workflow):
        """A state must not list itself as a successor."""
        for state in workflow["states"]:
            assert state["id"] not in state.get("successors", []), (
                f"State '{state['id']}' lists itself as a successor"
            )


# ---------------------------------------------------------------------------
# Additional fields DSL — referential integrity
# ---------------------------------------------------------------------------

class TestAdditionalFieldsDSL:
    def test_enum_only_on_string_type(self, workflow):
        """enum is only meaningful on type: string fields."""
        for context, field_name, field_def in _all_inline_fields(workflow):
            if "enum" in field_def:
                assert field_def.get("type") == "string", (
                    f"Field '{field_name}' in {context} declares enum but type is "
                    f"'{field_def.get('type')}' — enum is only valid on type: string"
                )

    def test_state_ref_state_exists(self, workflow, state_ids):
        """The state_id in a state ref must be a known state."""
        for host_state, field_name, ref_str in _all_refs(workflow):
            kind, name, _ = _parse_ref(ref_str)
            if kind == "state":
                assert name in state_ids, (
                    f"State '{host_state}' field '{field_name}': $ref '{ref_str}' "
                    f"references unknown state '{name}'"
                )

    def test_state_ref_field_exists(self, workflow):
        """The field_name in a state ref must be declared on that state."""
        fields_by_state = {
            s["id"]: set(s.get("additional_fields", {}).keys())
            for s in workflow["states"]
        }
        for host_state, field_name, ref_str in _all_refs(workflow):
            kind, ref_state, ref_field = _parse_ref(ref_str)
            if kind == "state":
                assert ref_field in fields_by_state.get(ref_state, set()), (
                    f"State '{host_state}' field '{field_name}': $ref '{ref_str}' "
                    f"references field '{ref_field}' which is not declared on state '{ref_state}'"
                )

    def test_state_ref_is_reachable_ancestor(self, workflow):
        """The state_id in a state ref must be a reachable ancestor of the host state."""
        succs = _successors_map(workflow)
        for host_state, field_name, ref_str in _all_refs(workflow):
            kind, ref_state, _ = _parse_ref(ref_str)
            if kind == "state":
                ancestors = _ancestors(host_state, succs)
                assert ref_state in ancestors, (
                    f"State '{host_state}' field '{field_name}': $ref '{ref_str}' "
                    f"references state '{ref_state}' which is not a reachable ancestor"
                )

    def test_global_ref_global_exists(self, workflow, globals_section):
        """The global_name in a global ref must be declared in globals."""
        for host_state, field_name, ref_str in _all_refs(workflow):
            kind, global_name, _ = _parse_ref(ref_str)
            if kind == "global":
                assert global_name in globals_section, (
                    f"State '{host_state}' field '{field_name}': $ref '{ref_str}' "
                    f"references undeclared global '@{global_name}'"
                )

    def test_global_ref_field_exists(self, workflow, globals_section):
        """The field_name in a global ref must be declared in that global's fields."""
        for host_state, field_name, ref_str in _all_refs(workflow):
            kind, global_name, ref_field = _parse_ref(ref_str)
            if kind == "global" and global_name in globals_section:
                declared = set(globals_section[global_name].get("fields", {}).keys())
                assert ref_field in declared, (
                    f"State '{host_state}' field '{field_name}': $ref '{ref_str}' "
                    f"references field '{ref_field}' which is not declared in global '@{global_name}'"
                )


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
