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
    for field_name, field_def in state.get('fields', {}).items():
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


def get_filterable_fields(global_name: str) -> dict[str, dict]:
    """Return filterable field metadata for a given global.

    Returns a dict mapping field_name -> {type, label} for every field
    declared with filterable: true in workflow.yml. Used by:
    - the generic filter view logic (discover which query-params to accept)
    - model classes (derive filterable_fields without hardcoding)

    Returns an empty dict for unknown globals or globals with no filterable fields.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return {
        field_name: {
            k: v for k, v in field_def.items()
            if k in ('type', 'label')
        }
        for field_name, field_def in config.get('fields', {}).items()
        if field_def.get('filterable', False) and 'type' in field_def
    }


def is_favoritable_global(global_name: str) -> bool:
    """Return True if the global declares favoritable: true.

    Favoritable globals support per-user favorites via
    POST/DELETE /api/globals/<global_name>/<pk>/favorite/.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return bool(config.get('favoritable', False))


def is_factory_global(global_name: str) -> bool:
    """Return True if the model factory should generate a Django model for this global.

    Defaults to True.  Set ``factory: false`` in workflow.yml for reference-only
    globals whose Django model is hand-written (e.g. ``piece``).
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return bool(config.get('factory', True))


def get_global_names() -> list[str]:
    """Return all global names registered in workflow.yml, in declaration order."""
    return list(_GLOBALS_MAP.keys())


def is_taggable_global(global_name: str) -> bool:
    """Return True if the global declares taggable: true.

    Taggable globals support ordered per-object tag assignments using the shared
    ``Tag`` global and a generated join model (for example ``PieceTag``).
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return bool(config.get('taggable', False))


def get_taggable_globals() -> list[str]:
    """Return all globals that declare taggable: true, in declaration order."""
    return [name for name in get_global_names() if is_taggable_global(name)]


def get_global_config(global_name: str) -> dict:
    """Return the full workflow.yml config dict for a global, or {} if unknown.

    Used by model factories that need the raw DSL config (model name, public/
    private flags, fields dict, compose_from) without going through the
    higher-level typed helpers.
    """
    return dict(_GLOBALS_MAP.get(global_name, {}))


def get_filterable_ref_fields(global_name: str) -> dict[str, dict]:
    """Return FK filter metadata for global ref fields declared with filterable: true.

    For each field in the global's ``fields`` section that is a global ref
    (``$ref: @...``) with ``filterable: true``, returns an entry:

        { '<field_name>_id': {'type': 'fk_id', 'param': '<field_name>_id'} }

    The ``_id`` suffix maps to the Django ORM lookup on the FK column; the
    ``param`` is the query-string key callers use to filter by that FK.

    Used by the composite model factory to populate ``filterable_fields``
    without hardcoding field names.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    result: dict[str, dict] = {}
    for field_name, field_def in config.get('fields', {}).items():
        if field_def.get('filterable', False) and '$ref' in field_def and field_def['$ref'].startswith('@'):
            orm_key = f'{field_name}_id'
            result[orm_key] = {'type': 'fk_id', 'param': orm_key}
    return result


def get_filterable_compose_fields(global_name: str) -> dict[str, dict]:
    """Return M2M filter metadata for compose_from relationships with a filter_label.

    For each entry in the global's ``compose_from`` section that carries a
    ``filter_label``, returns an entry:

        { 'layers__<component_global>_id': {'type': 'm2m_id', 'param': '<component_global>_ids'} }

    The ORM lookup ``layers__<component_global>_id`` filters composites that
    contain at least one layer referencing the given component PK.  The ``param``
    key uses the plural form (``_ids``) to signal multi-value selection.

    ``filter_label`` presence is the signal — its schema description already
    states it is "used in pickers that expose this compose_from relationship as
    a multi-select filter".

    Used by the composite model factory to populate ``filterable_fields``
    without hardcoding field names.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    result: dict[str, dict] = {}
    for _rel_name, compose_config in config.get('compose_from', {}).items():
        if 'filter_label' not in compose_config:
            continue
        component_global: str = compose_config['global']
        orm_key = f'layers__{component_global}_id'
        result[orm_key] = {'type': 'm2m_id', 'param': f'{component_global}_ids'}
    return result


def get_glaze_image_qualifying_states() -> frozenset:
    """Derive the set of states from which glaze combination images are relevant.

    Computed from workflow.yml — do not hardcode state names at call sites.

    A state qualifies if it either:
    - carries a ``glaze_combination`` global-ref field (directly or via a
      transitive state ref), OR
    - is a non-recycled terminal state (i.e. a finished-piece state).

    With the current workflow this resolves to
    ``frozenset({'glazed', 'glaze_fired', 'completed'})``.
    """
    states_with_combo: frozenset = frozenset(
        s_id for s_id in VALID_STATES
        if 'glaze_combination' in get_global_ref_fields_for_state(s_id)
    )
    non_recycled_terminals: frozenset = TERMINAL_STATES - {'recycled'}
    return states_with_combo | non_recycled_terminals


def get_compose_from(global_name: str) -> dict | None:
    """Return the compose_from declaration for a global, or None.

    compose_from declares ordered M2M composition relationships — e.g.
    GlazeCombination is composed from an ordered list of GlazeTypes.
    Used by model/admin generation and frontend composition pickers.
    Returns None if the global is unknown or has no compose_from key.
    """
    config = _GLOBALS_MAP.get(global_name, {})
    return config.get('compose_from') or None


def _resolve_to_global_ref(field_def: dict, seen: frozenset | None = None) -> tuple[str, str] | None:
    """Return (global_name, field_name) if this field_def ultimately resolves to a global ref.

    Follows $ref chains transitively. Returns None for inline fields or state refs that
    resolve to inline fields.  Used to decide which fields go to junction tables.
    """
    if seen is None:
        seen = frozenset()

    if 'type' in field_def:
        return None

    ref: str = field_def['$ref']
    if ref in seen:
        return None
    seen = seen | {ref}

    if ref.startswith('@'):
        global_name, field_name = ref[1:].split('.', 1)
        return global_name, field_name

    # State ref — follow the chain
    state_id, field_name = ref.split('.', 1)
    target_state = _STATE_MAP.get(state_id, {})
    target = target_state.get('fields', {}).get(field_name)
    if target is None:
        return None
    return _resolve_to_global_ref(target, seen)


def get_global_ref_fields_for_state(state_id: str) -> dict[str, str]:
    """Return {field_name: global_name} for every field in this state that ultimately
    resolves to a global ref (including state refs that chain to global refs).

    Used by the serializer and views to identify which fields are stored in junction
    tables rather than the inline_fields JSON blob.
    """
    state = _STATE_MAP.get(state_id)
    if not state:
        return {}
    result: dict[str, str] = {}
    for field_name, field_def in state.get('fields', {}).items():
        resolved = _resolve_to_global_ref(field_def)
        if resolved is not None:
            result[field_name] = resolved[0]
    return result


def get_state_global_ref_map() -> dict[str, list[str]]:
    """Return {global_name: [field_name, ...]} for every unique global ref across all states.

    Each entry lists the DSL field names that reference that global type.
    Used by _register_globals() to decide which junction models to generate.
    """
    result: dict[str, list[str]] = {}
    seen: set[tuple[str, str]] = set()
    for state in _STATE_MAP.values():
        for field_name, field_def in state.get('fields', {}).items():
            resolved = _resolve_to_global_ref(field_def)
            if resolved is not None:
                global_name = resolved[0]
                key = (global_name, field_name)
                if key not in seen:
                    seen.add(key)
                    result.setdefault(global_name, []).append(field_name)
    return result


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
        target = _STATE_MAP[state_id]['fields'][field_name]

    return _resolve_field_def(target)


def build_additional_fields_schema(state_id: str) -> dict:
    """Return a JSON Schema that validates the inline_fields blob for a given state.

    Only includes fields that are NOT global refs (or state refs resolving to global
    refs) — those are stored in junction tables and validated separately.

    Fields declared with `required: true` are placed in the `required` array.
    `additionalProperties: false` rejects keys not declared in the DSL.
    States with no inline fields only accept an empty object.
    """
    state = _STATE_MAP.get(state_id)
    dsl_fields: dict = state.get('fields', {}) if state else {}

    properties: dict = {}
    required: list[str] = []

    for field_name, field_def in dsl_fields.items():
        if _resolve_to_global_ref(field_def) is not None:
            continue
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
