import hashlib
import hmac
import time
import uuid as _uuid

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils.crypto import constant_time_compare
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import (
    AsyncTask,
)
from .serializers import (
    AsyncTaskSerializer,
    TaskSubmissionSerializer,
)

_PROGRESS_TOKEN_TTL = 3600  # seconds — must cover the longest render job


def _make_progress_token(task_id: _uuid.UUID | str) -> str:
    """Generate an HMAC-signed token authorizing progress callbacks for task_id."""
    expiry = int(time.time()) + _PROGRESS_TOKEN_TTL
    payload = f"{task_id}:{expiry}"
    sig = hmac.new(
        settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"{payload}:{sig}"


def _verify_progress_token(token: str, task_id: _uuid.UUID | str) -> bool:
    try:
        tid, expiry_str, sig = token.rsplit(":", 2)
        if tid != str(task_id):
            return False
        if int(expiry_str) < int(time.time()):
            return False
        payload = f"{tid}:{expiry_str}"
        expected = hmac.new(
            settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        return constant_time_compare(sig, expected)
    except Exception:
        return False


@extend_schema(
    request=TaskSubmissionSerializer,
    responses={202: AsyncTaskSerializer},
    summary="Submit an asynchronous background task",
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@traced
def submit_task(request: Request) -> Response:
    """Queue a background task for asynchronous processing."""
    from .tasks import get_task_interface

    serializer = TaskSubmissionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    task = AsyncTask.objects.create(  # type: ignore[misc]
        user=request.user,
        task_type=serializer.validated_data["task_type"],
        input_params=serializer.validated_data.get("input_params", {}),
    )

    # Hand off to the swappable background runner.
    get_task_interface().submit(task)

    return Response(AsyncTaskSerializer(task).data, status=status.HTTP_202_ACCEPTED)


@extend_schema(
    responses={200: AsyncTaskSerializer},
    summary="Get status and result of an asynchronous task",
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
@traced
def task_detail(request: Request, task_id: str) -> Response:
    """Fetch a submitted task by ID for the current admin user."""
    # Scope to current user to prevent leaking task state between accounts.
    task = get_object_or_404(AsyncTask, id=task_id, user=request.user)
    return Response(AsyncTaskSerializer(task).data)


@extend_schema(exclude=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def report_task_progress(request: Request, task_id: _uuid.UUID) -> Response:
    """Receive a progress callback from a Modal compute function.

    Authentication is via an HMAC token in the X-Task-Token header signed with
    Django's SECRET_KEY. The token encodes the task_id and an expiry timestamp,
    so it is single-purpose and short-lived — Modal holds no session credentials.
    """
    token = request.headers.get("X-Task-Token", "")
    if not _verify_progress_token(token, task_id):
        return Response(status=status.HTTP_403_FORBIDDEN)
    task = get_object_or_404(AsyncTask, id=task_id)
    progress = request.data.get("progress")
    if not isinstance(progress, int) or not (0 <= progress <= 100):
        return Response(status=status.HTTP_400_BAD_REQUEST)
    task.progress = progress
    task.save(update_fields=["progress", "last_modified"])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Readiness ────────────────────────────────────────────────────────────────
# Single anonymous endpoint used by docker-compose / nginx / future deploy
# automation to gate traffic. Each entry in `_READINESS_CHECKS` returns True
# iff that subsystem is currently usable; any exception is mapped to False so
# the response never leaks internal error detail. Add a new check by appending
# to `_READINESS_CHECKS` — the wire format is just `{name: bool}`.
