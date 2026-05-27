"""User preference endpoints for the Glaze API."""

from typing import Any, cast

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import UserProfile
from .preferences import UserPreferencesSerializer, get_preferences_config

# Whitelist of UserProfile fields that can be updated via the declarative system.
# [SECURITY]: Strictly control which model fields are exposed to storage: UserProfile.
ALLOWED_USER_PROFILE_FIELDS = {"alias"}


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
    update_fields: list[str] = []

    config = get_preferences_config()
    for section in config["sections"]:
        for field_id, field_def in section["fields"].items():
            if (
                field_def["storage"] == "UserProfile"
                and field_id in serializer.validated_data
                and field_id in ALLOWED_USER_PROFILE_FIELDS
            ):
                setattr(profile, field_id, serializer.validated_data[field_id])
                if field_id not in update_fields:
                    update_fields.append(field_id)

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
