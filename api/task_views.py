from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
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


# ── Readiness ────────────────────────────────────────────────────────────────
# Single anonymous endpoint used by docker-compose / nginx / future deploy
# automation to gate traffic. Each entry in `_READINESS_CHECKS` returns True
# iff that subsystem is currently usable; any exception is mapped to False so
# the response never leaks internal error detail. Add a new check by appending
# to `_READINESS_CHECKS` — the wire format is just `{name: bool}`.
