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
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from django.contrib.auth import get_user_model
from django.utils import timezone

from django.apps import apps

from .models import FavoriteGlazeCombination, FiringTemperature, GlazeCombination, Location, Piece, PieceState, UserProfile
from .registry import global_entry_serializer
from .workflow import (
    ENTRY_STATE,
    SUCCESSORS,
    VALID_STATES,
    get_global_config,
    get_global_ref_fields_for_state,
    get_state_ref_fields,
)


class GlazeTypeRefSerializer(serializers.Serializer):
    """Minimal glaze type representation embedded in GlazeCombinationEntrySerializer."""
    id = serializers.UUIDField()
    name = serializers.CharField()


class FiringTemperatureRefSerializer(serializers.ModelSerializer):
    """Minimal firing temperature representation embedded in GlazeCombinationEntrySerializer."""
    id = serializers.UUIDField()

    class Meta:
        model = FiringTemperature
        fields = ['id', 'name', 'cone', 'temperature_c', 'atmosphere']


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

    class Meta:
        model = GlazeCombination
        fields = [
            'id', 'name', 'test_tile_image',
            'is_food_safe', 'runs', 'highlights_grooves', 'is_different_on_white_and_brown_clay',
            'firing_temperature',
            'is_public', 'is_favorite', 'glaze_types',
        ]

    @extend_schema_field(serializers.CharField())
    def get_id(self, obj: GlazeCombination) -> str:
        return str(obj.pk)

    @extend_schema_field(serializers.BooleanField())
    def get_is_public(self, obj: GlazeCombination) -> bool:
        return obj.user_id is None

    @extend_schema_field(serializers.BooleanField())
    def get_is_favorite(self, obj: GlazeCombination) -> bool:
        return obj.pk in self.context.get('favorite_ids', set())

    @extend_schema_field(GlazeTypeRefSerializer(many=True))
    def get_glaze_types(self, obj: GlazeCombination) -> list:
        return [
            {'id': str(layer.glaze_type_id), 'name': layer.glaze_type.name}
            for layer in obj.layers.select_related('glaze_type').all()
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
    caption = serializers.CharField(allow_blank=True, default='')
    created = serializers.DateTimeField(required=False)
    cloudinary_public_id = serializers.CharField(allow_blank=True, required=False, default=None, allow_null=True)


class PieceStateSerializer(serializers.ModelSerializer):
    previous_state = serializers.SerializerMethodField()
    next_state = serializers.SerializerMethodField()
    images = CaptionedImageSerializer(many=True)
    additional_fields = serializers.SerializerMethodField()

    class Meta:
        model = PieceState
        fields = ['state', 'notes', 'created', 'last_modified', 'images',
                  'additional_fields', 'previous_state', 'next_state']
        extra_kwargs = {
            'notes': {'required': True},
        }

    @extend_schema_field(serializers.DictField())
    def get_additional_fields(self, obj: PieceState) -> dict:
        """Merge inline JSON blob with global-ref junction table lookups.

        Global ref fields are returned as {id, name} objects; inline fields
        are returned as their raw JSON values.
        """
        result = dict(obj.additional_fields or {})
        global_ref_fields = get_global_ref_fields_for_state(obj.state)
        for field_name, global_name in global_ref_fields.items():
            config = get_global_config(global_name)
            ref_model = apps.get_model('api', f'PieceState{config["model"]}Ref')
            try:
                ref_row = ref_model.objects.select_related(global_name).get(
                    piece_state=obj, field_name=field_name
                )
                global_obj = getattr(ref_row, global_name)
                result[field_name] = {'id': str(global_obj.pk), 'name': global_obj.name}
            except ref_model.DoesNotExist:
                pass
        return result

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_previous_state(self, obj: PieceState) -> str | None:
        prev = obj.piece.states.filter(created__lt=obj.created).order_by('-created').first()
        return prev.state if prev else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_next_state(self, obj: PieceState) -> str | None:
        nxt = obj.piece.states.filter(created__gt=obj.created).order_by('created').first()
        return nxt.state if nxt else None


class StateSummarySerializer(serializers.Serializer):
    """Minimal state representation embedded in PieceSummary list responses."""
    state = serializers.CharField()


class ThumbnailSerializer(serializers.Serializer):
    url = serializers.CharField()
    cloudinary_public_id = serializers.CharField(allow_blank=True, allow_null=True, default=None)


class PieceSummarySerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()
    current_location = serializers.SerializerMethodField()
    thumbnail = ThumbnailSerializer(allow_null=True, read_only=True)
    last_modified = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Piece
        fields = ['id', 'name', 'created', 'last_modified', 'thumbnail', 'current_state', 'current_location']

    @extend_schema_field(StateSummarySerializer)
    def get_current_state(self, obj: Piece) -> dict:
        cs = obj.current_state
        if cs is None:
            raise ValueError(f'Piece {obj.id} has no states — data integrity error')
        return {'state': cs.state}

    @extend_schema_field(serializers.CharField(allow_null=True, required=False))
    def get_current_location(self, obj: Piece) -> str | None:
        return obj.current_location.name if obj.current_location else None


class PieceDetailSerializer(PieceSummarySerializer):
    current_state = serializers.SerializerMethodField()  # type: ignore[assignment]
    history = serializers.SerializerMethodField()

    class Meta(PieceSummarySerializer.Meta):
        fields = PieceSummarySerializer.Meta.fields + ['history']

    @extend_schema_field(PieceStateSerializer)
    def get_current_state(self, obj: Piece) -> dict:
        cs = obj.current_state
        if cs is None:
            raise ValueError(f'Piece {obj.id} has no states — data integrity error')
        return PieceStateSerializer(cs).data  # type: ignore[return-value]

    @extend_schema_field(PieceStateSerializer(many=True))
    def get_history(self, obj: Piece) -> list:
        return PieceStateSerializer(obj.states.all(), many=True).data  # type: ignore[return-value]


class PieceCreateSerializer(serializers.ModelSerializer):
    notes = serializers.CharField(required=False, default='', allow_blank=True, max_length=300)
    current_location = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    # Accept a bare URL string from the curated SVG gallery; wrap it into the
    # {url, cloudinary_public_id} shape that Piece.thumbnail now stores.
    thumbnail = serializers.CharField(required=False, allow_blank=True, default=None)

    class Meta:
        model = Piece
        fields = ['name', 'thumbnail', 'notes', 'current_location']

    def create(self, validated_data: dict) -> Piece:  # type: ignore[override]
        user = self.context['request'].user
        notes = validated_data.pop('notes', '')
        location_name = validated_data.pop('current_location', None)
        location_obj = None
        if location_name:
            location_obj, _ = Location.objects.get_or_create(user=user, name=location_name)
        raw_thumbnail = validated_data.pop('thumbnail', None)
        thumbnail = {'url': raw_thumbnail, 'cloudinary_public_id': None} if raw_thumbnail else None
        piece = Piece.objects.create(user=user, thumbnail=thumbnail, **validated_data, current_location=location_obj)
        PieceState.objects.create(user=user, piece=piece, state=ENTRY_STATE, notes=notes)
        return piece


class PieceStateCreateSerializer(serializers.ModelSerializer):
    state = serializers.ChoiceField(choices=sorted(VALID_STATES))
    images = CaptionedImageSerializer(many=True, required=False, default=list)
    additional_fields = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = PieceState
        fields = ['state', 'notes', 'images', 'additional_fields']

    def validate_additional_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Must be a JSON object.')
        return value

    def validate_state(self, value: str) -> str:
        piece: Piece = self.context['piece']
        current = piece.current_state
        if current is not None:
            valid_next = SUCCESSORS.get(current.state, [])
            if value not in valid_next:
                raise serializers.ValidationError(
                    f"Cannot transition from '{current.state}' to '{value}'. "
                    f"Valid next states: {valid_next}"
                )
        return value

    def create(self, validated_data: dict) -> PieceState:  # type: ignore[override]
        # Ensure all images have a created timestamp set by the backend.
        images = validated_data.get('images', [])
        if images:
            processed: list[dict] = []
            for img in images:
                created_val = img.get('created', timezone.now())
                processed.append({
                    'url': img['url'],
                    'caption': img['caption'],
                    'created': created_val.isoformat() if hasattr(created_val, 'isoformat') else str(created_val),
                })
            validated_data['images'] = processed

        new_state_id: str = validated_data['state']
        piece: Piece = self.context['piece']
        global_ref_fields = get_global_ref_fields_for_state(new_state_id)
        incoming: dict = dict(validated_data.pop('additional_fields', {}))

        # Separate incoming payload into inline fields and global-ref PKs.
        inline_fields: dict = {}
        global_ref_pks: dict[str, str] = {}
        for field_name, value in incoming.items():
            if field_name in global_ref_fields:
                global_ref_pks[field_name] = str(value)
            else:
                inline_fields[field_name] = value

        # Auto-populate state ref fields from ancestor states.
        # Inline state refs copy from the ancestor's JSON blob.
        # Global-ref state refs copy from the ancestor's junction row.
        state_refs = get_state_ref_fields(new_state_id)
        for field_name, (source_state_id, source_field_name) in state_refs.items():
            ancestor = piece.states.filter(state=source_state_id).order_by('-created').first()
            if ancestor is None:
                continue
            if field_name in global_ref_fields:
                if field_name not in global_ref_pks:
                    # Copy FK from the ancestor's junction table row.
                    src_global_name = global_ref_fields[field_name]
                    src_config = get_global_config(src_global_name)
                    src_ref_model = apps.get_model('api', f'PieceState{src_config["model"]}Ref')
                    try:
                        src_row = src_ref_model.objects.get(
                            piece_state=ancestor, field_name=source_field_name
                        )
                        global_ref_pks[field_name] = str(getattr(src_row, f'{src_global_name}_id'))
                    except src_ref_model.DoesNotExist:
                        pass
            else:
                if field_name not in inline_fields and source_field_name in (ancestor.additional_fields or {}):
                    inline_fields[field_name] = ancestor.additional_fields[source_field_name]

        validated_data['additional_fields'] = inline_fields
        try:
            piece_state = PieceState.objects.create(
                user=piece.user,
                piece=piece,
                **validated_data,
            )
        except ValueError as exc:
            raise serializers.ValidationError({'additional_fields': str(exc)}) from exc

        # Write junction rows for global ref fields.
        _write_global_ref_rows(piece_state, global_ref_fields, global_ref_pks)
        return piece_state


def _write_global_ref_rows(piece_state: PieceState, global_ref_fields: dict[str, str], global_ref_pks: dict[str, str]) -> None:
    """Create or update junction table rows for global ref fields.

    ``global_ref_pks`` maps field_name → PK string supplied by the client.
    Raises ``serializers.ValidationError`` if a supplied PK does not exist.
    """
    for field_name, pk_str in global_ref_pks.items():
        global_name = global_ref_fields[field_name]
        config = get_global_config(global_name)
        model_cls = apps.get_model('api', config['model'])
        ref_model_cls = apps.get_model('api', f'PieceState{config["model"]}Ref')
        try:
            global_obj = model_cls.objects.get(pk=pk_str)
        except (model_cls.DoesNotExist, ValueError):
            raise serializers.ValidationError(
                {f'additional_fields.{field_name}': f'Invalid {global_name} id: {pk_str!r}'}
            )
        ref_model_cls.objects.update_or_create(
            piece_state=piece_state,
            field_name=field_name,
            defaults={global_name: global_obj},
        )


class PieceStateUpdateSerializer(serializers.Serializer):
    """Partial update of the current PieceState's editable fields."""
    notes = serializers.CharField(required=False, allow_blank=True)
    images = CaptionedImageSerializer(many=True, required=False)
    additional_fields = serializers.JSONField(required=False)

    def validate_additional_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Must be a JSON object.')
        return value

    def update(self, instance: PieceState, validated_data: dict) -> PieceState:  # type: ignore[override]
        if 'notes' in validated_data:
            instance.notes = validated_data['notes']
        if 'images' in validated_data:
            images_json = []
            for img in validated_data['images']:
                created_val = img.get('created', timezone.now())
                images_json.append({
                    'url': img['url'],
                    'caption': img['caption'],
                    'created': created_val.isoformat() if hasattr(created_val, 'isoformat') else str(created_val),
                })
            instance.images = images_json
        if 'additional_fields' in validated_data:
            incoming: dict = dict(validated_data['additional_fields'])
            global_ref_fields = get_global_ref_fields_for_state(instance.state)

            # Separate incoming dict into inline fields and global-ref PKs.
            inline_fields: dict = {}
            global_ref_pks: dict[str, str] = {}
            for field_name, value in incoming.items():
                if field_name in global_ref_fields:
                    global_ref_pks[field_name] = str(value)
                else:
                    inline_fields[field_name] = value

            instance.additional_fields = inline_fields
            try:
                instance.save()
            except ValueError as exc:
                raise serializers.ValidationError({'additional_fields': str(exc)}) from exc
            _write_global_ref_rows(instance, global_ref_fields, global_ref_pks)
        else:
            try:
                instance.save()
            except ValueError as exc:
                raise serializers.ValidationError({'additional_fields': str(exc)}) from exc
        return instance


class PieceUpdateSerializer(serializers.Serializer):
    """Partial update of Piece fields."""
    name = serializers.CharField(required=False, max_length=255)
    current_location = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    thumbnail = ThumbnailSerializer(required=False, allow_null=True)

    def update(self, instance: Piece, validated_data: dict) -> Piece:  # type: ignore[override] — DRF base is untyped; narrowing instance/return to Piece is intentional
        if 'name' in validated_data:
            instance.name = validated_data['name']
        if 'current_location' in validated_data:
            location_name = validated_data['current_location']
            if location_name:
                user = self.context['request'].user
                location_obj, _ = Location.objects.get_or_create(user=user, name=location_name)
            else:
                location_obj = None
            instance.current_location = location_obj
        if 'thumbnail' in validated_data:
            instance.thumbnail = validated_data['thumbnail']
        instance.save()
        return instance


class AuthUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True, allow_blank=True)
    last_name = serializers.CharField(read_only=True, allow_blank=True)
    openid_subject = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_openid_subject(self, obj) -> str:
        profile = getattr(obj, 'profile', None)
        return profile.openid_subject if profile else ''

    @extend_schema_field(serializers.CharField(allow_blank=True))
    def get_profile_image_url(self, obj) -> str:
        profile = getattr(obj, 'profile', None)
        return profile.profile_image_url if profile else ''


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

    def create(self, validated_data: dict):  # type: ignore[override]
        user_model = get_user_model()
        user = user_model.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        UserProfile.objects.create(user=user)
        return user
