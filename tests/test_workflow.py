"""
Structural and semantic validation of workflow.yml.

Three test classes cover different validation layers:

  TestSchemaValidation     — structural: jsonschema against workflow.schema.yml.
  TestReferentialIntegrity — semantic: state graph rules JSON Schema cannot express.
  TestAdditionalFieldsDSL  — semantic: field DSL referential integrity.

Django-backed tests (TestGlobals, TestComposeFrom) live in api/tests/test_workflow_globals.py.
"""

from pathlib import Path

import jsonschema
import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent

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
    """Yield (host_state_id, local_field_name, ref_str) for every $ref in state fields."""
    for state in workflow["states"]:
        for field_name, field_def in state.get("fields", {}).items():
            if "$ref" in field_def:
                yield state["id"], field_name, field_def["$ref"]


def _summary_refs(summary_item):
    if "value" in summary_item:
        yield summary_item["value"]
    compute = summary_item.get("compute", {})
    for key in ("left", "right", "numerator", "denominator"):
        if key in compute:
            yield compute[key]
    yield from compute.get("operands", [])


def _all_summary_items(workflow):
    for state in workflow["states"]:
        for section in state.get("summary", {}).get("sections", []):
            for item in section.get("fields", []):
                yield state["id"], section["title"], item


def _all_inline_fields(workflow):
    """Yield (context, field_name, field_def) for every inline field in states and globals."""
    for state in workflow["states"]:
        for field_name, field_def in state.get("fields", {}).items():
            if "type" in field_def:
                yield f"state '{state['id']}'", field_name, field_def
    for global_name, global_def in workflow.get("globals", {}).items():
        for field_name, field_def in global_def.get("fields", {}).items():
            if "type" in field_def:
                yield f"global '{global_name}'", field_name, field_def


def _state(state_id, **overrides):
    """Build a minimal valid state fixture for schema tests."""
    state = {
        "id": state_id,
        "visible": True,
        "friendly_name": state_id.title(),
        "past_friendly_name": state_id.title(),
        "description": f"{state_id} description",
    }
    state.update(overrides)
    return state


def _field_def(workflow, state_id, field_name):
    state = next((s for s in workflow["states"] if s["id"] == state_id), None)
    if state is None:
        return None
    return state.get("fields", {}).get(field_name)


def _resolved_field_def(workflow, state_id, field_name, seen=None):
    if seen is None:
        seen = set()
    key = (state_id, field_name)
    if key in seen:
        return None
    seen.add(key)
    field_def = _field_def(workflow, state_id, field_name)
    if not field_def:
        return None
    if "type" in field_def:
        return field_def
    ref = field_def["$ref"]
    if ref.startswith("@"):
        global_name, global_field_name = ref[1:].split(".", 1)
        return (
            workflow.get("globals", {})
            .get(global_name, {})
            .get("fields", {})
            .get(global_field_name)
        )
    source_state_id, source_field_name = ref.split(".", 1)
    return _resolved_field_def(workflow, source_state_id, source_field_name, seen)


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestSchemaValidation:
    def test_valid_workflow_passes_schema(self, workflow, schema):
        """workflow.yml must be structurally valid against workflow.schema.yml."""
        jsonschema.validate(instance=workflow, schema=schema)

    def test_missing_version_fails(self, schema):
        bad = {"states": [_state("a"), _state("b", terminal=True)]}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_missing_states_fails(self, schema):
        bad = {"version": "1.0.0"}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_invalid_version_format_fails(self, schema):
        bad = {"version": "v1", "states": [_state("a"), _state("b", terminal=True)]}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_invalid_state_id_format_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [_state("Bad-ID"), _state("b", terminal=True)],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_duplicate_successor_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                _state("a", successors=["b", "b"]),
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_extra_top_level_key_fails(self, schema):
        bad = {"version": "1.0.0", "states": [_state("a")], "extra": True}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_extra_state_key_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [_state("a", unknown_field="x")],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_missing_friendly_name_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "past_friendly_name": "A",
                    "description": "desc",
                    "successors": ["b"],
                },
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_missing_past_friendly_name_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "friendly_name": "A",
                    "description": "desc",
                    "successors": ["b"],
                },
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_missing_description_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    "id": "a",
                    "visible": True,
                    "friendly_name": "A",
                    "past_friendly_name": "A",
                    "successors": ["b"],
                },
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_max_length_accepted_on_inline_string_field(self, schema):
        """max_length: integer must be accepted on an inline string field."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "thing": {
                    "model": "Thing",
                    "fields": {
                        "name": {"type": "string"},
                        "label": {"type": "string", "max_length": 64},
                    },
                }
            },
            "states": [
                _state("a", successors=["b"]),
                _state("b", terminal=True),
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_max_length_must_be_positive(self, schema):
        """max_length: 0 must be rejected (minimum: 1)."""
        bad = {
            "version": "1.0.0",
            "globals": {
                "thing": {
                    "model": "Thing",
                    "fields": {"name": {"type": "string", "max_length": 0}},
                }
            },
            "states": [
                _state("a", successors=["b"]),
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_plural_accepted_on_global_def(self, schema):
        """plural: string must be accepted on a global definition."""
        valid = {
            "version": "1.0.0",
            "globals": {
                "entity": {
                    "model": "Entity",
                    "plural": "entities",
                    "fields": {"name": {"type": "string"}},
                }
            },
            "states": [
                _state("a", successors=["b"]),
                _state("b", terminal=True),
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_taggable_accepted_on_global_def(self, schema):
        valid = {
            "version": "1.0.0",
            "globals": {
                "piece": {
                    "model": "Piece",
                    "factory": False,
                    "taggable": True,
                    "fields": {"name": {"type": "string"}},
                }
            },
            "states": [
                _state("a", successors=["b"]),
                _state("b", terminal=True),
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_global_ref_accepted(self, schema):
        """A global ref (@global.field) in state fields must pass the schema."""
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
                    **_state("a"),
                    "successors": ["b"],
                    "fields": {
                        "kiln": {"$ref": "@location.name"},
                    },
                },
                _state("b", terminal=True),
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
                    **_state("a"),
                    "successors": ["b"],
                    "fields": {
                        "kiln": {"$ref": "@location.name", "can_create": True},
                    },
                },
                _state("b", terminal=True),
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_can_create_rejected_on_state_ref(self, schema):
        """can_create must not be accepted on a state ref — it is only valid on global refs."""
        bad = {
            "version": "1.0.0",
            "states": [
                {
                    **_state("a"),
                    "successors": ["b"],
                    "fields": {
                        "x": {"type": "number"},
                    },
                },
                {
                    **_state("b"),
                    "successors": ["c"],
                    "fields": {
                        "y": {"$ref": "a.x", "can_create": True},
                    },
                },
                _state("c", terminal=True),
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
                    **_state("a"),
                    "successors": ["b"],
                    "fields": {
                        "x": {"type": "number", "can_create": True},
                    },
                },
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_summary_accepted_on_terminal_state(self, schema):
        valid = {
            "version": "1.0.0",
            "states": [
                _state("a", successors=["b"], fields={"x": {"type": "number"}}),
                _state(
                    "b",
                    terminal=True,
                    summary={
                        "sections": [
                            {
                                "title": "Result",
                                "fields": [
                                    {"label": "Source", "value": "a.x"},
                                    {
                                        "label": "Double",
                                        "compute": {
                                            "op": "sum",
                                            "operands": ["a.x", "a.x"],
                                            "unit": "lb",
                                            "decimals": 1,
                                        },
                                        "when": {"state_exists": "a"},
                                    },
                                    {
                                        "label": "Path",
                                        "text": "No wax",
                                        "when": {"state_missing": "waxed"},
                                    },
                                ],
                            }
                        ]
                    },
                ),
                _state("waxed", terminal=True),
            ],
        }
        jsonschema.validate(instance=valid, schema=schema)

    def test_summary_item_requires_one_value_text_or_compute(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                _state("a", successors=["b"], fields={"x": {"type": "number"}}),
                _state(
                    "b",
                    terminal=True,
                    summary={
                        "sections": [
                            {"title": "Result", "fields": [{"label": "Missing"}]}
                        ]
                    },
                ),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_summary_compute_rejects_unknown_op(self, schema):
        bad = {
            "version": "1.0.0",
            "states": [
                _state("a", successors=["b"], fields={"x": {"type": "number"}}),
                _state(
                    "b",
                    terminal=True,
                    summary={
                        "sections": [
                            {
                                "title": "Result",
                                "fields": [
                                    {
                                        "label": "Bad",
                                        "compute": {
                                            "op": "median",
                                            "operands": ["a.x", "a.x"],
                                        },
                                    }
                                ],
                            }
                        ]
                    },
                ),
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
                    **_state("a"),
                    "successors": ["b"],
                    "fields": {"x": {"$ref": "not-valid"}},
                },
                _state("b", terminal=True),
            ],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_global_with_no_model_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "globals": {"location": {"fields": {"name": {"type": "string"}}}},
            "states": [_state("a"), _state("b", terminal=True)],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance=bad, schema=schema)

    def test_global_with_no_fields_fails(self, schema):
        bad = {
            "version": "1.0.0",
            "globals": {"location": {"model": "Location", "fields": {}}},
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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
            "states": [_state("a"), _state("b", terminal=True)],
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

    def test_summary_only_on_terminal_states(self, workflow):
        """State summaries are currently terminal-state display metadata."""
        for state in workflow["states"]:
            if "summary" in state:
                assert state.get("terminal"), (
                    f"State '{state['id']}' declares summary but is not terminal"
                )

    def test_summary_conditions_reference_known_states(self, workflow, state_ids):
        for host_state_id, section_title, item in _all_summary_items(workflow):
            when = item.get("when", {})
            for key in ("state_exists", "state_missing"):
                if key in when:
                    assert when[key] in state_ids, (
                        f"Summary item in state '{host_state_id}' section "
                        f"'{section_title}' has unknown {key} state '{when[key]}'"
                    )

    def test_summary_refs_point_to_reachable_ancestor_fields(self, workflow, state_ids):
        successors_map = _successors_map(workflow)
        for host_state_id, section_title, item in _all_summary_items(workflow):
            ancestors = _ancestors(host_state_id, successors_map)
            for ref in _summary_refs(item):
                source_state_id, field_name = ref.split(".", 1)
                assert source_state_id in state_ids, (
                    f"Summary item in state '{host_state_id}' section "
                    f"'{section_title}' references unknown state '{source_state_id}'"
                )
                assert source_state_id in ancestors, (
                    f"Summary item in state '{host_state_id}' section "
                    f"'{section_title}' references non-ancestor state '{source_state_id}'"
                )
                assert _field_def(workflow, source_state_id, field_name) is not None, (
                    f"Summary item in state '{host_state_id}' section "
                    f"'{section_title}' references unknown field '{ref}'"
                )

    def test_summary_compute_refs_are_numeric(self, workflow):
        for host_state_id, section_title, item in _all_summary_items(workflow):
            if "compute" not in item:
                continue
            for ref in _summary_refs(item):
                source_state_id, field_name = ref.split(".", 1)
                field_def = _resolved_field_def(workflow, source_state_id, field_name)
                assert field_def and field_def.get("type") in {"number", "integer"}, (
                    f"Summary compute in state '{host_state_id}' section "
                    f"'{section_title}' references non-numeric field '{ref}'"
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

    def test_format_only_on_string_type(self, workflow):
        """format is only meaningful on type: string fields."""
        for context, field_name, field_def in _all_inline_fields(workflow):
            if "format" in field_def:
                assert field_def.get("type") == "string", (
                    f"Field '{field_name}' in {context} declares format but type is "
                    f"'{field_def.get('type')}' — format is only valid on type: string"
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
            s["id"]: set(s.get("fields", {}).keys()) for s in workflow["states"]
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
