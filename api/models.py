import uuid

import jsonschema
from django.conf import settings
from django.db import models

from .model_factories import (
    COMPOSITE_NAME_SEPARATOR as COMPOSITE_NAME_SEPARATOR,
    FavoriteModel as FavoriteModel,
    GlobalModel as GlobalModel,
    make_compose_global_models,
    make_favorite_model,
    make_piece_state_global_ref_model,
    make_simple_global_model,
)
from .workflow import (
    ENTRY_STATE as ENTRY_STATE,
    SUCCESSORS as SUCCESSORS,
    TERMINAL_STATES as TERMINAL_STATES,
    VALID_STATES as VALID_STATES,
    WORKFLOW_VERSION,
    build_additional_fields_schema,
    get_compose_from,
    get_global_config,
    get_global_model_and_field as get_global_model_and_field,
    get_global_names,
    get_state_global_ref_map,
    get_state_ref_fields as get_state_ref_fields,
    is_factory_global,
    is_favoritable_global,
)

# ---------------------------------------------------------------------------
# Auto-register all globals declared in workflow.yml
#
# For each global:
# - compose_from present → make_compose_global_models → (CompositeModel, ThroughModel)
# - otherwise           → make_simple_global_model → Model
# - favoritable: true   → make_favorite_model → FavoriteModel
#
# All generated classes are injected into this module's namespace so they are
# importable as ``api.models.Location``, ``api.models.GlazeCombination``, etc.
# and Django migrations treat them identically to hand-written model classes
# (because ``__module__ = 'api.models'`` is set inside each factory).
# ---------------------------------------------------------------------------

def _register_globals():
    ns = globals()
    for global_name in get_global_names():
        if not is_factory_global(global_name):
            continue
        config = get_global_config(global_name)
        model_name: str = config['model']
        if get_compose_from(global_name):
            composite, through = make_compose_global_models(global_name)
            ns[model_name] = composite
            compose_config = next(iter(get_compose_from(global_name).values()))
            through_model_name: str = compose_config.get('through_model', f'{model_name}Through')
            ns[through_model_name] = through
        else:
            ns[model_name] = make_simple_global_model(global_name)
        if is_favoritable_global(global_name):
            fav = make_favorite_model(global_name)
            ns[fav.__name__] = fav

    # Generate one junction model per global type that appears as a global ref
    # in any state's fields DSL.  Each junction model stores FK references from
    # PieceState to the global type with DB-level PROTECT integrity.
    for global_name in get_state_global_ref_map():
        ref_model = make_piece_state_global_ref_model(global_name)
        ns[ref_model.__name__] = ref_model

_register_globals()


# ---------------------------------------------------------------------------
# Core piece models
# ---------------------------------------------------------------------------

class Piece(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pieces')
    name = models.CharField(max_length=255)
    created = models.DateTimeField(auto_now_add=True)
    # Tracks changes to owned fields (name, thumbnail) only.
    # Use the `last_modified` property externally — it incorporates the current state's timestamp.
    fields_last_modified = models.DateTimeField(auto_now=True)
    thumbnail = models.JSONField(null=True, blank=True, default=None)
    current_location = models.ForeignKey(
        'Location',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pieces',
    )
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
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='piece_states'
    )
    piece = models.ForeignKey(Piece, on_delete=models.CASCADE, related_name='states')
    state = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default='')
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    # Stored as a list of {url, caption, created} objects.
    images = models.JSONField(default=list)
    # Inline (non-global-ref) state-specific fields for this state.
    # Global ref fields are stored in per-type junction tables (PieceState*Ref models).
    additional_fields = models.JSONField(default=dict)

    @property
    def workflow_version(self) -> str:
        """The workflow version for this state, inherited from its piece."""
        return self.piece.workflow_version

    class Meta:
        ordering = ['created']

    def save(self, *args, allow_sealed_edit: bool = False, **kwargs):
        """
        Validates inline additional_fields against the workflow DSL for this state,
        then enforces the sealed-state invariant.

        Global ref fields are stored in junction tables and validated separately by
        the serializer; this method only validates the inline JSON blob.

        Past states are sealed — only the current state of a piece may be modified.
        Pass allow_sealed_edit=True to bypass the sealed check for exceptional
        admin operations.  This should never be done in normal application code paths.
        """
        if self.user_id is None and self.piece_id:
            self.user = self.piece.user

        # Validate inline additional_fields against the DSL schema for this state.
        # Global ref fields are excluded from this schema (they live in junction tables).
        schema = build_additional_fields_schema(self.state)
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


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    openid_subject = models.CharField(max_length=255, blank=True, default='')
    profile_image_url = models.URLField(blank=True, default='')

    def __str__(self) -> str:
        return f'Profile({self.user})'
