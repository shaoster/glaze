import uuid
from pathlib import Path

import jsonschema
import yaml
from django.db import models

# Load workflow at module import time and cache — do not re-read per request.
_workflow = yaml.safe_load((Path(__file__).resolve().parent.parent / 'workflow.yml').read_text())
VALID_STATES: set[str] = {s['id'] for s in _workflow['states']}
SUCCESSORS: dict[str, list[str]] = {s['id']: s.get('successors', []) for s in _workflow['states']}
TERMINAL_STATES: set[str] = {s['id'] for s in _workflow['states'] if s.get('terminal', False)}
ENTRY_STATE = 'designed'
WORKFLOW_VERSION: str = _workflow['version']

_STATE_MAP: dict[str, dict] = {s['id']: s for s in _workflow['states']}
_GLOBALS_MAP: dict[str, dict] = _workflow.get('globals', {})


def _resolve_field_def(field_def: dict) -> dict:
    """Recursively resolve a DSL field_def to its effective JSON Schema property dict.

    Inline fields map directly; refs are followed transitively until an inline
    field is reached.  Only `type` and `enum` are carried into the JSON Schema —
    DSL-only keys like `description`, `required`, and `can_create` are not.
    """
    if 'type' in field_def:
        prop: dict = {'type': field_def['type']}
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


def _build_additional_fields_schema(state_id: str) -> dict:
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


class Location(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self) -> str:
        return self.name


class ClayBody(models.Model):
    name = models.CharField(max_length=255, unique=True)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    def __str__(self) -> str:
        return self.name


class GlazeType(models.Model):
    name = models.CharField(max_length=255, unique=True)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    def __str__(self) -> str:
        return self.name


class GlazeMethod(models.Model):
    name = models.CharField(max_length=255, unique=True)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    def __str__(self) -> str:
        return self.name


class Piece(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created = models.DateTimeField(auto_now_add=True)
    # Tracks changes to owned fields (name, thumbnail) only.
    # Use the `last_modified` property externally — it incorporates the current state's timestamp.
    fields_last_modified = models.DateTimeField(auto_now=True)
    thumbnail = models.CharField(max_length=1024, blank=True, default='')
    # Workflow version under which this piece was created. All of its states are
    # validated against this version. Hardcoded to the current WORKFLOW_VERSION
    # for now; future work will allow migrating pieces to newer versions.
    workflow_version = models.CharField(max_length=32, default=WORKFLOW_VERSION)

    class Meta:
        ordering = ['-fields_last_modified']

    @property
    def current_state(self) -> 'PieceState | None':
        return self.states.order_by('-created').first()  # type: ignore[return-value]

    @property
    def last_modified(self):
        cs = self.current_state
        if cs is None:
            return self.fields_last_modified
        return max(self.fields_last_modified, cs.last_modified)

    def __str__(self) -> str:
        return self.name


class PieceState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    piece = models.ForeignKey(Piece, on_delete=models.CASCADE, related_name='states')
    state = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default='')
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    location = models.ForeignKey(
        'Location', null=True, blank=True, on_delete=models.SET_NULL, related_name='piece_states'
    )
    # Stored as a list of {url, caption, created} objects.
    images = models.JSONField(default=list)
    # State-specific data conforming to the additional_fields DSL for this state
    # in the workflow version recorded on piece.workflow_version.
    additional_fields = models.JSONField(default=dict)

    @property
    def workflow_version(self) -> str:
        """The workflow version for this state, inherited from its piece."""
        return self.piece.workflow_version

    class Meta:
        ordering = ['created']

    def save(self, *args, allow_sealed_edit: bool = False, **kwargs):
        """
        Validates additional_fields against the workflow DSL for this state, then
        enforces the sealed-state invariant.

        The workflow version used for validation is piece.workflow_version
        (hardcoded to WORKFLOW_VERSION for now).

        Past states are sealed — only the current state of a piece may be modified.
        Pass allow_sealed_edit=True to bypass the sealed check for exceptional
        admin operations.  This should never be done in normal application code paths.
        """
        # Validate additional_fields against the DSL schema for this state.
        schema = _build_additional_fields_schema(self.state)
        try:
            jsonschema.validate(instance=self.additional_fields, schema=schema)
        except jsonschema.ValidationError as exc:
            raise ValueError(
                f"additional_fields validation failed for state '{self.state}': {exc.message}"
            ) from exc

        if not self._state.adding and not allow_sealed_edit:
            current = self.piece.current_state
            if current is None or current.pk != self.pk:
                raise ValueError(
                    f'PieceState {self.pk} is sealed: only the current state of a piece '
                    f'may be modified. Pass allow_sealed_edit=True to override.'
                )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.piece.name} → {self.state}'
