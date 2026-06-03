from rest_framework import serializers

from api.models import SupportMessage, SupportThread


class SupportMessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()

    class Meta:
        model = SupportMessage
        fields = ["id", "sender", "body", "created"]

    def get_sender(self, obj: SupportMessage) -> str:
        return "admin" if obj.author.is_staff else "user"


class SupportThreadSerializer(serializers.ModelSerializer):
    messages = SupportMessageSerializer(many=True, read_only=True)

    class Meta:
        model = SupportThread
        fields = [
            "id",
            "subject",
            "is_closed",
            "created",
            "last_message_at",
            "messages",
        ]


class SupportContactEnvelopeSerializer(serializers.Serializer):
    thread = SupportThreadSerializer(allow_null=True)


class SupportContactCreateSerializer(serializers.Serializer):
    body = serializers.CharField(
        allow_blank=False, trim_whitespace=True, max_length=4000
    )

    def validate_body(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Message body cannot be empty.")
        return stripped
