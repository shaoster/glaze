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


def _check_database() -> bool:
    from django.db import connections

    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return True


def _check_migrations() -> bool:
    from django.db import connections
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connections["default"])
    targets = executor.loader.graph.leaf_nodes()
    return not executor.migration_plan(targets)


def _check_async_tasks() -> bool:
    from .tasks import get_task_interface

    return get_task_interface().health_check()


# Names resolved at request time (not import time) so tests can monkeypatch
# `api.views._check_<name>` and the view will see the patched callable.
_READINESS_CHECKS: tuple[str, ...] = ("database", "migrations", "async_tasks")


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def health_ready(request: Request) -> Response:
    checks: dict[str, bool] = {}
    for name in _READINESS_CHECKS:
        check: Callable[[], bool] = globals()[f"_check_{name}"]
        try:
            checks[name] = bool(check())
        except Exception:
            checks[name] = False
    ok = all(checks.values())
    return Response(
        {"status": "ready" if ok else "not_ready", "checks": checks},
        status=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
