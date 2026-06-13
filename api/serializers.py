"""
Serializers for the Glaze API.

At a glance this file can look like mechanical field declarations, but each
serializer encodes real decisions about what the API contract is. The non-obvious
choices worth knowing about:

**What belongs here (not in views or models)**

- *Field inclusion/exclusion* — which model fields are exposed, renamed, or
  omitted in a given response. ``PieceSummarySerializer`` deliberately omits the
  full state history; ``PieceDetailSerializer`` adds it.
- *Shape transformations* — nesting, flattening, and renaming. ``PieceSummarySerializer``
  exposes ``current_state`` as a nested ``{state}`` object (not a bare string) so
  the frontend type is consistent between list and detail views.
- *Write validation* — ``PieceStateCreateSerializer.validate_state`` enforces the
  workflow transition graph. This is business logic that must live here rather
  than in the model (which has no request context) or the view (which should stay thin).
- *Computed / synthesised fields* — ``PieceStateSerializer`` computes
  ``previous_state`` and ``next_state`` by querying sibling states; the model has
  no stored fields for these. ``PieceSummarySerializer`` surfaces ``last_modified``
  as a property that merges piece-level and state-level timestamps.
- *Write side-effects scoped to a request* — ``PieceCreateSerializer.create``
  initialises the first ``PieceState`` in a single transaction; the model's
  ``save()`` cannot do this because it has no knowledge of the initial notes or
  the workflow entry state.
- *State-ref auto-population* — ``PieceStateCreateSerializer.create`` carries
  forward values from ancestor states for ``$ref`` fields declared in
  ``workflow.yml``. This is request-time logic (needs the piece's history) and
  belongs here rather than in the model.

**What does NOT belong here**

- Query filtering or permission checks — those live in views.
- Business rules that can be enforced at the DB level — use model constraints or
  ``Model.save()`` overrides instead.
- Serialization of wire dates — all ``DateTimeField`` instances are handled
  automatically by DRF; the ``Wire<T>`` mapping is a frontend concern only.
"""

from typing import Any

from django.apps import apps
from django.db.models import DateTimeField, OuterRef, Subquery
from django.db.models.functions import Coalesce, Greatest
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from rest_framework import serializers

from backend.otel import traced_class

from .models import (
    AsyncTask,
    CropRun,
    FiringTemperature,
    GlazeCombination,
    GlobalModel,
    Piece,
    PieceState,
    models,
)
from .preferences import (
    SavedUserPreferencesSerializer,
)
from .serializer_registry import _GLOBAL_ENTRY_SERIALIZERS, global_entry_serializer
from .utils import (
    captioned_image_to_dict,
    get_or_create_location,
    image_to_dict,
    normalize_image_payload,
    replace_piece_state_images,
)
from .workflow import (
    _STATE_MAP,
    ENTRY_STATE,
    SUCCESSORS,
    TERMINAL_STATES,
    VALID_STATES,
    get_global_config,
    get_global_ref_fields_for_state,
    get_state_ref_fields,
)

GLAZE_NORMALIZER_EXTENSION = "x-glaze-normalizer"
GLAZE_RELATION_EXTENSION = "x-glaze-relation"

# Sentinel: distinguishes "annotation present but NULL" from "annotation absent".
# Used in get_thumbnail so we never fall back to get_thumbnail_crop() when the
# thumbnail_crop annotation was evaluated by the DB (even if it returned NULL).
_NOT_ANNOTATED = object()


def _schema_ref(component_name: str, **extensions: Any) -> dict[str, Any]:
    return {
        "allOf": [{"$ref": f"#/components/schemas/{component_name}"}],
        **extensions,
    }


def _schema_array_ref(component_name: str, **extensions: Any) -> dict[str, Any]:
    return {
        "type": "array",
        "items": {"$ref": f"#/components/schemas/{component_name}"},
        **extensions,
    }


def _state_enum_schema(**extensions: Any) -> dict[str, Any]:
    return _schema_ref("StateEnum", **extensions)


def _relation_schema(component_name: str, *, shape: str) -> dict[str, Any]:
    return _schema_ref(
        component_name,
        **{GLAZE_RELATION_EXTENSION: {"component": component_name, "shape": shape}},
    )


def _relation_array_schema(component_name: str, *, shape: str) -> dict[str, Any]:
    return _schema_array_ref(
        component_name,
        **{
            GLAZE_RELATION_EXTENSION: {
                "component": component_name,
                "shape": shape,
                "many": True,
            }
        },
    )


def _state_summary_relation_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"state": _state_enum_schema()},
        "required": ["state"],
        GLAZE_RELATION_EXTENSION: {
            "component": "StateSummary",
            "shape": "summary",
        },
    }


def _serialize_tags(model: models.Model, junction_name: str) -> list[dict[str, str]]:
    tag_links = getattr(model, "_prefetched_objects_cache", {}).get("tag_links")
    if tag_links is None:
        tag_links = (
            apps.get_model("api", junction_name)
            .objects.select_related("tag")
            .filter(piece=model)
            .order_by("order", "pk")
        )
    return [
        {"id": str(link.tag_id), "name": link.tag.name, "color": link.tag.color or ""}
        for link in tag_links
    ]


def add_tags(model_cls: type[models.Model]):
    def decorator(serializer_cls: type[serializers.Serializer]):
        cls_any: Any = serializer_cls
        cls_any.Meta.fields.append("tags")
        cls_any._declared_fields["tags"] = serializers.SerializerMethodField()

        # _register_globals() has already populated _GLOBAL_ENTRY_SERIALIZERS with
        # the auto-generated Tag serializer by the time this decorator runs.
        tag_model = apps.get_model("api", "Tag")
        tag_entry_cls = _GLOBAL_ENTRY_SERIALIZERS.get(tag_model, serializers.Serializer)

        @extend_schema_field(tag_entry_cls(many=True))
        def get_tags(self, obj: models.Model):
            return _serialize_tags(obj, f"{model_cls._meta.model_name}tag")

        cls_any.get_tags = get_tags
        return serializer_cls

    return decorator


class GlobalImageSerializer(serializers.Serializer):
    """Structured image value for ``type: image`` fields on global models."""

    url = serializers.CharField()
    r2_key = serializers.CharField(read_only=True, allow_null=True, default=None)


class GlazeTypeRefSerializer(serializers.Serializer):
    """Minimal glaze type representation embedded in GlazeCombinationEntrySerializer."""

    id = serializers.UUIDField()
    name = serializers.CharField()


class FiringTemperatureRefSerializer(serializers.ModelSerializer):
    """Minimal firing temperature representation embedded in GlazeCombinationEntrySerializer."""

    id = serializers.UUIDField()

    class Meta:
        model = FiringTemperature
        fields = ["id", "name", "cone", "temperature_c", "atmosphere"]


@traced_class
@global_entry_serializer(GlazeCombination)
class GlazeCombinationEntrySerializer(serializers.ModelSerializer):
    """Richer list entry for GlazeCombination: includes properties, glaze types, and favorite flag.

    Requires ``favorite_ids`` (a ``set`` of PKs) in serializer context.
    """

    id = serializers.SerializerMethodField()
    is_public = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    glaze_types = serializers.SerializerMethodField()
    firing_temperature = FiringTemperatureRefSerializer(read_only=True, allow_null=True)
    test_tile_image = serializers.SerializerMethodField()

    class Meta:
        model = GlazeCombination
        fields = [
            "id",
            "name",
            "test_tile_image",
            "is_food_safe",
            "runs",
            "highlights_grooves",
            "is_different_on_white_and_brown_clay",
            "firing_temperature",
            "is_public",
            "is_favorite",
            "glaze_types",
        ]

    @classmethod
    def prepare_global_entry_queryset(cls, qs, display_field):
        return (
            qs.select_related("firing_temperature", "test_tile_image")
            .prefetch_related("layers__glaze_type")
            .order_by(display_field)
        )

    @extend_schema_field(serializers.CharField())
    def get_id(self, obj: GlazeCombination) -> str:
        return str(obj.pk)

    @extend_schema_field(serializers.BooleanField())
    def get_is_public(self, obj: GlazeCombination) -> bool:
        return obj.user_id is None

    @extend_schema_field(serializers.BooleanField())
    def get_is_favorite(self, obj: GlazeCombination) -> bool:
        return obj.pk in self.context.get("favorite_ids", set())

    @extend_schema_field(GlobalImageSerializer(allow_null=True))
    def get_test_tile_image(self, obj: GlazeCombination) -> dict | None:
        return image_to_dict(obj.test_tile_image)

    @extend_schema_field(GlazeTypeRefSerializer(many=True))
    def get_glaze_types(self, obj: GlazeCombination) -> list:
        return [
            {"id": str(layer.glaze_type_id), "name": layer.glaze_type.name}
            for layer in obj.layers.all()
        ]


@extend_schema_serializer(extensions={GLAZE_NORMALIZER_EXTENSION: "imageCrop"})
class ImageCropSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()
    width = serializers.FloatField()
    height = serializers.FloatField()


class CaptionedImageSerializer(serializers.Serializer):
    url = serializers.CharField()
    caption = serializers.CharField(allow_blank=True, default="")
    created = serializers.DateTimeField(required=False)
    crop = ImageCropSerializer(required=False, allow_null=True, default=None)
    # Public URL of the eagerly cropped derivative. Written by the
    # generate_cropped_image task only — never accepted from clients.
    cropped_url = serializers.CharField(read_only=True, allow_null=True, default=None)
    image_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    # Non-null when the image is stored in R2 and eligible for server-side
    # crop materialization. Clients use this to gate the crop UI and avoid
    # treating externally-hosted images as perpetually pending.
    r2_key = serializers.CharField(read_only=True, allow_null=True, default=None)
    # True when the most recent generate_cropped_image task for this image
    # ended in failure. Clients use this to stop polling and fall back to the
    # original image instead of showing an indefinite spinner.
    crop_task_failed = serializers.BooleanField(read_only=True, default=False)
    width = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=0
    )
    height = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=0
    )


class GlazeCombinationImagePieceSerializer(serializers.Serializer):
    """A single piece entry in a GlazeCombinationImageEntrySerializer response.

    Represents one piece that was glazed with the parent combination. ``state``
    is the most recent qualifying state that contributed images (e.g.
    ``'glaze_fired'``). ``images`` aggregates all images recorded across every
    qualifying state for that piece.
    """

    id = serializers.CharField()
    name = serializers.CharField()
    state = serializers.ChoiceField(choices=sorted(VALID_STATES))
    images = CaptionedImageSerializer(many=True)


class GlazeCombinationImageEntrySerializer(serializers.Serializer):
    """Response shape for GET /api/analysis/glaze-combination-images/.

    Each entry groups a glaze combination with the pieces that used it and
    have images in at least one qualifying state.
    """

    glaze_combination = GlazeCombinationEntrySerializer()
    pieces = GlazeCombinationImagePieceSerializer(many=True)


@traced_class
class PieceStateSerializer(serializers.ModelSerializer):
    state = serializers.ChoiceField(choices=sorted(VALID_STATES))
    previous_state = serializers.SerializerMethodField()
    next_state = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    custom_fields = serializers.SerializerMethodField()
    created = serializers.DateTimeField(read_only=True)
    has_been_edited = serializers.BooleanField(read_only=True)

    class Meta:
        model = PieceState
        fields = [
            "id",
            "state",
            "notes",
            "created",
            "last_modified",
            "images",
            "custom_fields",
            "previous_state",
            "next_state",
            "has_been_edited",
        ]
        extra_kwargs = {
            "notes": {"required": True},
        }

    @extend_schema_field(serializers.DictField())
    def get_custom_fields(self, obj: PieceState) -> dict:
        """Merge inline JSON blob with global-ref junction table lookups.

        Follows state-ref markers to resolve live values from ancestors.
        Global ref fields are returned as {id, name} objects; inline fields
        are returned as their raw JSON values.
        """
        result = {}
        fields = _STATE_MAP.get(obj.state, {}).get("fields", {})
        for field_name in fields:
            val = obj.resolve_custom_field(field_name)
            if val is None:
                continue
            if isinstance(val, GlobalModel):
                result[field_name] = {"id": str(val.pk), "name": val.name}
            else:
                result[field_name] = val
        return result

    def _piece_for_state(self, obj: PieceState):
        """Return the parent Piece, preferring the context copy to avoid a FK query."""
        return self.context.get("piece") or obj.piece

    @extend_schema_field(_state_enum_schema(nullable=True))
    def get_previous_state(self, obj: PieceState) -> str | None:
        piece = self._piece_for_state(obj)
        prefetched_states = piece._prefetched_states()
        if prefetched_states is not None:
            for index, state in enumerate(prefetched_states):
                if state.pk == obj.pk:
                    prev = prefetched_states[index - 1] if index > 0 else None
                    return prev.state if prev else None
            return None

        if obj.order is not None:
            prev = piece.states.filter(order__lt=obj.order).order_by("-order").first()
        else:
            prev = (
                piece.states.filter(created__lt=obj.created)
                .order_by("-created")
                .first()
            )
        return prev.state if prev else None

    @extend_schema_field(_state_enum_schema(nullable=True))
    def get_next_state(self, obj: PieceState) -> str | None:
        piece = self._piece_for_state(obj)
        prefetched_states = piece._prefetched_states()
        if prefetched_states is not None:
            for index, state in enumerate(prefetched_states):
                if state.pk == obj.pk:
                    nxt = (
                        prefetched_states[index + 1]
                        if index < len(prefetched_states) - 1
                        else None
                    )
                    return nxt.state if nxt else None
            return None

        if obj.order is not None:
            nxt = piece.states.filter(order__gt=obj.order).order_by("order").first()
        else:
            nxt = (
                piece.states.filter(created__gt=obj.created).order_by("created").first()
            )
        return nxt.state if nxt else None

    def to_representation(self, instance: PieceState) -> dict:
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request is not None and not (
            request.user.is_authenticated
            and self._piece_for_state(instance).user_id == request.user.id
        ):
            data["notes"] = ""
        return data

    @extend_schema_field(CaptionedImageSerializer(many=True))
    def get_images(self, obj: PieceState) -> list[dict]:
        links = getattr(obj, "_prefetched_objects_cache", {}).get("image_links")
        if links is None:
            links = obj.image_links.select_related("image", "cropped_image").order_by(
                "order", "pk"
            )
        return [captioned_image_to_dict(link) for link in links]


class StateSummarySerializer(serializers.Serializer):
    """Minimal state representation embedded in PieceSummary list responses."""

    state = serializers.ChoiceField(choices=sorted(VALID_STATES))


class ThumbnailSerializer(serializers.Serializer):
    url = serializers.CharField()
    crop = ImageCropSerializer(required=False, allow_null=True, default=None)
    cropped_url = serializers.CharField(required=False, allow_null=True, default=None)
    crop_task_failed = serializers.BooleanField(default=False)
    r2_key = serializers.CharField(read_only=True, allow_null=True, default=None)
    image_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    width = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=0
    )
    height = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=0
    )


@traced_class
@add_tags(Piece)
@global_entry_serializer(Piece)
class PieceSummarySerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()
    current_location = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    photo_count = serializers.SerializerMethodField()
    shared = serializers.BooleanField(read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    showcase_fields = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
    )
    last_modified = serializers.SerializerMethodField()

    class Meta:
        model = Piece
        fields = [
            "id",
            "name",
            "created",
            "last_modified",
            "thumbnail",
            "photo_count",
            "shared",
            "is_editable",
            "showcase_story",
            "showcase_fields",
            "can_edit",
            "current_state",
            "current_location",
        ]

    @classmethod
    def prepare_global_entry_queryset(cls, qs, display_field):
        latest_state_lm = Subquery(
            PieceState.objects.filter(piece=OuterRef("pk"))
            .order_by("-last_modified")
            .values("last_modified")[:1],
            output_field=DateTimeField(),
        )
        return (
            qs.select_related("current_location", "thumbnail", "user__profile")
            .annotate(
                computed_last_modified=Greatest(
                    "fields_last_modified",
                    Coalesce(latest_state_lm, "fields_last_modified"),
                )
            )
            .prefetch_related(
                "states__image_links__image",
                "states__image_links__cropped_image",
                "tag_links__tag",
            )
            .order_by(display_field)
        )

    @extend_schema_field(serializers.DateTimeField())
    def get_last_modified(self, obj: Piece):
        clm = getattr(obj, "computed_last_modified", None)
        if clm is not None:
            return clm
        return obj.last_modified

    @extend_schema_field(_state_summary_relation_schema())
    def get_current_state(self, obj: Piece) -> dict:
        name = getattr(obj, "current_state_name", None)
        if name is not None:
            return {"state": name}
        cs = obj.current_state
        assert cs is not None, f"Piece {obj.id} has no states"
        return {"state": cs.state}

    @extend_schema_field(serializers.CharField(allow_null=True, required=False))
    def get_current_location(self, obj: Piece) -> str | None:
        return obj.current_location.name if obj.current_location else None

    @extend_schema_field(serializers.BooleanField())
    def get_can_edit(self, obj: Piece) -> bool:
        request = self.context.get("request")
        return bool(
            request and request.user.is_authenticated and obj.user_id == request.user.id
        )

    @extend_schema_field(ThumbnailSerializer(allow_null=True))
    def get_thumbnail(self, obj: Piece) -> dict | None:
        from .utils import _is_crop_task_failed

        thumbnail = image_to_dict(obj.thumbnail)
        if thumbnail is None:
            return None
        crop = getattr(obj, "thumbnail_crop", _NOT_ANNOTATED)
        if crop is _NOT_ANNOTATED:
            crop = obj.get_thumbnail_crop()
        cropped_url = getattr(obj, "thumbnail_cropped_url", _NOT_ANNOTATED)
        if cropped_url is _NOT_ANNOTATED:
            cropped_url = obj.get_thumbnail_cropped_url()
        r2_key = thumbnail.get("r2_key")
        crop_task_failed = (
            _is_crop_task_failed(obj.thumbnail_id, r2_key)
            if crop and not cropped_url
            else False
        )
        return {
            **thumbnail,
            "crop": crop,
            "cropped_url": cropped_url,
            "crop_task_failed": crop_task_failed,
        }

    @extend_schema_field(serializers.IntegerField(min_value=0))
    def get_photo_count(self, obj: Piece) -> int:
        photo_count = getattr(obj, "photo_count", None)
        if photo_count is not None:
            return int(photo_count)

        exclude_history = self.context.get("exclude_history")
        if exclude_history is None:
            request = self.context.get("request")
            if request is not None:
                query_params = getattr(
                    request, "query_params", getattr(request, "GET", {})
                )
                exclude_history = (
                    query_params.get("exclude_history", "false").lower() == "true"
                )
            else:
                exclude_history = False

        if exclude_history:
            from .models import PieceStateImage

            return PieceStateImage.objects.filter(piece_state__piece=obj).count()

        states = getattr(obj, "_prefetched_objects_cache", {}).get("states")
        if states is None:
            states = obj.states.all()

        total = 0
        for state in states:
            links = getattr(state, "_prefetched_objects_cache", {}).get("image_links")
            if links is None:
                links = state.image_links.all()
            total += len(links)
        return total


@traced_class
class PieceDetailSerializer(PieceSummarySerializer):
    current_state = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    showcase_video_url = serializers.SerializerMethodField()
    owner_alias = serializers.SerializerMethodField()

    class Meta(PieceSummarySerializer.Meta):
        fields = PieceSummarySerializer.Meta.fields + [
            "history",
            "showcase_video_url",
            "owner_alias",
        ]

    def _get_all_states_data(self, obj: Piece) -> list:
        """Serialize all piece states exactly once; cache per piece pk.

        Keying by pk is necessary when this serializer is used with many=True
        (e.g. data export), where DRF reuses the same child serializer instance
        across multiple pieces.
        """
        if not hasattr(self, "_states_data_cache"):
            self._states_data_cache: dict[object, list] = {}
        if obj.pk not in self._states_data_cache:
            self._states_data_cache[obj.pk] = list(
                PieceStateSerializer(
                    obj.states.all(),
                    many=True,
                    context={**self.context, "piece": obj},
                ).data
            )
        return self._states_data_cache[obj.pk]

    @extend_schema_field(serializers.DateTimeField())
    def get_last_modified(self, obj: Piece):
        # Always use the Python property: single-object responses (detail, PATCH,
        # POST) must not use the computed_last_modified annotation which can be
        # absent or stale after a mutation.
        return obj.last_modified

    @extend_schema_field(_relation_schema("PieceState", shape="detail"))
    def get_current_state(self, obj: Piece) -> dict:
        cs = obj.current_state
        assert cs is not None, f"Piece {obj.id} has no states"
        exclude_history = self.context.get("exclude_history")
        if exclude_history is None:
            request = self.context.get("request")
            if request is not None:
                query_params = getattr(
                    request, "query_params", getattr(request, "GET", {})
                )
                exclude_history = (
                    query_params.get("exclude_history", "false").lower() == "true"
                )
            else:
                exclude_history = False

        if exclude_history:
            return PieceStateSerializer(cs, context={**self.context, "piece": obj}).data
        return next(s for s in self._get_all_states_data(obj) if s["id"] == str(cs.pk))

    @extend_schema_field(_relation_array_schema("PieceState", shape="history"))
    def get_history(self, obj: Piece) -> list:
        exclude_history = self.context.get("exclude_history")
        if exclude_history is None:
            request = self.context.get("request")
            if request is not None:
                query_params = getattr(
                    request, "query_params", getattr(request, "GET", {})
                )
                exclude_history = (
                    query_params.get("exclude_history", "false").lower() == "true"
                )
            else:
                exclude_history = False

        if exclude_history:
            return []
        return self._get_all_states_data(obj)

    @extend_schema_field(serializers.CharField(allow_null=True, required=False))
    def get_showcase_video_url(self, obj: Piece) -> str | None:
        if not (obj.shared and not obj.is_editable):
            return None
        from .piece.showcase_views import SHOWCASE_VIDEO_TASK_TYPE

        # Use the latest succeeded task so an in-progress retry does not hide
        # an existing artifact while it runs (or if it fails).
        # Staleness detection is intentionally omitted here — rebuilding the full
        # storyboard on every piece-detail GET is O(states × images) CPU overhead.
        # The dedicated GET /api/pieces/{id}/showcase-video/ endpoint owns that logic.
        task = (
            AsyncTask.objects.filter(
                user=obj.user,
                task_type=SHOWCASE_VIDEO_TASK_TYPE,
                input_params__piece_id=str(obj.id),
                status=AsyncTask.Status.SUCCESS,
            )
            .order_by("-created")
            .first()
        )
        if task is None:
            return None
        result = task.result if isinstance(task.result, dict) else {}
        return result.get("artifact_url")

    @extend_schema_field(serializers.CharField(allow_null=True, required=False))
    def get_owner_alias(self, obj: Piece) -> str | None:
        try:
            return obj.user.profile.alias or None
        except Exception:
            return None


@traced_class
class PieceCreateSerializer(serializers.ModelSerializer):
    notes = serializers.CharField(
        required=False,
        default="",
        allow_blank=True,
        max_length=300,
        trim_whitespace=False,
    )
    current_location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    # Accept a bare URL string from the curated SVG gallery; wrap it into the
    # Image row that Piece.thumbnail now stores.
    thumbnail = serializers.CharField(required=False, allow_blank=True, default=None)

    class Meta:
        model = Piece
        fields = ["name", "thumbnail", "notes", "current_location"]

    def create(self, validated_data: dict) -> Piece:
        user = self.context["request"].user
        notes = validated_data.pop("notes", "")
        location_name = validated_data.pop("current_location", None)
        location_obj = get_or_create_location(user, location_name)
        raw_thumbnail = validated_data.pop("thumbnail", None)
        thumbnail = normalize_image_payload(raw_thumbnail, user=user)
        piece = Piece.objects.create(
            user=user,
            thumbnail=thumbnail,
            **validated_data,
            current_location=location_obj,
        )
        PieceState.objects.create(
            user=user, piece=piece, state=ENTRY_STATE, notes=notes, order=1
        )

        return piece


@traced_class
class PieceStateCreateSerializer(serializers.ModelSerializer):
    state = serializers.ChoiceField(choices=sorted(VALID_STATES))
    notes = serializers.CharField(
        required=False, allow_blank=True, trim_whitespace=False
    )
    images = CaptionedImageSerializer(many=True, required=False, default=list)
    custom_fields = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = PieceState
        fields = ["state", "notes", "images", "custom_fields"]

    def validate_custom_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a JSON object.")
        return value

    def validate_state(self, value: str) -> str:
        piece: Piece = self.context["piece"]
        if piece.is_editable:
            raise serializers.ValidationError(
                "Cannot add states while piece is in editable mode. Seal the piece first."
            )
        current = piece.current_state
        if current is not None:
            valid_next = SUCCESSORS.get(current.state, [])
            if value not in valid_next:
                raise serializers.ValidationError(
                    f"Cannot transition from '{current.state}' to '{value}'. "
                    f"Valid next states: {valid_next}"
                )
        return value

    def create(self, validated_data: dict) -> PieceState:
        from django.db.models import F, Max

        from .workflow import can_reach

        images = validated_data.pop("images", [])

        new_state_id: str = validated_data["state"]
        piece: Piece = self.context["piece"]
        incoming: dict = dict(validated_data.pop("custom_fields", {}))
        inline_fields, global_ref_fields, global_ref_pks, clear_global_ref_fields = (
            _resolve_custom_field_payload(piece, new_state_id, incoming)
        )

        validated_data["custom_fields"] = inline_fields

        if piece.is_editable:
            existing = list(piece.states.values("state", "order"))
            pred_orders = [
                ps["order"]
                for ps in existing
                if ps["state"] != new_state_id and can_reach(ps["state"], new_state_id)
            ]
            succ_orders = [
                ps["order"]
                for ps in existing
                if ps["state"] != new_state_id and can_reach(new_state_id, ps["state"])
            ]
            pred_orders_valid = [o for o in pred_orders if o is not None]
            succ_orders_valid = [o for o in succ_orders if o is not None]
            if pred_orders_valid:
                insert_after = max(pred_orders_valid)
            elif succ_orders_valid:
                insert_after = min(succ_orders_valid) - 1
            else:
                insert_after = piece.states.aggregate(Max("order"))["order__max"] or 0
            new_order = insert_after + 1
            piece.states.filter(order__gte=new_order).update(order=F("order") + 1)
            validated_data["order"] = new_order
            validated_data["has_been_edited"] = True
        else:
            validated_data["order"] = (
                piece.states.aggregate(Max("order"))["order__max"] or 0
            ) + 1

        try:
            piece_state = PieceState.objects.create(
                user=piece.user,
                piece=piece,
                **validated_data,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"custom_fields": str(exc)}) from exc

        # Write junction rows for global ref fields.
        _write_global_ref_rows(
            piece_state, global_ref_fields, global_ref_pks, clear_global_ref_fields
        )
        replace_piece_state_images(piece_state, images, user=piece.user)
        return piece_state


def _resolve_custom_field_payload(
    piece: Piece,
    state_id: str,
    incoming: dict,
    *,
    clear_empty_refs: bool = False,
) -> tuple[dict, dict[str, str], dict[str, str], set[str]]:
    """Split inline JSON fields from global refs and copy state-ref markers."""
    global_ref_fields = get_global_ref_fields_for_state(state_id)
    inline_fields: dict = {}
    global_ref_pks: dict[str, str] = {}
    clear_global_ref_fields: set[str] = set()

    for field_name, value in incoming.items():
        if field_name in global_ref_fields:
            if value in (None, ""):
                if clear_empty_refs:
                    clear_global_ref_fields.add(field_name)
                continue
            global_ref_pks[field_name] = str(value)
        else:
            inline_fields[field_name] = value

    state_refs = get_state_ref_fields(state_id)
    for field_name, (source_state_id, source_field_name) in state_refs.items():
        # Force marker for ALL state-refs, ignoring client input for those fields.
        inline_fields[field_name] = f"[{source_state_id}.{source_field_name}]"

        # Ensure state-refs are not written to junction tables even if they
        # resolve to global refs. They will be resolved lazily instead.
        if field_name in global_ref_pks:
            del global_ref_pks[field_name]
        if field_name in clear_global_ref_fields:
            clear_global_ref_fields.remove(field_name)

    return inline_fields, global_ref_fields, global_ref_pks, clear_global_ref_fields


def _write_global_ref_rows(
    piece_state: PieceState,
    global_ref_fields: dict[str, str],
    global_ref_pks: dict[str, str],
    clear_fields: set[str] | None = None,
) -> None:
    """Create or update junction table rows for global ref fields.

    ``global_ref_pks`` maps field_name → PK string supplied by the client.
    Raises ``serializers.ValidationError`` if a supplied PK does not exist.
    """
    clear_fields = clear_fields or set()
    for field_name in clear_fields:
        global_name = global_ref_fields[field_name]
        config = get_global_config(global_name)
        ref_model_cls = apps.get_model("api", f"PieceState{config['model']}Ref")
        ref_model_cls.objects.filter(
            piece_state=piece_state, field_name=field_name
        ).delete()

    for field_name, pk_str in global_ref_pks.items():
        global_name = global_ref_fields[field_name]
        config = get_global_config(global_name)
        model_cls = apps.get_model("api", config["model"])
        ref_model_cls = apps.get_model("api", f"PieceState{config['model']}Ref")
        try:
            global_obj = model_cls.objects.get(pk=pk_str)
        except (model_cls.DoesNotExist, ValueError):
            raise serializers.ValidationError(
                {f"custom_fields.{field_name}": f"Invalid {global_name} id: {pk_str!r}"}
            )
        ref_model_cls.objects.update_or_create(
            piece_state=piece_state,
            field_name=field_name,
            defaults={global_name: global_obj},
        )


@traced_class
class PieceStateUpdateSerializer(serializers.Serializer):
    """Partial update of the current PieceState's editable fields."""

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    images = CaptionedImageSerializer(many=True, required=False)
    custom_fields = serializers.JSONField(required=False)
    created = serializers.DateTimeField(required=False)

    def validate_custom_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a JSON object.")
        return value

    def validate(self, data: dict) -> dict:
        instance: PieceState | None = self.instance
        if instance and "images" in data:
            piece = instance.piece
            if piece.thumbnail:
                # Get the URLs of the new images
                new_image_urls = {img.get("url") for img in data["images"]}

                # Check if the current thumbnail was in the old images and is NOT in the new images
                old_images = instance.images
                old_image_urls = {img["url"] for img in old_images}

                if (
                    piece.thumbnail.url in old_image_urls
                    and piece.thumbnail.url not in new_image_urls
                ):
                    raise serializers.ValidationError(
                        {
                            "images": "Cannot delete the image currently used as the piece thumbnail."
                        }
                    )
        return data

    def update(self, instance: PieceState, validated_data: dict) -> PieceState:
        if "notes" in validated_data:
            instance.notes = validated_data["notes"]
        if "created" in validated_data:
            instance.created = validated_data["created"]
        if "images" in validated_data:
            replace_piece_state_images(
                instance, validated_data["images"], user=instance.piece.user
            )
        if "custom_fields" in validated_data:
            incoming: dict = dict(validated_data["custom_fields"])
            (
                inline_fields,
                global_ref_fields,
                global_ref_pks,
                clear_global_ref_fields,
            ) = _resolve_custom_field_payload(
                instance.piece,
                instance.state,
                incoming,
                clear_empty_refs=True,
            )

            instance.custom_fields = inline_fields
            try:
                instance.save()
            except ValueError as exc:
                raise serializers.ValidationError({"custom_fields": str(exc)}) from exc
            _write_global_ref_rows(
                instance, global_ref_fields, global_ref_pks, clear_global_ref_fields
            )
        else:
            try:
                instance.save()
            except ValueError as exc:
                raise serializers.ValidationError({"custom_fields": str(exc)}) from exc
        return instance


@traced_class
class PieceUpdateSerializer(serializers.Serializer):
    """Partial update of Piece fields."""

    name = serializers.CharField(required=False, max_length=255)
    current_location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    thumbnail = ThumbnailSerializer(required=False, allow_null=True)
    shared = serializers.BooleanField(required=False)
    is_editable = serializers.BooleanField(required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)
    showcase_story = serializers.CharField(required=False, allow_blank=True)
    showcase_fields = serializers.JSONField(required=False)

    def validate_shared(self, value: bool) -> bool:
        if not value:
            return value
        instance: Piece | None = self.context.get("piece")
        current = instance.current_state if instance is not None else None
        if current is None or current.state not in TERMINAL_STATES:
            raise serializers.ValidationError("Only terminal pieces can be shared.")
        return value

    def validate(self, data: dict) -> dict:
        piece: Piece | None = self.context.get("piece")
        would_be_editable = data.get(
            "is_editable", piece.is_editable if piece else False
        )
        would_be_shared = data.get("shared", piece.shared if piece else False)
        if would_be_editable and would_be_shared:
            raise serializers.ValidationError(
                "A piece cannot be shared while in editable mode. "
                "Seal the piece before sharing, or unshare before editing."
            )
        return data

    def validate_showcase_fields(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a JSON array.")
        return value

    def update(self, instance: Piece, validated_data: dict) -> Piece:
        user = self.context["request"].user
        if "name" in validated_data:
            instance.name = validated_data["name"]
        if "current_location" in validated_data:
            instance.current_location = get_or_create_location(
                user, validated_data["current_location"]
            )
        if "thumbnail" in validated_data:
            thumbnail_payload = validated_data["thumbnail"]
            instance.thumbnail = normalize_image_payload(
                thumbnail_payload, user=instance.user
            )

        if "shared" in validated_data:
            instance.shared = validated_data["shared"]
        if "is_editable" in validated_data:
            instance.is_editable = validated_data["is_editable"]
        if "showcase_story" in validated_data:
            instance.showcase_story = validated_data["showcase_story"]
        if "showcase_fields" in validated_data:
            instance.showcase_fields = validated_data["showcase_fields"]
        instance.save()
        if "tags" in validated_data:
            tag_ids = [str(tag_id) for tag_id in validated_data["tags"]]
            _replace_piece_tags(instance, user, tag_ids)
        return instance


def _replace_piece_tags(piece: Piece, user, tag_ids: list[str]) -> None:
    tag_model = apps.get_model("api", "Tag")
    piece_tag_model = apps.get_model("api", "PieceTag")
    try:
        tags = list(
            tag_model.objects.filter(user=user, pk__in=tag_ids).order_by("name")
        )
    except (TypeError, ValueError) as exc:
        raise serializers.ValidationError(
            {"tags": [f"Invalid tag id: {tag_ids[0]!r}"]}
        ) from exc
    tags_by_id = {str(tag.pk): tag for tag in tags}
    missing = [tag_id for tag_id in tag_ids if tag_id not in tags_by_id]
    if missing:
        raise serializers.ValidationError({"tags": [f"Invalid tag id: {missing[0]!r}"]})

    piece_tag_model.objects.filter(piece=piece).delete()
    for order, tag_id in enumerate(tag_ids):
        piece_tag_model.objects.create(piece=piece, tag=tags_by_id[tag_id], order=order)


class AuthUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    is_staff = serializers.BooleanField(read_only=True)
    openid_subject = serializers.SerializerMethodField()
    alias = serializers.SerializerMethodField()
    preferences = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_openid_subject(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.openid_subject if profile else ""

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_alias(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.alias if profile else ""

    @extend_schema_field(SavedUserPreferencesSerializer())
    def get_preferences(self, obj) -> dict:
        profile = getattr(obj, "profile", None)
        preferences = getattr(profile, "preferences", None) if profile else None
        return preferences if isinstance(preferences, dict) else {}


class GoogleAuthSerializer(serializers.Serializer):
    code = serializers.CharField()
    redirect_uri = serializers.CharField()
    invite_code = serializers.CharField(required=False, allow_blank=True, default="")


class AsyncTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsyncTask
        fields = [
            "id",
            "status",
            "task_type",
            "input_params",
            "result",
            "error",
            "progress",
            "created",
            "last_modified",
        ]


class CropRunSourceSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["automated", "human"])
    backend = serializers.CharField(allow_null=True)
    deployment = serializers.CharField(allow_null=True)
    version = serializers.CharField(allow_null=True)


class CropRunSerializer(serializers.ModelSerializer):
    image_id = serializers.UUIDField(read_only=True)
    piece_state_image_id = serializers.IntegerField(read_only=True, allow_null=True)
    source: Any = serializers.SerializerMethodField()
    crop: Any = serializers.SerializerMethodField()

    @extend_schema_field(CropRunSourceSerializer)
    def get_source(self, obj: CropRun) -> dict:
        return obj.source

    @extend_schema_field(ImageCropSerializer(allow_null=True))
    def get_crop(self, obj: CropRun) -> dict | None:
        return obj.crop

    class Meta:
        model = CropRun
        fields = [
            "id",
            "image_id",
            "piece_state_image_id",
            "source",
            "crop",
            "status",
            "created",
        ]
        read_only_fields = [
            "id",
            "image_id",
            "piece_state_image_id",
            "source",
            "crop",
            "status",
            "created",
        ]


class CropRunCreateSerializer(serializers.ModelSerializer):
    piece_state_image_id = serializers.IntegerField(write_only=True)
    crop = serializers.JSONField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_crop(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Crop must be an object.")
        cleaned = {}
        for field in ("x", "y", "width", "height"):
            try:
                cleaned[field] = float(value[field])
            except (KeyError, TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    f"Crop requires numeric {field}."
                ) from exc
            if not 0 <= cleaned[field] <= 1:
                raise serializers.ValidationError(
                    f"Crop {field} must be between 0 and 1."
                )
        if cleaned["width"] <= 0 or cleaned["height"] <= 0:
            raise serializers.ValidationError(
                "Crop width and height must be greater than 0."
            )
        return cleaned

    def create(self, validated_data):
        validated_data.pop("piece_state_image_id", None)
        piece_state_image = validated_data.pop("piece_state_image")
        image = piece_state_image.image
        submitter = validated_data.pop("submitter")
        source = validated_data.pop("source")
        status = validated_data.pop("status")
        return CropRun.objects.create(
            image=image,
            piece_state_image=piece_state_image,
            submitter=submitter,
            source=source,
            status=status,
            **validated_data,
        )

    class Meta:
        model = CropRun
        fields = ["piece_state_image_id", "crop", "notes"]


class UploadImageSerializer(serializers.Serializer):
    url = serializers.CharField(required=False, allow_null=True, default=None)
    base64 = serializers.CharField(required=False, allow_null=True, default=None)
    caption = serializers.CharField(required=False, default="", allow_blank=True)

    def validate(self, data):
        has_url = bool(data.get("url"))
        has_b64 = bool(data.get("base64"))
        if has_url == has_b64:
            raise serializers.ValidationError(
                "Exactly one of 'url' or 'base64' must be provided."
            )
        return data


class TaskSubmissionSerializer(serializers.Serializer):
    task_type = serializers.CharField(max_length=255)
    input_params = serializers.JSONField(required=False, default=dict)
