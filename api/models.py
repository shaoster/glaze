import uuid
from typing import ClassVar

import jsonschema
from django.conf import settings
from django.db import models
from django.db.models import Q

from .workflow import (
    ENTRY_STATE,
    SUCCESSORS,
    TERMINAL_STATES,
    VALID_STATES,
    WORKFLOW_VERSION,
    build_additional_fields_schema,
    get_filterable_compose_fields,
    get_filterable_fields,
    get_filterable_ref_fields,
    get_global_config,
    get_global_model_and_field,
    get_state_ref_fields,
    is_public_global,
)

__all__ = [
    'COMPOSITE_NAME_SEPARATOR',
    'ENTRY_STATE',
    'FavoriteGlazeCombination',
    'GlazeCombinationLayer',
    'GlobalModel',
    'SUCCESSORS',
    'TERMINAL_STATES',
    'VALID_STATES',
    'WORKFLOW_VERSION',
    'get_global_model_and_field',
    'get_state_ref_fields',
]

# Separator used in compose_from globals to join ordered component names into a
# stored computed name (e.g. GlazeCombination.name = "LayerA!LayerB").
# Must not appear in the names of simple globals (enforced in GlobalModel.save()).
COMPOSITE_NAME_SEPARATOR = '!'


class GlobalModel(models.Model):
    """Abstract base class for all global domain types in the Glaze workflow.

    Enforces:
    - User immutability: the ``user`` field cannot change after creation.
      Changing user after creation could silently break public/private
      reference invariants (e.g. a GlazeCombination whose referenced
      GlazeTypes must all be public).
    - Name field convention: every concrete subclass must declare a ``name``
      attribute (CharField or computed property) so that generic views and
      management commands can sort/display objects uniformly.

    Maintains ``GlobalModel._registry`` — a list of every concrete subclass —
    for use in parameterised tests that must cover all registered globals.
    """

    _registry: ClassVar[list[type['GlobalModel']]] = []

    # Set to True on compose_from globals whose ``name`` is a separator-joined
    # string of component names (e.g. GlazeCombination).  When False, save()
    # rejects any name that contains COMPOSITE_NAME_SEPARATOR so that component
    # names remain safe to embed in a composite name.
    _computed_name: ClassVar[bool] = False

    class Meta:
        abstract = True

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # Append every direct or indirect concrete subclass to the registry.
        # Concrete vs. abstract is checked at test time via cls._meta.abstract;
        # here we eagerly append so registration is automatic and order matches
        # source declaration order.
        GlobalModel._registry.append(cls)

    def save(self, *args, **kwargs):
        if self.pk is not None:
            old_user_id = (
                type(self).objects
                .filter(pk=self.pk)
                .values_list('user_id', flat=True)
                .first()
            )
            if old_user_id != self.user_id:
                raise ValueError(
                    f'Cannot change the user field on {type(self).__name__} '
                    f'(pk={self.pk}) after creation.'
                )
        if not self._computed_name and self.name and COMPOSITE_NAME_SEPARATOR in self.name:
            raise ValueError(
                f'{type(self).__name__} names cannot contain '
                f'"{COMPOSITE_NAME_SEPARATOR}" '
                f'(it is reserved as the composite name separator).'
            )
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Simple global model factory
# ---------------------------------------------------------------------------

def _pluralize_snake(name: str) -> str:
    """Return the simple plural form of a snake_case identifier.

    Handles the English y→ies rule; otherwise appends 's'.
    Examples: 'location' → 'locations', 'clay_body' → 'clay_bodies'.
    """
    if name.endswith('y'):
        return name[:-1] + 'ies'
    return name + 's'


def _dsl_field_to_django_field(field_name: str, field_def: dict) -> models.Field:
    """Convert a workflow.yml DSL field definition to a Django model Field.

    Applies these conventions:
    - ``name`` fields → CharField(max_length=255) — no blank/default, to match
      the migration baseline for all existing globals.
    - Enum string fields → CharField with choices and max_length=max(enum values, 16).
    - Other string/image fields → CharField(max_length=1024, blank=True, default='').
    - integer → IntegerField(null=True, blank=True)
    - number  → FloatField(null=True, blank=True)
    - boolean → BooleanField(null=True, blank=True)  (nullable for tri-state UI)
    - array/object → JSONField(default=dict)
    """
    field_type = field_def.get('type', 'string')
    enum = field_def.get('enum')

    if field_type in ('string', 'image'):
        if field_name == 'name':
            return models.CharField(max_length=255)
        if enum:
            max_length = max(max(len(v) for v in enum), 16)
            return models.CharField(max_length=max_length, blank=True, default='', choices=[(v, v) for v in enum])
        max_length = field_def.get('max_length', 1024)
        return models.CharField(max_length=max_length, blank=True, default='')
    if field_type == 'integer':
        return models.IntegerField(null=True, blank=True)
    if field_type == 'number':
        return models.FloatField(null=True, blank=True)
    if field_type == 'boolean':
        return models.BooleanField(null=True, blank=True)
    return models.JSONField(default=dict)


def _make_simple_global_model(global_name: str) -> type:
    """Generate a GlobalModel subclass for a simple (non-compose_from) global.

    Fields, the user FK, and uniqueness constraints are derived entirely from
    the workflow.yml global declaration — no hand-written model class is needed.
    Globals with bespoke ``save()`` logic or cross-model constraints should
    remain hand-written.

    The generated class is assigned ``__module__ = 'api.models'`` so Django
    migrations treat it identically to a hand-written model class.  Adding a
    new simple global to workflow.yml only requires a ``makemigrations`` run.

    DSL fields whose definition contains a ``$ref`` key are skipped — those
    describe ``additional_fields`` references, not columns on the global model.
    """
    config = get_global_config(global_name)
    if not config:
        raise ValueError(f'Unknown global: {global_name!r}')

    model_name: str = config['model']
    is_public: bool = bool(config.get('public', False))
    is_private: bool = bool(config.get('private', True))
    dsl_fields: dict = config.get('fields', {})
    plural: str = config.get('plural', _pluralize_snake(global_name))

    attrs: dict = {
        '__module__': 'api.models',
        '__str__': lambda self: self.name,
    }

    # user FK — nullable for public (or public+private) globals, required for private-only.
    user_kwargs: dict = {
        'to': settings.AUTH_USER_MODEL,
        'on_delete': models.CASCADE,
        'related_name': plural,
    }
    if is_public:
        user_kwargs.update({'null': True, 'blank': True})
    attrs['user'] = models.ForeignKey(**user_kwargs)

    # Inline DSL fields — $ref entries are additional_fields references, not model columns.
    for field_name, field_def in dsl_fields.items():
        if '$ref' not in field_def:
            attrs[field_name] = _dsl_field_to_django_field(field_name, field_def)

    # Standard uniqueness constraints derived from public/private flags.
    constraints: list = []
    if is_public and is_private:
        constraints += [
            models.UniqueConstraint(
                fields=['user', 'name'],
                condition=Q(user__isnull=False),
                name=f'uniq_{global_name}_name_per_user',
            ),
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name=f'uniq_{global_name}_name_public',
            ),
        ]
    elif is_public:
        # public-only (private: false) — only admin-managed public objects exist.
        constraints.append(
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name=f'uniq_{global_name}_name_public',
            )
        )
    else:
        # private-only — each user owns their own set.
        constraints.append(
            models.UniqueConstraint(
                fields=['user', 'name'],
                name=f'uniq_{global_name}_name_per_user',
            )
        )

    attrs['Meta'] = type('Meta', (), {'constraints': constraints})
    return type(model_name, (GlobalModel,), attrs)


# ---------------------------------------------------------------------------
# Compose-from global model factory
# ---------------------------------------------------------------------------

def _make_compose_global_models(global_name: str) -> tuple[type, type]:
    """Generate (CompositeModel, LayerModel) for a compose_from global.

    Returns a pair of Django model classes:

    - **CompositeModel** — a GlobalModel subclass with an ordered M2M field,
      a stored computed ``name`` (component names joined by
      ``COMPOSITE_NAME_SEPARATOR``), inline DSL fields, FK fields for
      global $ref entries, standard public/private UniqueConstraints, and
      ``compute_name()`` / ``get_or_create_with_layers()`` helpers.
    - **LayerModel** — the through table with FKs to the composite and the
      component model, an ``order`` field (when ``ordered: true``), and any
      ``through_fields`` declared in the DSL as FK columns.

    Both classes are assigned ``__module__ = 'api.models'`` so Django
    migrations treat them identically to hand-written model classes.  Adding a
    new compose_from global to workflow.yml only requires a ``makemigrations``
    run — no new model code is needed.
    """
    config = get_global_config(global_name)
    if not config:
        raise ValueError(f'Unknown global: {global_name!r}')
    compose_from = config.get('compose_from')
    if not compose_from:
        raise ValueError(f"Global '{global_name}' has no compose_from declaration.")

    model_name: str = config['model']
    is_public: bool = bool(config.get('public', False))
    is_private: bool = bool(config.get('private', True))
    dsl_fields: dict = config.get('fields', {})
    plural: str = config.get('plural', _pluralize_snake(global_name))
    layer_model_name = f'{model_name}Layer'

    # compose_from has exactly one key (the M2M relationship name, e.g. 'glaze_types').
    compose_key = next(iter(compose_from))
    compose_config = compose_from[compose_key]
    component_global: str = compose_config['global']
    component_model_name: str = get_global_config(component_global)['model']
    through_fields: dict = compose_config.get('through_fields', {})
    is_ordered: bool = bool(compose_config.get('ordered', False))

    # --- Through (layer) model ---
    layer_attrs: dict = {
        '__module__': 'api.models',
        'combination': models.ForeignKey(
            f'api.{model_name}',
            on_delete=models.CASCADE,
            related_name='layers',
        ),
        component_global: models.ForeignKey(
            f'api.{component_model_name}',
            on_delete=models.PROTECT,
        ),
        '__str__': lambda self: str(self.pk),
    }
    if is_ordered:
        layer_attrs['order'] = models.PositiveSmallIntegerField()

    for tf_name, tf_def in through_fields.items():
        ref = tf_def.get('$ref', '')
        required = bool(tf_def.get('required', False))
        if ref.startswith('@'):
            ref_global = ref[1:].split('.')[0]
            ref_model_name = get_global_config(ref_global)['model']
            layer_attrs[tf_name] = models.ForeignKey(
                f'api.{ref_model_name}',
                on_delete=models.SET_NULL,
                null=not required,
                blank=not required,
                related_name=f'{global_name}_layers',
            )

    layer_meta_kwargs: dict = {}
    if is_ordered:
        layer_meta_kwargs['ordering'] = ['order']
    layer_attrs['Meta'] = type('Meta', (), layer_meta_kwargs)

    # Public-reference invariant: if the parent composite is public (user=NULL),
    # its component and all through-field references must also be public.
    # Computed once at factory time; captured in the save() closure.
    #
    # - The component global is always checked: a public composite can only
    #   reference public components.
    # - Through fields referencing non-public globals must be NULL on public
    #   composites (no public instances of those globals exist to reference).
    _private_through_fks: list[tuple[str, str]] = [
        (tf_name, ref[1:].split('.')[0])
        for tf_name, tf_def in through_fields.items()
        if (ref := tf_def.get('$ref', '')) and ref.startswith('@')
        and not is_public_global(ref[1:].split('.')[0])
    ]
    _cg = component_global  # captured name for closure

    def _layer_save(self, *args, **kwargs):
        if self.combination.user_id is None:
            component = getattr(self, _cg)
            if component.user_id is not None:
                component_cls_name = type(component).__name__
                raise ValueError(
                    f'Public {model_name} can only reference public '
                    f'{component_cls_name} instances. '
                    f'{component_cls_name} "{component}" (id={component.pk}) is private.'
                )
            for tf_name, tf_global in _private_through_fks:
                if getattr(self, f'{tf_name}_id') is not None:
                    raise ValueError(
                        f'Public {model_name} cannot reference private '
                        f'{tf_global} instances (id={getattr(self, f"{tf_name}_id")}).'
                    )
        super(type(self), self).save(*args, **kwargs)

    layer_attrs['save'] = _layer_save
    layer_model = type(layer_model_name, (models.Model,), layer_attrs)

    # --- Composite model ---
    composite_attrs: dict = {
        '__module__': 'api.models',
        # The name field intentionally contains COMPOSITE_NAME_SEPARATOR.
        '_computed_name': True,
        # Stored computed name — set via compute_name() before save().
        'name': models.CharField(max_length=2047, blank=True, default=''),
        # Ordered M2M to the component type via the through table.
        compose_key: models.ManyToManyField(
            f'api.{component_model_name}',
            through=f'api.{layer_model_name}',
            related_name='combinations',
        ),
        '__str__': lambda self: self.name,
    }

    # user FK.
    user_kwargs: dict = {
        'to': settings.AUTH_USER_MODEL,
        'on_delete': models.CASCADE,
        'related_name': plural,
    }
    if is_public:
        user_kwargs.update({'null': True, 'blank': True})
    composite_attrs['user'] = models.ForeignKey(**user_kwargs)

    # Inline and global-ref fields from the DSL (skip 'name' — already added).
    for field_name, field_def in dsl_fields.items():
        if field_name == 'name':
            continue
        if '$ref' in field_def:
            ref = field_def['$ref']
            if ref.startswith('@'):
                ref_global = ref[1:].split('.')[0]
                ref_model_name = get_global_config(ref_global)['model']
                composite_attrs[field_name] = models.ForeignKey(
                    f'api.{ref_model_name}',
                    on_delete=models.SET_NULL,
                    null=True,
                    blank=True,
                    related_name=plural,
                )
        else:
            composite_attrs[field_name] = _dsl_field_to_django_field(field_name, field_def)

    # Standard uniqueness constraints.
    constraints: list = []
    if is_public and is_private:
        constraints += [
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name=f'uniq_{global_name}_name_public',
            ),
            models.UniqueConstraint(
                fields=['user', 'name'],
                condition=Q(user__isnull=False),
                name=f'uniq_{global_name}_name_per_user',
            ),
        ]
    elif is_public:
        constraints.append(
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name=f'uniq_{global_name}_name_public',
            )
        )
    else:
        constraints.append(
            models.UniqueConstraint(
                fields=['user', 'name'],
                name=f'uniq_{global_name}_name_per_user',
            )
        )
    composite_attrs['Meta'] = type('Meta', (), {'constraints': constraints})

    # compute_name — joins component display names with the standard separator.
    @staticmethod  # type: ignore[misc]
    def compute_name(component_names: list[str]) -> str:
        return COMPOSITE_NAME_SEPARATOR.join(component_names)

    composite_attrs['compute_name'] = compute_name

    # get_or_create_with_layers — finds or creates a composite from a list of component instances.
    # The second positional/keyword parameter is named after the compose_key so callers can
    # use the domain-specific keyword name (e.g. glaze_types=[...] for glaze_combination).
    _component_model_name = component_model_name
    _layer_model_ref: list = []  # filled after layer_model is created (avoids closure mutation)
    _compose_key = compose_key  # capture for closure

    def _make_get_or_create(ck, cg, lmr):
        @classmethod  # type: ignore[misc]
        def get_or_create_with_layers(cls, user, **kwargs) -> tuple:
            components = kwargs[ck] if ck in kwargs else kwargs.get('components')
            if components is None:
                raise TypeError(
                    f'get_or_create_with_layers() requires keyword argument '
                    f'{ck!r} (or generic alias "components")'
                )
            if not components:
                raise ValueError(f'A {cls.__name__} must have at least one layer.')
            name = cls.compute_name([str(c) for c in components])
            composite, created = cls.objects.get_or_create(user=user, name=name)
            if created:
                lm = lmr[0]
                for order, component in enumerate(components):
                    lm.objects.create(combination=composite, **{cg: component}, order=order)
            return composite, created
        return get_or_create_with_layers

    get_or_create_with_layers = _make_get_or_create(_compose_key, component_global, _layer_model_ref)
    composite_attrs['get_or_create_with_layers'] = get_or_create_with_layers

    # get_or_create_from_ordered_pks — resolves PKs to component instances, then delegates.
    @classmethod  # type: ignore[misc]
    def get_or_create_from_ordered_pks(cls, user, pks: list) -> tuple:
        from django.apps import apps as _apps
        component_model = _apps.get_model('api', _component_model_name)
        components = []
        for pk in pks:
            try:
                components.append(component_model.objects.get(pk=pk))
            except component_model.DoesNotExist as exc:
                raise ValueError(f'Unknown {_component_model_name} pk: {pk!r}') from exc
        if not components:
            raise ValueError(f'A {model_name} must have at least one layer.')
        return cls.get_or_create_with_layers(user=user, components=components)

    composite_attrs['get_or_create_from_ordered_pks'] = get_or_create_from_ordered_pks

    composite_model = type(model_name, (GlobalModel,), composite_attrs)
    _layer_model_ref.append(layer_model)

    # filterable_fields — fully derived from workflow.yml:
    # - boolean fields with filterable: true (inline fields)
    # - FK fields with filterable: true (global ref fields → _id suffix)
    # - compose_from relationships with filter_label (m2m → layers__<component>_id)
    composite_model.filterable_fields = {
        **{k: {'type': 'boolean'} for k in get_filterable_fields(global_name)},
        **get_filterable_ref_fields(global_name),
        **get_filterable_compose_fields(global_name),
    }

    return composite_model, layer_model


# ---------------------------------------------------------------------------
# Simple globals — generated from workflow.yml (no bespoke model code needed)
# ---------------------------------------------------------------------------

#: Private-only location. Fields: name.
Location = _make_simple_global_model('location')

#: Public + private clay body. Fields: name, short_description.
ClayBody = _make_simple_global_model('clay_body')


#: Public + private glaze type. Fields: name, short_description, test_tile_image, five boolean filters.
GlazeType = _make_simple_global_model('glaze_type')


#: Private-only glaze application method. Fields: name, short_description.
GlazeMethod = _make_simple_global_model('glaze_method')


#: Public-only firing profile. Fields: name, cone (enum), temperature_c, atmosphere.
FiringTemperature = _make_simple_global_model('firing_temperature')


# ---------------------------------------------------------------------------
# Compose-from globals — generated from workflow.yml
# ---------------------------------------------------------------------------

#: Ordered combination of glaze layers — generated base from workflow.yml.
GlazeCombination, GlazeCombinationLayer = _make_compose_global_models('glaze_combination')

# --- GlazeCombination bespoke additions ---

@classmethod  # type: ignore[misc]
def _glaze_combination_post_fixture_load(cls, obj, created: bool) -> None:
    """Reconstruct ordered M2M layers from the stored name after fixture load.

    Called by load_public_library for any model that declares this hook.
    Only runs on newly created records; existing records already have layers.
    Expects all referenced GlazeType names (public, user=None) to exist.
    """
    if not created:
        return
    layer_names = obj.name.split(COMPOSITE_NAME_SEPARATOR)
    for order, gt_name in enumerate(layer_names):
        gt = GlazeType.objects.get(user=None, name=gt_name)
        GlazeCombinationLayer.objects.create(combination=obj, glaze_type=gt, order=order)


GlazeCombination.post_fixture_load = _glaze_combination_post_fixture_load

GlazeCombinationLayer.__str__ = lambda self: f'{self.glaze_type} (drag to reorder)'


class FavoriteModel(models.Model):
    """Abstract base class for per-user favorites junction tables.

    Subclasses add one FK field pointing to the favorited global object and
    declare ``global_fk_field`` as a class variable naming that FK.  All other
    favorites logic — the user FK, the uniqueness constraint naming convention,
    and ``get_favorite_ids_for`` — is generic and lives here.

    Use ``_make_favorite_model(global_name)`` to generate a concrete subclass
    from a ``favoritable: true`` global in workflow.yml.  Only a
    ``makemigrations`` run is required for a new favoritable global.
    """

    # Name of the FK field pointing to the favorited global object.  Subclasses
    # must override this.  Used by get_favorite_ids_for() and by views that
    # must add/remove favorites without knowing the concrete FK name.
    global_fk_field: ClassVar[str]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='+',  # no reverse accessor needed; subclasses may override
    )

    class Meta:
        abstract = True

    @classmethod
    def get_favorite_ids_for(cls, user) -> set:
        """Return the set of favorited global-object PKs for the given user."""
        return set(cls.objects.filter(user=user).values_list(f'{cls.global_fk_field}_id', flat=True))


def _make_favorite_model(global_name: str) -> type:
    """Generate a FavoriteModel subclass for a ``favoritable: true`` global.

    Produces a class named ``Favorite<ModelName>`` with:
    - ``user`` FK (related_name=``favorite_<plural>``)
    - ``<global_name>`` FK (related_name=``'favorited_by'``)
    - ``global_fk_field = global_name``
    - UniqueConstraint named ``uniq_favorite_<global_name>_per_user``

    The generated class is assigned ``__module__ = 'api.models'`` so Django
    migrations treat it identically to a hand-written model class.
    """
    config = get_global_config(global_name)
    if not config:
        raise ValueError(f'Unknown global: {global_name!r}')

    model_name: str = config['model']
    plural: str = config.get('plural', _pluralize_snake(global_name))

    attrs: dict = {
        '__module__': 'api.models',
        'global_fk_field': global_name,
        'user': models.ForeignKey(
            settings.AUTH_USER_MODEL,
            on_delete=models.CASCADE,
            related_name=f'favorite_{plural}',
        ),
        global_name: models.ForeignKey(
            f'api.{model_name}',
            on_delete=models.CASCADE,
            related_name='favorited_by',
        ),
        'Meta': type('Meta', (), {
            'constraints': [
                models.UniqueConstraint(
                    fields=['user', global_name],
                    name=f'uniq_favorite_{global_name}_per_user',
                )
            ]
        }),
    }

    return type(f'Favorite{model_name}', (FavoriteModel,), attrs)


#: Per-user favorites for glaze combinations — generated from workflow.yml favoritable: true.
FavoriteGlazeCombination = _make_favorite_model('glaze_combination')


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
        if self.user_id is None and self.piece_id:
            self.user = self.piece.user

        # Validate additional_fields against the DSL schema for this state.
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
