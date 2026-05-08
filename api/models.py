import uuid
from typing import TYPE_CHECKING, Any

import jsonschema
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .model_factories import (
    COMPOSITE_NAME_SEPARATOR as COMPOSITE_NAME_SEPARATOR,
)
from .model_factories import (
    FavoriteModel as FavoriteModel,
)
from .model_factories import (
    GlobalModel as GlobalModel,
)
from .model_factories import (
    ImageForeignKey as ImageForeignKey,
)
from .model_factories import (
    make_compose_global_models,
    make_favorite_model,
    make_piece_state_global_ref_model,
    make_simple_global_model,
    make_taggable_model,
)
from .serializer_factories import make_global_entry_serializer
from .workflow import (
    ENTRY_STATE as ENTRY_STATE,
)
from .workflow import (
    SUCCESSORS as SUCCESSORS,
)
from .workflow import (
    TERMINAL_STATES as TERMINAL_STATES,
)
from .workflow import (
    VALID_STATES as VALID_STATES,
)
from .workflow import (
    WORKFLOW_VERSION,
    build_custom_fields_schema,
    get_compose_from,
    get_global_config,
    get_global_names,
    get_state_global_ref_map,
    get_taggable_globals,
    is_factory_global,
    is_favoritable_global,
)
from .workflow import (
    get_global_model_and_field as get_global_model_and_field,
)
from .workflow import (
    get_state_ref_fields as get_state_ref_fields,
)


class Image(models.Model):
    """Shared image asset referenced by pieces, states, and global entries."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="images",
    )
    url = models.CharField(max_length=2048)
    cloudinary_public_id = models.CharField(max_length=1024, null=True, blank=True)
    cloud_name = models.CharField(max_length=255, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["cloud_name", "cloudinary_public_id"],
                condition=Q(
                    cloud_name__isnull=False, cloudinary_public_id__isnull=False
                ),
                name="uniq_image_cloudinary_identity",
            ),
            models.UniqueConstraint(
                fields=["url"],
                condition=Q(cloudinary_public_id__isnull=True),
                name="uniq_image_url_without_cloudinary_id",
            ),
        ]

    def __str__(self) -> str:
        return self.url

    def as_dict(self) -> dict:
        return {
            "url": self.url,
            "cloudinary_public_id": self.cloudinary_public_id,
            "cloud_name": self.cloud_name,
        }

    def __getitem__(self, key: str):
        return self.as_dict()[key]

    def __eq__(self, other) -> bool:
        if isinstance(other, dict):
            return self.as_dict() == {
                "url": other.get("url") or "",
                "cloudinary_public_id": other.get("cloudinary_public_id"),
                "cloud_name": other.get("cloud_name"),
            }
        return super().__eq__(other)

    __hash__ = models.Model.__hash__


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
        model_name: str = config["model"]
        compose_from = get_compose_from(global_name)
        if compose_from:
            composite, through = make_compose_global_models(global_name)
            ns[model_name] = composite
            compose_config = next(iter(compose_from.values()))
            through_model_name: str = compose_config.get(
                "through_model", f"{model_name}Through"
            )
            ns[through_model_name] = through
        else:
            ns[model_name] = make_simple_global_model(global_name)
        make_global_entry_serializer(global_name, ns[model_name])
        if is_favoritable_global(global_name):
            fav = make_favorite_model(global_name)
            ns[fav.__name__] = fav

    # Generate one junction model per global type that appears as a global ref
    # in any state's fields DSL.  Each junction model stores FK references from
    # PieceState to the global type with DB-level PROTECT integrity.
    for global_name in get_state_global_ref_map():
        ref_model = make_piece_state_global_ref_model(global_name)
        ns[ref_model.__name__] = ref_model

    for global_name in get_taggable_globals():
        tag_model = make_taggable_model(global_name)
        ns[tag_model.__name__] = tag_model


_register_globals()


# ---------------------------------------------------------------------------
# Core piece models
# ---------------------------------------------------------------------------


class Piece(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pieces"
    )
    name = models.CharField(max_length=255)
    created = models.DateTimeField(auto_now_add=True)
    # Tracks changes to owned fields (name, thumbnail) only.
    # Use the `last_modified` property externally — it incorporates the current state's timestamp.
    fields_last_modified = models.DateTimeField(auto_now=True)
    thumbnail = ImageForeignKey(
        to="api.Image",
        related_name="thumbnail_for_pieces",
    )
    thumbnail_crop = models.JSONField(null=True, blank=True, default=None)
    shared = models.BooleanField(default=False)
    current_location = models.ForeignKey(
        "Location",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pieces",
    )
    # Workflow version under which this piece was created. All of its states are
    # validated against this version. Hardcoded to the current WORKFLOW_VERSION
    # for now; future work will allow migrating pieces to newer versions.
    workflow_version = models.CharField(max_length=32, default=WORKFLOW_VERSION)

    class Meta:
        ordering = ["-fields_last_modified"]

    @property
    def current_state(self) -> "PieceState | None":
        return self.states.order_by("-created").first()

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
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="piece_states"
    )
    piece = models.ForeignKey(Piece, on_delete=models.CASCADE, related_name="states")
    state = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    # Inline (non-global-ref) state-specific fields for this state.
    # Global ref fields are stored in per-type junction tables (PieceState*Ref models).
    custom_fields = models.JSONField(default=dict)

    @property
    def workflow_version(self) -> str:
        """The workflow version for this state, inherited from its piece."""
        return self.piece.workflow_version

    class Meta:
        ordering = ["created"]

    def __init__(self, *args, **kwargs):
        self._pending_images = kwargs.pop("images", None)
        super().__init__(*args, **kwargs)

    @property
    def images(self) -> list[dict]:
        from .utils import captioned_image_to_dict

        if self.pk is None:
            return list(self._pending_images or [])
        return [
            captioned_image_to_dict(link)
            for link in self.image_links.select_related("image").order_by("order", "pk")
        ]

    @images.setter
    def images(self, value: list[dict]) -> None:
        self._pending_images = value

    def save(self, *args, allow_sealed_edit: bool = False, **kwargs):
        """
        Validates inline custom_fields against the workflow DSL for this state,
        then enforces the sealed-state invariant.

        Global ref fields are stored in junction tables and validated separately by
        the serializer; this method only validates the inline JSON blob.

        Past states are sealed — only the current state of a piece may be modified.
        Pass allow_sealed_edit=True to bypass the sealed check for exceptional
        admin operations.  This should never be done in normal application code paths.
        """
        if self.user_id is None and self.piece_id:
            self.user = self.piece.user

        # Validate inline custom_fields against the DSL schema for this state.
        # Global ref fields are excluded from this schema (they live in junction tables).
        schema = build_custom_fields_schema(self.state)
        try:
            jsonschema.validate(instance=self.custom_fields, schema=schema)
        except jsonschema.ValidationError as exc:
            raise ValueError(
                f"custom_fields validation failed for state '{self.state}': {exc.message}"
            ) from exc

        if not self._state.adding and not allow_sealed_edit:
            current = self.piece.current_state
            if current is None or current.pk != self.pk:
                raise ValueError(
                    f"PieceState {self.pk} is sealed: only the current state of a piece "
                    f"may be modified. Pass allow_sealed_edit=True to override."
                )
        super().save(*args, **kwargs)
        if self._pending_images is not None:
            from .utils import replace_piece_state_images

            replace_piece_state_images(self, self._pending_images, user=self.user)
            self._pending_images = None

    def __str__(self) -> str:
        return f"{self.piece.name} → {self.state}"


class PieceStateImage(models.Model):
    piece_state = models.ForeignKey(
        PieceState,
        on_delete=models.CASCADE,
        related_name="image_links",
    )
    image = models.ForeignKey(
        Image,
        on_delete=models.PROTECT,
        related_name="piece_state_links",
    )
    caption = models.CharField(max_length=1024, blank=True, default="")
    crop = models.JSONField(null=True, blank=True, default=None)
    created = models.DateTimeField(default=timezone.now)
    order = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["order", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["piece_state", "order"],
                name="uniq_piece_state_image_order",
            )
        ]

    def __str__(self) -> str:
        return f"{self.piece_state} / image {self.order}"


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    openid_subject = models.CharField(max_length=255, blank=True, default="")
    profile_image_url = models.URLField(blank=True, default="")

    def __str__(self) -> str:
        return f"Profile({self.user})"


class AsyncTask(models.Model):
    """
    Tracks the lifecycle and result of an asynchronous background task.

    This model provides a stable, persistent identifier for tasks across different
    background worker implementations (e.g., ThreadPoolExecutor, Celery).
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        FAILURE = "failure", "Failure"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="async_tasks"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    task_type = models.CharField(max_length=255)
    input_params = models.JSONField(default=dict, blank=True)
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self) -> str:
        return f"AsyncTask({self.task_type}, {self.status}, {self.id})"


# These names are injected into the module namespace by _register_globals().
# Typed as Any so mypy allows arbitrary attribute access and type annotation use.
if TYPE_CHECKING:
    ClayBody: Any
    FiringTemperature: Any
    GlazeCombination: Any
    GlazeCombinationLayer: Any
    FavoriteGlazeCombination: Any
    GlazeType: Any
    GlazeMethod: Any
    Location: Any
    Tag: Any
