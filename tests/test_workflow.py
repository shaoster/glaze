"""
Structural and semantic validation of workflow.yml.

Structural constraints (field types, required keys, patterns) are checked by
jsonschema against workflow.schema.yml.  Referential integrity rules that JSON
Schema cannot express are enforced as explicit test cases below.
"""

from pathlib import Path

import jsonschema
import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def workflow():
    return yaml.safe_load((ROOT / "workflow.yml").read_text())


@pytest.fixture(scope="module")
def schema():
    raw = yaml.safe_load((ROOT / "workflow.schema.yml").read_text())
    # JSON Schema validators expect $schema as a plain string key; YAML parses
    # it correctly already, but we strip it so jsonschema picks the right draft.
    return raw


@pytest.fixture(scope="module")
def state_ids(workflow):
    return {s["id"] for s in workflow["states"]}


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
