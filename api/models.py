import uuid

import jsonschema
from django.conf import settings
from django.db import models

from .workflow import (
    ENTRY_STATE,
    SUCCESSORS,
    TERMINAL_STATES,
    VALID_STATES,
    WORKFLOW_VERSION,
    build_additional_fields_schema,
    get_global_model_and_field,
    get_state_ref_fields,
)

__all__ = [
    'ENTRY_STATE',
    'SUCCESSORS',
    'TERMINAL_STATES',
    'VALID_STATES',
    'WORKFLOW_VERSION',
    'get_global_model_and_field',
    'get_state_ref_fields',
]


class Location(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='locations')
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='uniq_location_name_per_user'),
        ]

    def __str__(self) -> str:
        return self.name


class ClayBody(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='clay_bodies'
    )
    name = models.CharField(max_length=255)
    short_description = models.CharField(max_length=1024, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='uniq_clay_body_name_per_user'),
        ]

    def __str__(self) -> str:
        return self.name


class GlazeType(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='glaze_types'
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
            models.UniqueConstraint(fields=['user', 'name'], name='uniq_glaze_type_name_per_user'),
        ]

    def __str__(self) -> str:
        return self.name


class GlazeMethod(models.Model):
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
