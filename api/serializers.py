from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import ENTRY_STATE, SUCCESSORS, VALID_STATES, Location, Piece, PieceState


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name']


class CaptionedImageSerializer(serializers.Serializer):
    url = serializers.CharField()
    caption = serializers.CharField()
    created = serializers.DateTimeField()


class PieceStateSerializer(serializers.ModelSerializer):
    previous_state = serializers.SerializerMethodField()
    next_state = serializers.SerializerMethodField()
    images = CaptionedImageSerializer(many=True)
    location = serializers.SerializerMethodField()

    class Meta:
        model = PieceState
        fields = ['state', 'notes', 'created', 'last_modified', 'location', 'images',
                  'previous_state', 'next_state']
        # notes always present in responses (model default='')
        extra_kwargs = {
            'notes': {'required': True},
        }

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_location(self, obj: PieceState) -> str:
        return obj.location.name if obj.location else ''

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


class PieceSummarySerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()
    last_modified = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Piece
        fields = ['id', 'name', 'created', 'last_modified', 'thumbnail', 'current_state']
        # thumbnail always present in responses (model default='')
        extra_kwargs = {
            'thumbnail': {'required': True},
        }

    @extend_schema_field(StateSummarySerializer)
    def get_current_state(self, obj: Piece) -> dict:
        cs = obj.current_state
        if cs is None:
            raise ValueError(f'Piece {obj.id} has no states — data integrity error')
        return {'state': cs.state}


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

    class Meta:
        model = Piece
        fields = ['name', 'thumbnail', 'notes']

    def create(self, validated_data: dict) -> Piece:  # type: ignore[override]
        notes = validated_data.pop('notes', '')
        piece = Piece.objects.create(**validated_data)
        PieceState.objects.create(piece=piece, state=ENTRY_STATE, notes=notes)
        return piece


class PieceStateCreateSerializer(serializers.ModelSerializer):
    state = serializers.ChoiceField(choices=sorted(VALID_STATES))
    images = CaptionedImageSerializer(many=True, required=False, default=list)
    location = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = PieceState
        fields = ['state', 'notes', 'location', 'images']

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
        location_name = validated_data.pop('location', '')
        location_obj = None
        if location_name:
            location_obj, _ = Location.objects.get_or_create(name=location_name)
        return PieceState.objects.create(
            piece=self.context['piece'],
            location=location_obj,
            **validated_data,
        )


class PieceStateUpdateSerializer(serializers.Serializer):
    """Partial update of the current PieceState's editable fields."""
    notes = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    images = CaptionedImageSerializer(many=True, required=False)

    def update(self, instance: PieceState, validated_data: dict) -> PieceState:  # type: ignore[override]
        if 'notes' in validated_data:
            instance.notes = validated_data['notes']
        if 'location' in validated_data:
            location_name = validated_data['location']
            if location_name:
                location_obj, _ = Location.objects.get_or_create(name=location_name)
                instance.location = location_obj
            else:
                instance.location = None
        if 'images' in validated_data:
            # Convert any datetime objects to ISO strings for JSONField storage.
            images_json = []
            for img in validated_data['images']:
                created = img['created']
                images_json.append({
                    'url': img['url'],
                    'caption': img['caption'],
                    'created': created.isoformat() if hasattr(created, 'isoformat') else created,
                })
            instance.images = images_json
        instance.save()
        return instance
