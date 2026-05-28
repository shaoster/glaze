"""User preference endpoints for the Glaze API."""

from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..models import UserProfile
from ..preferences import UserPreferencesSerializer

# [SECURITY] Only these UserProfile fields may be written through the preferences
# endpoint. Keep this explicit so future schema additions cannot widen the write
# surface by accident.
ALLOWED_USER_PROFILE_FIELDS = {"alias"}


def _apply_user_profile_updates(
    profile: UserProfile, validated_data: dict[str, Any]
) -> list[str]:
    """Apply allowlisted UserProfile writes and return the fields to persist."""
    update_fields: list[str] = []
    for field_name in ALLOWED_USER_PROFILE_FIELDS:
        if field_name in validated_data:
            setattr(profile, field_name, validated_data[field_name])
            update_fields.append(field_name)
    return update_fields


@extend_schema(
    request=UserPreferencesSerializer,
    responses={200: UserPreferencesSerializer},
    description="Return or update the current user's saved preferences.",
)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@traced
def auth_preferences(request: Request) -> Response:
    """Return or update the current user's saved preferences."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    if request.method == "GET":
        return Response(
            {
                "alias": profile.alias,
                "preferences": profile.preferences
                if isinstance(profile.preferences, dict)
                else {},
            }
        )

    serializer = UserPreferencesSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    update_fields = _apply_user_profile_updates(profile, serializer.validated_data)

    if "preferences" in serializer.validated_data:
        existing_preferences = (
            profile.preferences if isinstance(profile.preferences, dict) else {}
        )
        incoming_preferences = cast(
            dict[str, Any], serializer.validated_data["preferences"]
        )
        merged_preferences: dict[str, Any] = {
            **existing_preferences,
            **incoming_preferences,
        }
        profile.preferences = merged_preferences
        update_fields.append("preferences")

    if update_fields:
        profile.save(update_fields=update_fields)
    return Response(
        {
            "alias": profile.alias,
            "preferences": profile.preferences
            if isinstance(profile.preferences, dict)
            else {},
        }
    )
