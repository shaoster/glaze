"""Invite validation and invite-code management endpoints."""

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import InviteCode


@extend_schema(
    request=None,
    responses={200: None},
    description="Validate a UUID invite code. Returns {valid: true} if usable.",
)
@api_view(["POST"])
@permission_classes([AllowAny])
@traced
def validate_invite(request: Request) -> Response:
    """Validate a user-supplied invite code."""
    code_value = request.data.get("code", "")
    if not code_value:
        return Response(
            {"detail": "code is required.", "code": "code_required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        invite = InviteCode.objects.get(code=code_value)
    except InviteCode.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired invite code.", "code": "invalid_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not invite.is_valid:
        return Response(
            {
                "detail": "This invite code has already been used or has expired.",
                "code": "invalid_code",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"valid": True})


def _get_or_create_active_invite_code() -> InviteCode:
    active = (
        InviteCode.objects.filter(used_at__isnull=True, expires_at__gt=timezone.now())
        .order_by("-created_at")
        .first()
    )
    if active:
        return active
    return InviteCode.objects.create()


@extend_schema(
    request=None,
    responses={200: None},
    description="(Staff only) Get the current active invite code, creating one if none exists.",
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
@traced
def staff_invite_code(request: Request) -> Response:
    """Return or create the active staff invite code."""
    if request.method == "POST":
        invite = InviteCode.objects.create()
    else:
        invite = _get_or_create_active_invite_code()
    return Response(
        {"code": str(invite.code), "expires_at": invite.expires_at.isoformat()}
    )
