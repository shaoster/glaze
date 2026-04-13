"""Workflow parsing and validation helpers.

Loads workflow.yml once at import time and exposes typed constants and
helper functions.  Has no dependency on Django ORM models.
"""
from pathlib import Path

import jsonschema
import yaml
from django.apps import apps
from django.db import models as django_models

# ---------------------------------------------------------------------------
# Load workflow at module import time and cache — do not re-read per request.
# ---------------------------------------------------------------------------
_workflow = yaml.safe_load((Path(__file__).resolve().parent.parent / 'workflow.yml').read_text())

VALID_STATES: set[str] = {s['id'] for s in _workflow['states']}
SUCCESSORS: dict[str, list[str]] = {s['id']: s.get('successors', []) for s in _workflow['states']}
TERMINAL_STATES: set[str] = {s['id'] for s in _workflow['states'] if s.get('terminal', False)}
ENTRY_STATE = 'designed'
WORKFLOW_VERSION: str = _workflow['version']

_STATE_MAP: dict[str, dict] = {s['id']: s for s in _workflow['states']}
_GLOBALS_MAP: dict[str, dict] = _workflow.get('globals', {})


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_state_ref_fields(state_id: str) -> dict[str, tuple[str, str]]:
    """Return {field_name: (source_state_id, source_field_name)} for all state ref fields.

    State ref fields are `additional_fields` entries whose `$ref` does not start
    with `@` (which would mark a global ref).  The returned mapping is used by
    the serializer to auto-populate carried-forward values when a new state is
    created.
    """
    state = _STATE_MAP.get(state_id)
    if not state:
        return {}
    result: dict[str, tuple[str, str]] = {}
    for field_name, field_def in state.get('additional_fields', {}).items():
        ref: str = field_def.get('$ref', '')
        if ref and not ref.startswith('@'):
            source_state_id, source_field_name = ref.split('.', 1)
            result[field_name] = (source_state_id, source_field_name)
    return result


def get_global_model_and_field(
    global_name: str,
) -> tuple[type[django_models.Model], dict[str, dict], str]:
    """Resolve a globals DSL name to (model_cls, fields, display_field).

    Raises KeyError if global_name is not declared in workflow.yml globals or
    has no fields declared (the latter is a workflow.yml configuration error
    that the test suite would catch).
    """
    config = _GLOBALS_MAP[global_name]
    fields: dict[str, dict] = config['fields']
    display_field: str = 'name' if 'name' in fields else next(iter(fields))
    model_cls: type[django_models.Model] = apps.get_model('api', config['model'])
    return model_cls, fields, display_field


def is_public_global(global_name: str) -> bool:
    """Return True if this global type supports a shared public library.

    Public globals (public: true in workflow.yml) have entries with null user
    managed by admins and visible to all authenticated users.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return bool(config.get('public', False))


def is_private_global(global_name: str) -> bool:
    """Return True if this global type supports user-private instances.

    Private globals (private: true in workflow.yml, which is the default) allow
    each user to create their own owned instances via the API.  When private: false,
    user-owned instances are not supported — only admin-managed public objects exist.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return bool(config.get('private', True))  # default True


def get_public_global_models() -> list[type[django_models.Model]]:
    """Return the Django model class for every global declared public: true.

    Use this to iterate over models that need public library treatment
    (e.g. admin registration) without importing the private _GLOBALS_MAP.
    """
    return [
        apps.get_model('api', config['model'])
        for config in _GLOBALS_MAP.values()
        if config.get('public', False)
    ]


def get_image_fields_for_global_model(model_cls: type[django_models.Model]) -> list[str]:
    """Return field names declared as type: image for the given global model.

    Used by admin to identify which fields should render a Cloudinary upload widget
    rather than a plain text input.  Returns an empty list if the model is not a
    registered global or has no image fields.
    """
    model_name = model_cls.__name__
    for config in _GLOBALS_MAP.values():
        if config.get('model') == model_name:
            return [
                field_name
                for field_name, field_def in config.get('fields', {}).items()
                if field_def.get('type') == 'image'
            ]
    return []


def _resolve_field_def(field_def: dict) -> dict:
    """Recursively resolve a DSL field_def to its effective JSON Schema property dict.

    Inline fields map directly; refs are followed transitively until an inline
    field is reached.  Only `type` and `enum` are carried into the JSON Schema —
    DSL-only keys like `description`, `required`, and `can_create` are not.

    The `image` DSL type is stored as a URL string; it resolves to `string` in
    JSON Schema so validation treats it as a plain string value.
    """
    if 'type' in field_def:
        json_type = field_def['type']
        if json_type == 'image':
            json_type = 'string'
        prop: dict = {'type': json_type}
        if 'enum' in field_def:
            prop['enum'] = field_def['enum']
        return prop

    ref: str = field_def['$ref']
    if ref.startswith('@'):
        # Global ref: @global_name.field_name
        global_name, field_name = ref[1:].split('.', 1)
        target = _GLOBALS_MAP[global_name]['fields'][field_name]
    else:
        # State ref: state_id.field_name
        state_id, field_name = ref.split('.', 1)
        target = _STATE_MAP[state_id]['additional_fields'][field_name]

    return _resolve_field_def(target)


def build_additional_fields_schema(state_id: str) -> dict:
    """Return a JSON Schema that validates the additional_fields blob for a given state.

    Fields declared in the DSL with `required: true` are placed in the `required`
    array.  `additionalProperties: false` rejects keys not declared in the DSL.
    States with no additional_fields definition only accept an empty object.
    """
    state = _STATE_MAP.get(state_id)
    dsl_fields: dict = state.get('additional_fields', {}) if state else {}

    properties: dict = {}
    required: list[str] = []

    for field_name, field_def in dsl_fields.items():
        properties[field_name] = _resolve_field_def(field_def)
        if field_def.get('required', False):
            required.append(field_name)

    schema: dict = {
        'type': 'object',
        'properties': properties,
        'additionalProperties': False,
    }
    if required:
        schema['required'] = required
    return schema
