"""Account deletion endpoints for the Glaze API.

Public helper entry points in this module are traced so account-deletion
behavior remains observable as a stable contract.
"""

from django.contrib.auth import logout
from django.db import transaction
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


@traced
def delete_account_impl(request: Request, *, logout_fn=logout) -> Response:
    """Delete the current user after invalidating their session."""
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return Response(status=status.HTTP_403_FORBIDDEN)
    assert user is not None
    # Invalidate the session before deleting the user to avoid dangling session
    # references to a now-deleted User row.
    logout_fn(request)
    with transaction.atomic():
        user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
