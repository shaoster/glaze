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


@extend_schema(
    request={
        "multipart/form-data": {
            "type": "object",
            "properties": {
                "payload": {"type": "string"},
            },
            "required": ["payload"],
        }
    },
    responses={200: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def admin_manual_square_crop_import(request: Request) -> Response:
    from .manual_tile_imports import import_manual_tile_records

    payload_raw = request.data.get("payload", "")
    if not payload_raw:
        return Response(
            {"detail": "payload is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        return Response(
            {"detail": "payload must be valid JSON."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return Response(
            {"detail": "payload.records must be a non-empty list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if any(not record.get("reviewed") for record in records):
        return Response(
            {"detail": "All records must be reviewed before import."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uploaded_files = {}
    for record in records:
        client_id = record.get("client_id", "")
        if not client_id:
            return Response(
                {"detail": "Each record must include client_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        file_obj = request.FILES.get(f"crop_image__{client_id}")
        if file_obj is not None:
            uploaded_files[client_id] = file_obj

    try:
        result = import_manual_tile_records(records, uploaded_files)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)
