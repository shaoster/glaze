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
    get_filterable_fields,
    get_global_model_and_field,
    get_state_ref_fields,
)

__all__ = [
    'ENTRY_STATE',
    'FavoriteGlazeCombination',
    'GLAZE_COMBINATION_NAME_SEPARATOR',
    'GlazeCombinationLayer',
    'GlobalModel',
    'SUCCESSORS',
    'TERMINAL_STATES',
    'VALID_STATES',
    'WORKFLOW_VERSION',
    'get_global_model_and_field',
    'get_state_ref_fields',
]

# Separator used in GlazeCombination.name to join the two glaze type names.
# Must not appear in GlazeType.name (enforced by GlazeType.save()).
GLAZE_COMBINATION_NAME_SEPARATOR = '!'


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
        super().save(*args, **kwargs)


class Location(GlobalModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='locations')
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='uniq_location_name_per_user'),
        ]

    def __str__(self) -> str:
        return self.name


class ClayBody(GlobalModel):
    # Public clay bodies (public library managed by admins) have user=None.
    # Private clay bodies are owned by a specific user.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='clay_bodies',
    )
    name = models.CharField(max_length=255)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    class Meta:
        constraints = [
            # Per-user uniqueness for private objects.
            models.UniqueConstraint(
                fields=['user', 'name'],
                condition=Q(user__isnull=False),
                name='uniq_clay_body_name_per_user',
            ),
            # Global uniqueness for public objects (user IS NULL).
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name='uniq_clay_body_name_public',
            ),
        ]

    def __str__(self) -> str:
        return self.name


class GlazeType(GlobalModel):
    # Public glaze types (public library managed by admins) have user=None.
    # Private glaze types are owned by a specific user.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='glaze_types',
    )
    name = models.CharField(max_length=255)
    short_description = models.CharField(max_length=1024, blank=True, default='')
    test_tile_image = models.CharField(max_length=1024, blank=True, default='')
    is_food_safe = models.BooleanField(null=True, blank=True)
    runs = models.BooleanField(null=True, blank=True)
    highlights_grooves = models.BooleanField(null=True, blank=True)
    is_different_on_white_and_brown_clay = models.BooleanField(null=True, blank=True)
    apply_thin = models.BooleanField(null=True, blank=True)

    class Meta:
        constraints = [
            # Per-user uniqueness for private objects.
            models.UniqueConstraint(
                fields=['user', 'name'],
                condition=Q(user__isnull=False),
                name='uniq_glaze_type_name_per_user',
            ),
            # Global uniqueness for public objects (user IS NULL).
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name='uniq_glaze_type_name_public',
            ),
        ]

    def save(self, *args, **kwargs):
        if self.name and GLAZE_COMBINATION_NAME_SEPARATOR in self.name:
            raise ValueError(
                f'Glaze type names cannot contain '
                f'"{GLAZE_COMBINATION_NAME_SEPARATOR}" '
                f'(it is reserved as the glaze combination name separator).'
            )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class GlazeMethod(GlobalModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='glaze_methods'
    )
    name = models.CharField(max_length=255)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='uniq_glaze_method_name_per_user'),
        ]

    def __str__(self) -> str:
        return self.name


class FiringTemperature(GlobalModel):
    """A named firing profile (cone, peak temperature, atmosphere).

    Public-only (user=NULL, managed via Django admin). There are no private
    FiringTemperature records; users reference the shared public library.
    """

    CONE_CHOICES = [
        ('04', '04'), ('03', '03'), ('02', '02'), ('01', '01'),
        ('1', '1'), ('2', '2'), ('3', '3'), ('4', '4'), ('5', '5'),
        ('6', '6'), ('7', '7'), ('8', '8'), ('9', '9'), ('10', '10'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='firing_temperatures',
    )
    name = models.CharField(max_length=255)
    cone = models.CharField(max_length=16, blank=True, default='', choices=CONE_CHOICES)
    temperature_c = models.IntegerField(null=True, blank=True)
    atmosphere = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name='uniq_firing_temperature_name_public',
            ),
        ]

    def __str__(self) -> str:
        return self.name


class GlazeCombination(GlobalModel):
    """An ordered combination of one or more glaze layers with shared application properties.

    Public combinations (user=NULL) are managed via Django admin and visible to
    all users. Private combinations (user IS NOT NULL) are user-owned.

    ``name`` is a stored computed field built by joining ordered layer glaze type
    names with ``GLAZE_COMBINATION_NAME_SEPARATOR``. It is stored in the DB so
    generic list views can sort/filter by name without loading related objects.
    The name must be set (via ``compute_name_from_layers`` or a factory method)
    before calling save(); it is not recomputed in save() because M2M layers may
    not yet exist when the row is first inserted.

    Uniqueness is enforced on ``name`` (which encodes the full ordered layer
    sequence) rather than on individual FK columns.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='glaze_combinations',
    )
    # Stored computed field: set from ordered GlazeCombinationLayer rows.
    name = models.CharField(max_length=2047, blank=True, default='')
    glaze_types = models.ManyToManyField(
        GlazeType,
        through='GlazeCombinationLayer',
        related_name='combinations',
    )
    firing_temperature = models.ForeignKey(
        FiringTemperature,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='combinations',
    )
    test_tile_image = models.CharField(max_length=1024, blank=True, default='')
    is_food_safe = models.BooleanField(null=True, blank=True)
    runs = models.BooleanField(null=True, blank=True)
    highlights_grooves = models.BooleanField(null=True, blank=True)
    is_different_on_white_and_brown_clay = models.BooleanField(null=True, blank=True)

    class Meta:
        constraints = [
            # Global uniqueness for public combinations (user IS NULL).
            models.UniqueConstraint(
                fields=['name'],
                condition=Q(user__isnull=True),
                name='uniq_glaze_combination_name_public',
            ),
            # Per-user uniqueness for private combinations.
            models.UniqueConstraint(
                fields=['user', 'name'],
                condition=Q(user__isnull=False),
                name='uniq_glaze_combination_name_per_user',
            ),
        ]

    @staticmethod
    def compute_name(glaze_type_names: list[str]) -> str:
        """Build a combination name from an ordered list of glaze type name strings."""
        return GLAZE_COMBINATION_NAME_SEPARATOR.join(glaze_type_names)

    @classmethod
    def get_or_create_with_layers(
        cls,
        user,
        glaze_types: list['GlazeType'],
    ) -> tuple['GlazeCombination', bool]:
        """Find or create a combination with the given ordered GlazeType list.

        Returns (instance, created). Creates a private combination owned by
        ``user``. Raises ValueError if any layer violates the public reference
        constraint (public combinations may only reference public GlazeTypes).
        """
        if not glaze_types:
            raise ValueError('A glaze combination must have at least one layer.')
        name = cls.compute_name([str(gt) for gt in glaze_types])
        combo, created = cls.objects.get_or_create(user=user, name=name)
        if created:
            for order, gt in enumerate(glaze_types):
                GlazeCombinationLayer.objects.create(combination=combo, glaze_type=gt, order=order)
        return combo, created

    @classmethod
    def get_or_create_from_ordered_pks(
        cls,
        user,
        pks: list,
    ) -> tuple['GlazeCombination', bool]:
        """Find or create a combination from an ordered list of GlazeType PKs.

        Raises ValueError for unknown PKs or an empty list. Used by the generic
        global_entries view for models with ordered M2M relations.
        """
        glaze_types = []
        for pk in pks:
            try:
                glaze_types.append(GlazeType.objects.get(pk=pk))
            except (GlazeType.DoesNotExist, ValueError):
                raise ValueError(f'GlazeType with id {pk!r} not found.')
        return cls.get_or_create_with_layers(user=user, glaze_types=glaze_types)

    @classmethod
    def post_fixture_load(cls, obj: 'GlazeCombination', created: bool) -> None:
        """Reconstruct ordered M2M layers from the stored name after fixture load.

        Called by load_public_library for any model that declares this hook.
        Only runs on newly created records; existing records already have layers.
        Expects all referenced GlazeType names (public, user=None) to exist.
        """
        if not created:
            return
        layer_names = obj.name.split(GLAZE_COMBINATION_NAME_SEPARATOR)
        for order, gt_name in enumerate(layer_names):
            gt = GlazeType.objects.get(user=None, name=gt_name)
            GlazeCombinationLayer.objects.create(combination=obj, glaze_type=gt, order=order)

    # Declares which fields are exposed as query-param filters in the global_entries view.
    # Boolean fields are derived from workflow.yml (filterable: true entries).
    # Relational filters (m2m_id, fk_id) use ORM lookups not expressible in workflow.yml
    # and are declared explicitly here.
    filterable_fields: dict[str, dict] = {
        # Derived from workflow.yml — boolean property filters.
        **{k: {'type': 'boolean'} for k in get_filterable_fields('glaze_combination')},
        # Relational filters that require custom ORM lookups and param names.
        'layers__glaze_type_id': {'type': 'm2m_id', 'param': 'glaze_type_ids'},
        'firing_temperature_id': {'type': 'fk_id', 'param': 'firing_temperature_id'},
    }

    def __str__(self) -> str:
        return self.name


class GlazeCombinationLayer(models.Model):
    """Through table for the ordered glaze layers of a GlazeCombination.

    Invariant: if the parent combination is public (user=NULL), the referenced
    GlazeType must also be public (user=NULL). Enforced in save() so it applies
    to both ORM and admin usage.
    """

    combination = models.ForeignKey(
        GlazeCombination,
        on_delete=models.CASCADE,
        related_name='layers',
    )
    glaze_type = models.ForeignKey(
        GlazeType,
        on_delete=models.PROTECT,
        related_name='combination_layers',
    )
    glaze_method = models.ForeignKey(
        GlazeMethod,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='combination_layers',
    )
    order = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ['order']

    def save(self, *args, **kwargs):
        # Public combinations may only reference public (user=NULL) GlazeTypes.
        if self.combination.user_id is None and self.glaze_type.user_id is not None:
            raise ValueError(
                f'Public glaze combinations can only reference public glaze types. '
                f'GlazeType "{self.glaze_type}" (id={self.glaze_type_id}) is private.'
            )
        # Public combinations cannot reference private GlazeMethods (no public GlazeMethods exist).
        if self.combination.user_id is None and self.glaze_method_id is not None:
            raise ValueError(
                f'Public glaze combinations cannot reference private glaze methods. '
                f'GlazeMethod id={self.glaze_method_id} is private.'
            )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.glaze_type} (drag to reorder)'


class FavoriteGlazeCombination(models.Model):
    """Records a user's favorited glaze combinations."""

    # Name of the FK field pointing to the favorited global object. Used by
    # get_favorite_ids_for() so the generic view code does not need to know
    # the concrete FK name on each Favorite* subclass.
    global_fk_field = 'glaze_combination'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorite_glaze_combinations',
    )
    glaze_combination = models.ForeignKey(
        GlazeCombination,
        on_delete=models.CASCADE,
        related_name='favorited_by',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'glaze_combination'],
                name='uniq_favorite_glaze_combination_per_user',
            )
        ]

    @classmethod
    def get_favorite_ids_for(cls, user) -> set:
        """Return the set of favorited global-object PKs for the given user."""
        return set(cls.objects.filter(user=user).values_list(f'{cls.global_fk_field}_id', flat=True))


class Piece(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pieces')
    name = models.CharField(max_length=255)
    created = models.DateTimeField(auto_now_add=True)
    # Tracks changes to owned fields (name, thumbnail) only.
    # Use the `last_modified` property externally — it incorporates the current state's timestamp.
    fields_last_modified = models.DateTimeField(auto_now=True)
    thumbnail = models.CharField(max_length=1024, blank=True, default='')
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
