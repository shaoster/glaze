import uuid
from datetime import datetime
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from django.apps import apps
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from backend.otel import traced_class

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
    get_compose_from,
    get_global_config,
    get_global_names,
    get_global_ref_fields_for_state,
    get_state_config,
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

_MISSING = object()


# Only a handful of global-ref types exist for piece states, so keep this bounded.
@lru_cache(maxsize=8)
def _piece_state_ref_related_name(global_name: str) -> str:
    config = get_global_config(global_name)
    ref_model = apps.get_model("api", f"PieceState{config['model']}Ref")
    related_name = ref_model._meta.get_field("piece_state").remote_field.related_name
    assert related_name is not None
    return related_name


class AllowedEmail(models.Model):
    class Status(models.TextChoices):
        WAITLISTED = "waitlisted", "Waitlisted"
        APPROVED = "approved", "Approved"

    email = models.EmailField(unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.APPROVED,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            models.Case(
                models.When(status="waitlisted", then=0),
                default=1,
                output_field=models.IntegerField(),
            ),
            "email",
        ]

    def __str__(self) -> str:
        return f"{self.email} ({self.status})"


@traced_class
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


@traced_class
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
    showcase_story = models.TextField(blank=True, default="")
    showcase_fields = models.JSONField(default=list)
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
    # When True, all state invariants are suspended: sealed checks, successor
    # validation, and sharing are bypassed so past states can be retroactively
    # added or edited. Shared pieces are inaccessible to non-owners while editable.
    is_editable = models.BooleanField(default=False)

    class Meta:
        ordering = ["-fields_last_modified"]

    def _prefetched_states(self) -> list["PieceState"] | None:
        """Return prefetched states when the relation is already cached."""
        states = getattr(self, "_prefetched_objects_cache", {}).get("states")
        if states is None:
            return None
        return list(states)

    @staticmethod
    def _state_sort_key(state: "PieceState") -> tuple[bool, int, datetime]:
        order = state.order if state.order is not None else -1
        return (state.order is not None, order, state.created)

    @property
    def current_state(self) -> "PieceState | None":
        prefetched_states = self._prefetched_states()
        if prefetched_states is not None:
            if not prefetched_states:
                return None
            return max(prefetched_states, key=self._state_sort_key)

    def _prefetched_state(self, state_id: str) -> "PieceState | None | object":
        states = self._prefetched_states()
        if states is None:
            return _MISSING
        matches = [state for state in states if state.state == state_id]
        if not matches:
            return None
        return max(matches, key=lambda state: state.created)

    @property
    def current_state(self) -> "PieceState | None":
        states = self._prefetched_states()
        if states is not None:
            if not states:
                return None
            return max(
                states,
                key=lambda state: (
                    state.order is not None,
                    state.order if state.order is not None else -1,
                    state.created,
                ),
            )

        from django.db.models import F

        return self.states.order_by(
            F("order").desc(nulls_last=True), "-created"
        ).first()

    @property
    def last_modified(self):
        cs = self.current_state
        if cs is None:
            return self.fields_last_modified
        return max(self.fields_last_modified, cs.last_modified)

    def __str__(self) -> str:
        return self.name


@traced_class
class PieceState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="piece_states"
    )
    piece = models.ForeignKey(Piece, on_delete=models.CASCADE, related_name="states")
    state = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default="")
    created = models.DateTimeField(default=timezone.now)
    last_modified = models.DateTimeField(auto_now=True)
    # Sequential position in piece history. Set on creation; shifted up when a
    # retroactive state is inserted before this one.
    order = models.PositiveIntegerField(null=True, blank=True)
    # Set to True when this state is created or edited while piece.is_editable=True.
    # Silent flag reserved for future analysis; not displayed in the UI.
    has_been_edited = models.BooleanField(default=False)
    # Inline (non-global-ref) state-specific fields for this state.
    # Global ref fields are stored in per-type junction tables (PieceState*Ref models).
    custom_fields = models.JSONField(default=dict, blank=True)

    @property
    def workflow_version(self) -> str:
        """The workflow version for this state, inherited from its piece."""
        return self.piece.workflow_version

    class Meta:
        ordering = ["order", "created"]

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

    def _prefetched_global_ref(self, field_name: str) -> Any | None | object:
        global_ref_map = get_global_ref_fields_for_state(self.state)
        global_name = global_ref_map.get(field_name)
        if global_name is None:
            return _MISSING
        related_name = _piece_state_ref_related_name(global_name)
        refs = getattr(self, "_prefetched_objects_cache", {}).get(related_name)
        if refs is None:
            return _MISSING
        for ref_row in refs:
            if ref_row.field_name == field_name:
                return getattr(ref_row, global_name)
        return None

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

        if self._state.adding and self.order is None and self.piece_id:
            from django.db.models import Max

            max_order = self.piece.states.aggregate(Max("order"))["order__max"] or 0
            self.order = max_order + 1

        # Validate inline custom_fields against the DSL schema for this state.
        # Global ref fields are excluded from this schema (they live in junction tables).
        from .workflow import validate_custom_fields

        validate_custom_fields(self.state, self.custom_fields)

        is_editable = getattr(self.piece, "is_editable", False)
        if is_editable and not self._state.adding:
            self.has_been_edited = True
        if not self._state.adding and not allow_sealed_edit and not is_editable:
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

    def resolve_custom_field(self, field_name: str) -> Any:
        """Resolve a field value, following state-ref markers transitively.

        Checks ``custom_fields`` for the field or a marker string. If a marker
        is found, traverses history to find the authoritative ancestor. If
        not in ``custom_fields``, checks global-ref junction tables or
        evaluates calculated fields.
        """
        val = self.custom_fields.get(field_name)
        if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
            marker = val[1:-1]
            if "." in marker:
                src_state_id, src_field_name = marker.split(".", 1)
                ancestor = self.piece._prefetched_state(src_state_id)
                if ancestor is _MISSING:
                    ancestor = (
                        self.piece.states.filter(state=src_state_id)
                        .order_by("-created")
                        .first()
                    )
                if ancestor is not None:
                    assert isinstance(ancestor, PieceState)
                    return ancestor.resolve_custom_field(src_field_name)

        if val is not None:
            return val

        # Not in custom_fields. Check if it's a calculated field.
        state_config = get_state_config(self.state)
        field_def = state_config.get("fields", {}).get(field_name, {})
        if "compute" in field_def:
            computed_val = self._evaluate_compute(field_def["compute"])
            if computed_val is not None:
                decimals = field_def.get("decimals")
                if decimals is not None:
                    effective_decimals = (
                        decimals + 2
                        if field_def.get("display_as") == "percent"
                        else decimals
                    )
                    return round(computed_val, effective_decimals)
            return computed_val

        # Not in custom_fields or calculated. Check junction tables for global refs.
        global_ref_map = get_global_ref_fields_for_state(self.state)
        if field_name in global_ref_map:
            prefetched_global_ref = self._prefetched_global_ref(field_name)
            if prefetched_global_ref is not _MISSING:
                return prefetched_global_ref
            global_name = global_ref_map[field_name]
            config = get_global_config(global_name)
            ref_model = apps.get_model("api", f"PieceState{config['model']}Ref")
            try:
                ref_row = ref_model.objects.select_related(global_name).get(
                    piece_state=self, field_name=field_name
                )
                return getattr(ref_row, global_name)
            except ref_model.DoesNotExist:
                return None
        return None

    def _evaluate_compute(self, node: dict) -> float | None:
        """Recursively evaluate a numeric computation AST."""
        if "constant" in node:
            val = node["constant"]
            return float(val) if isinstance(val, (int, float)) else None

        if "field" in node:
            ref = node["field"]
            return_type = node.get("return_type")
            if return_type not in {"number", "integer"}:
                return None

            state_id, field_name = ref.split(".", 1)
            # Find the state in history.
            if state_id == self.state:
                val = self.resolve_custom_field(field_name)
            else:
                ancestor = (
                    self.piece.states.filter(state=state_id)
                    .order_by("-created")
                    .first()
                )
                if not ancestor:
                    return None
                val = ancestor.resolve_custom_field(field_name)

            try:
                return float(val) if val is not None else None
            except (ValueError, TypeError):
                return None

        if "op" in node:
            op = node["op"]
            # Current ops are all numeric.
            if op not in {"sum", "product", "difference", "ratio"}:
                return None

            args = [self._evaluate_compute(arg) for arg in node.get("args", [])]
            if any(arg is None for arg in args):
                return None

            # Narrow types for mypy; the check above ensures all args are floats.
            valid_args: list[float] = [a for a in args if a is not None]

            if op == "sum":
                return sum(valid_args)
            if op == "product":
                result = 1.0
                for arg in valid_args:
                    result *= arg
                return result
            if op == "difference":
                return valid_args[0] - valid_args[1]
            if op == "ratio":
                if valid_args[1] == 0:
                    return None
                return valid_args[0] / valid_args[1]

        return None


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


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    openid_subject = models.CharField(max_length=255, blank=True, default="")
    profile_image_url = models.URLField(blank=True, default="")

    def __str__(self) -> str:
        return f"Profile({self.user})"


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
