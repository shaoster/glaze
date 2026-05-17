# ruff: noqa: F401
import hashlib
import json
import os
import re
from collections import defaultdict
from typing import Callable

from django.apps import apps
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, Greatest
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .models import (
    AsyncTask,
    FavoriteGlazeCombination,
    GlazeCombination,
    Piece,
    PieceState,
    UserProfile,
)
from .serializer_registry import (
    _GLOBAL_ENTRY_SERIALIZERS,  # auto-generated in _register_globals(); hand-written serializers overwrite
)
from .serializers import (
    AsyncTaskSerializer,
    AuthUserSerializer,
    GlazeCombinationImageEntrySerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    RegisterSerializer,
    TaskSubmissionSerializer,
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)


@extend_schema(
    request=TaskSubmissionSerializer,
    responses={202: AsyncTaskSerializer},
    summary="Submit an asynchronous background task",
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def submit_task(request: Request) -> Response:
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
@permission_classes([IsAuthenticated])
@traced
def task_detail(request: Request, task_id: str) -> Response:
    # Scope to current user to prevent leaking task state between accounts.
    task = get_object_or_404(AsyncTask, id=task_id, user=request.user)
    return Response(AsyncTaskSerializer(task).data)


# ── Readiness ────────────────────────────────────────────────────────────────
# Single anonymous endpoint used by docker-compose / nginx / future deploy
# automation to gate traffic. Each entry in `_READINESS_CHECKS` returns True
# iff that subsystem is currently usable; any exception is mapped to False so
# the response never leaks internal error detail. Add a new check by appending
# to `_READINESS_CHECKS` — the wire format is just `{name: bool}`.
