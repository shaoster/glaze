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
  workflow transition graph; ``RegisterSerializer`` enforces password length. This
  is business logic that must live here rather than in the model (which has no
  request context) or the view (which should stay thin).
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
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    FiringTemperature,
    GlazeCombination,
    Piece,
    PieceState,
    AsyncTask,
    UserProfile,
    models,
)
from .serializer_registry import _GLOBAL_ENTRY_SERIALIZERS, global_entry_serializer
from .utils import (
    captioned_image_to_dict,
    crop_to_dict,
    get_or_create_location,
    image_to_dict,
    normalize_image_payload,
    replace_piece_state_images,
)
from .workflow import (
    ENTRY_STATE,
    SUCCESSORS,
    TERMINAL_STATES,
    VALID_STATES,
    get_global_config,
    get_global_ref_fields_for_state,
    get_state_ref_fields,
)


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
    cloudinary_public_id = serializers.CharField(allow_null=True, required=False)
    cloud_name = serializers.CharField(allow_null=True, required=False)


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
            for layer in obj.layers.select_related("glaze_type").all()
        ]


class GlazeCombinationImagePieceSerializer(serializers.Serializer):
    """A single piece entry in a GlazeCombinationImageEntrySerializer response.

    Represents one piece that was glazed with the parent combination. ``state``
    is the most recent qualifying state that contributed images (e.g.
    ``'glaze_fired'``). ``images`` aggregates all images recorded across every
    qualifying state for that piece.
    """

    id = serializers.CharField()
    name = serializers.CharField()
    state = serializers.CharField()
    images = serializers.ListField(child=serializers.DictField())


class GlazeCombinationImageEntrySerializer(serializers.Serializer):
    """Response shape for GET /api/analysis/glaze-combination-images/.

    Each entry groups a glaze combination with the pieces that used it and
    have images in at least one qualifying state.
    """

    glaze_combination = GlazeCombinationEntrySerializer()
    pieces = GlazeCombinationImagePieceSerializer(many=True)


class CaptionedImageSerializer(serializers.Serializer):
    url = serializers.CharField()
    caption = serializers.CharField(allow_blank=True, default="")
    created = serializers.DateTimeField(required=False)
    cloudinary_public_id = serializers.CharField(
        allow_blank=True, required=False, default=None, allow_null=True
    )
    cloud_name = serializers.CharField(allow_null=True, required=False, default=None)
    crop = serializers.JSONField(required=False, allow_null=True, default=None)


class PieceStateSerializer(serializers.ModelSerializer):
    previous_state = serializers.SerializerMethodField()
    next_state = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    custom_fields = serializers.SerializerMethodField()

    class Meta:
        model = PieceState
        fields = [
            "state",
            "notes",
            "created",
            "last_modified",
            "images",
            "custom_fields",
            "previous_state",
            "next_state",
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
        from .models import GlobalModel

        result = {}
        # Iterate over all fields defined for this state in the workflow.
        from .workflow import _STATE_MAP

        state_config = _STATE_MAP.get(obj.state, {})
        fields = state_config.get("fields", {})
        for field_name in fields:
            val = obj.resolve_custom_field(field_name)
            if val is None:
                continue

            if isinstance(val, GlobalModel):
                result[field_name] = {"id": str(val.pk), "name": val.name}
            else:
                result[field_name] = val
        return result

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_previous_state(self, obj: PieceState) -> str | None:
        prev = (
            obj.piece.states.filter(created__lt=obj.created)
            .order_by("-created")
            .first()
        )
        return prev.state if prev else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_next_state(self, obj: PieceState) -> str | None:
        nxt = (
            obj.piece.states.filter(created__gt=obj.created).order_by("created").first()
        )
        return nxt.state if nxt else None

    def to_representation(self, instance: PieceState) -> dict:
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request is not None and not (
            request.user.is_authenticated and instance.piece.user_id == request.user.id
        ):
            data["notes"] = ""
        return data

    @extend_schema_field(CaptionedImageSerializer(many=True))
    def get_images(self, obj: PieceState) -> list[dict]:
        links = getattr(obj, "_prefetched_objects_cache", {}).get("image_links")
        if links is None:
            links = obj.image_links.select_related("image").order_by("order", "pk")
        return [captioned_image_to_dict(link) for link in links]


class StateSummarySerializer(serializers.Serializer):
    """Minimal state representation embedded in PieceSummary list responses."""

    state = serializers.CharField()


class ThumbnailSerializer(serializers.Serializer):
    url = serializers.CharField()
    cloudinary_public_id = serializers.CharField(
        allow_blank=True, allow_null=True, default=None
    )
    cloud_name = serializers.CharField(allow_null=True, required=False, default=None)
    crop = serializers.JSONField(required=False, allow_null=True, default=None)


@add_tags(Piece)
@global_entry_serializer(Piece)
class PieceSummarySerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()
    current_location = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    last_modified = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Piece
        fields = [
            "id",
            "name",
            "created",
            "last_modified",
            "thumbnail",
            "shared",
            "showcase_story",
            "showcase_fields",
            "can_edit",
            "current_state",
            "current_location",
        ]

    @classmethod
    def prepare_global_entry_queryset(cls, qs, display_field):
        return (
            qs.select_related("current_location", "thumbnail")
            .prefetch_related("states__image_links__image", "tag_links__tag")
            .order_by(display_field)
        )

    @extend_schema_field(StateSummarySerializer)
    def get_current_state(self, obj: Piece) -> dict:
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
        thumbnail = image_to_dict(obj.thumbnail)
        if thumbnail is None:
            return None
        return {**thumbnail, "crop": obj.thumbnail_crop}


class PieceDetailSerializer(PieceSummarySerializer):
    current_state = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()

    class Meta(PieceSummarySerializer.Meta):
        fields = PieceSummarySerializer.Meta.fields + ["history"]

    @extend_schema_field(PieceStateSerializer)
    def get_current_state(self, obj: Piece) -> dict:
        cs = obj.current_state
        assert cs is not None, f"Piece {obj.id} has no states"
        return PieceStateSerializer(cs, context=self.context).data

    @extend_schema_field(PieceStateSerializer(many=True))
    def get_history(self, obj: Piece) -> list:
        return list(
            PieceStateSerializer(obj.states.all(), many=True, context=self.context).data
        )


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
    # {url, cloudinary_public_id} shape that Piece.thumbnail now stores.
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
            user=user, piece=piece, state=ENTRY_STATE, notes=notes
        )
        return piece


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
        images = validated_data.pop("images", [])

        new_state_id: str = validated_data["state"]
        piece: Piece = self.context["piece"]
        incoming: dict = dict(validated_data.pop("custom_fields", {}))
        inline_fields, global_ref_fields, global_ref_pks, clear_global_ref_fields = (
            _resolve_custom_field_payload(piece, new_state_id, incoming)
        )

        validated_data["custom_fields"] = inline_fields
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


class PieceStateUpdateSerializer(serializers.Serializer):
    """Partial update of the current PieceState's editable fields."""

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    images = CaptionedImageSerializer(many=True, required=False)
    custom_fields = serializers.JSONField(required=False)

    def validate_custom_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a JSON object.")
        return value

    def update(self, instance: PieceState, validated_data: dict) -> PieceState:
        if "notes" in validated_data:
            instance.notes = validated_data["notes"]
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


class PieceUpdateSerializer(serializers.Serializer):
    """Partial update of Piece fields."""

    name = serializers.CharField(required=False, max_length=255)
    current_location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    thumbnail = ThumbnailSerializer(required=False, allow_null=True)
    shared = serializers.BooleanField(required=False)
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

    def validate_showcase_fields(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a JSON array.")
        return value

    def update(self, instance: Piece, validated_data: dict) -> Piece:
        if "name" in validated_data:
            instance.name = validated_data["name"]
        if "current_location" in validated_data:
            instance.current_location = get_or_create_location(
                self.context["request"].user, validated_data["current_location"]
            )
        if "thumbnail" in validated_data:
            thumbnail_payload = validated_data["thumbnail"]
            instance.thumbnail = normalize_image_payload(
                thumbnail_payload, user=instance.user
            )
            instance.thumbnail_crop = (
                crop_to_dict(thumbnail_payload.get("crop"))
                if thumbnail_payload is not None
                else None
            )
        if "shared" in validated_data:
            instance.shared = validated_data["shared"]
        if "showcase_story" in validated_data:
            instance.showcase_story = validated_data["showcase_story"]
        if "showcase_fields" in validated_data:
            instance.showcase_fields = validated_data["showcase_fields"]
        instance.save()
        if "tags" in validated_data:
            tag_ids = [str(tag_id) for tag_id in validated_data["tags"]]
            _replace_piece_tags(instance, self.context["request"].user, tag_ids)
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
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True, allow_blank=True)
    last_name = serializers.CharField(read_only=True, allow_blank=True)
    is_staff = serializers.BooleanField(read_only=True)
    openid_subject = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_openid_subject(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.openid_subject if profile else ""

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_profile_image_url(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.profile_image_url if profile else ""


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def create(self, validated_data: dict):
        user_model = get_user_model()
        user = user_model.objects.create_user(
            username=validated_data["email"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
        UserProfile.objects.create(user=user)
        return user

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
            "created",
            "last_modified",
        ]


class TaskSubmissionSerializer(serializers.Serializer):
    task_type = serializers.CharField(max_length=255)
    input_params = serializers.JSONField(required=False, default=dict)
