"""Account deletion endpoints for the Glaze API.

Public helper entry points in this module are traced so account-deletion
behavior remains observable as a stable contract.
"""

from django.contrib.auth import logout
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.request import Request

from backend.otel import traced

from ..models import CropRun, PieceStateImage


@traced
def delete_account_impl(request: Request, *, logout_fn=logout) -> HttpResponse:
    """Delete the current user after invalidating their session."""
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return HttpResponse(status=status.HTTP_403_FORBIDDEN)
    assert user is not None
    # Invalidate the session before deleting the user to avoid dangling session
    # references to a now-deleted User row.
    logout_fn(request)
    with transaction.atomic():
        # Remove protected image-adjacent rows first so the subsequent user
        # deletion can cascade through pieces and images without hitting a
        # database-level ProtectedError.
        CropRun.objects.filter(
            Q(image__user=user) | Q(piece_state_image__piece_state__piece__user=user)
        ).delete()
        PieceStateImage.objects.filter(
            Q(image__user=user) | Q(piece_state__piece__user=user)
        ).delete()
        user.delete()
    return HttpResponse(status=status.HTTP_204_NO_CONTENT)
