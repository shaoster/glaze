"""Account deletion endpoints for the Glaze API."""

from django.contrib.auth import logout
from django.db import transaction
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response


def delete_account_impl(request: Request, *, logout_fn=logout) -> Response:
    """Delete the current user after invalidating their session."""
    user = request.user
    # Invalidate the session before deleting the user to avoid dangling session
    # references to a now-deleted User row.
    logout_fn(request)
    with transaction.atomic():
        user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


_delete_account_impl = delete_account_impl
