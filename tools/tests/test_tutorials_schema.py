from __future__ import annotations

import json
import pathlib

import jsonschema
import jsonschema.validators
import pytest
import yaml

REPO_ROOT = pathlib.Path(__file__).parents[2]
SCHEMA_PATH = REPO_ROOT / "tutorials.schema.yml"
DATA_PATH = REPO_ROOT / "tutorials.yml"


def _load_schema() -> dict:
    with SCHEMA_PATH.open() as f:
        return yaml.safe_load(f)


def _load_data() -> dict:
    with DATA_PATH.open() as f:
        return yaml.safe_load(f)


def test_tutorials_yml_is_valid_against_schema() -> None:
    schema = _load_schema()
    data = _load_data()

    validator_cls = jsonschema.validators.validator_for(schema)
    validator_cls.check_schema(schema)
    validator = validator_cls(schema)

    errors = list(validator.iter_errors(data))
    if errors:
        messages = "\n".join(
            f"  {e.json_path}: {e.message}" for e in errors
        )
        pytest.fail(f"tutorials.yml failed schema validation:\n{messages}")
