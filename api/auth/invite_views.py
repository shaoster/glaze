"""Invite validation and invite-code management endpoints.

Privacy note (issue #740): admin email invites never persist the recipient
address. Codes are pre-generated in batches so a code's ``created_at`` is
decoupled from any individual send, sending only flips the ``sent`` flag, and
redemption deletes the row — so the database holds no email↔code↔account link.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from backend.otel import traced

from ..models import InviteCode

# Cap a single batch so a typo can't mint an absurd number of rows.
_MAX_BATCH = 500


class InviteSendRateThrottle(UserRateThrottle):
    """Per-admin throttle for the email-invite send endpoint.

    Rate comes from ``REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["invite_send"]``.
    """

    scope = "invite_send"


# There is deliberately no read-only "validate code" endpoint. A free validity
# check is a redemption oracle: anyone holding a code (e.g. from email-relay
# logs) could poll it to learn when the recipient signed up. Codes are only ever
# checked at redemption, which is authenticated (Google sign-in) and destructive
# (the row is deleted). See issue #740 and docs/security.md.


def _get_or_create_active_invite_code() -> InviteCode:
    active = (
        InviteCode.objects.filter(expires_at__gt=timezone.now())
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
    """Return or create the active staff invite code (link/QR flow)."""
    if request.method == "POST":
        invite = InviteCode.objects.create()
    else:
        invite = _get_or_create_active_invite_code()
    # Surfacing a code as a link/QR hands it out, so take it out of the email
    # pool: send_invite only draws from sent=False codes. See issue #740.
    if not invite.sent:
        invite.sent = True
        invite.save(update_fields=["sent"])
    return Response(
        {"code": str(invite.code), "expires_at": invite.expires_at.isoformat()}
    )


@extend_schema(
    request=None,
    responses={201: None},
    description=(
        "(Staff only) Pre-generate a batch of invite codes for the email-invite "
        'pool. Body: {"count": N}. Returns {created: N} only — no per-code '
        "timestamps, so a send can never be matched to a code by creation time."
    ),
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@traced
def staff_invite_batch(request: Request) -> Response:
    """Create a batch of invite codes in one transaction (uniform created_at)."""
    try:
        count = int(request.data.get("count", 0))
    except (TypeError, ValueError):
        count = 0
    if count < 1 or count > _MAX_BATCH:
        return Response(
            {"detail": f"count must be between 1 and {_MAX_BATCH}."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # bulk_create bypasses InviteCode.save(), so set the expiry explicitly. Using
    # one value gives the whole batch a uniform created_at and expires_at.
    expires_at = timezone.now() + InviteCode.TTL
    with transaction.atomic():
        InviteCode.objects.bulk_create(
            [InviteCode(expires_at=expires_at) for _ in range(count)]
        )
    return Response({"created": count}, status=status.HTTP_201_CREATED)


@extend_schema(
    request=None,
    responses={204: None},
    description=(
        "(Staff only) Email an invite to a recipient. Pulls an unsent code from "
        "the pre-generated pool, marks it sent, and emails the invite link. The "
        "recipient address is never stored, logged, or traced."
    ),
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@throttle_classes([InviteSendRateThrottle])
@traced
def send_invite(request: Request) -> Response:
    """Send an email invite without ever persisting the recipient address."""
    email = (request.data.get("email") or "").strip()
    try:
        validate_email(email)
    except ValidationError:
        # Generic 400: never reveal whether an address maps to an account.
        return Response(
            {"detail": "A valid email address is required.", "code": "invalid_email"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Claim a random unsent, unexpired code and email it inside one transaction,
    # so a send failure rolls back the flag and the code is not burned. The pool's
    # uniform created_at plus random selection leak no per-send signal.
    with transaction.atomic():
        invite = (
            InviteCode.objects.select_for_update(skip_locked=True)
            .filter(sent=False, expires_at__gt=timezone.now())
            .order_by("?")
            .first()
        )
        if invite is None:
            return Response(
                {
                    "detail": "No invite codes available. Generate a batch first.",
                    "code": "pool_empty",
                },
                status=status.HTTP_409_CONFLICT,
            )
        invite.sent = True
        invite.save(update_fields=["sent"])

        invite_url = f"{settings.INVITE_LINK_BASE_URL}/invite?code={invite.code}"
        send_mail(
            subject="You're invited to PotterDoc",
            message=(
                "You've been invited to PotterDoc.\n\n"
                f"Create your account here:\n{invite_url}\n\n"
                "This link works once and expires "
                f"{invite.expires_at.date().isoformat()}."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
        )

    return Response(status=status.HTTP_204_NO_CONTENT)
