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
    request=None,
    responses={
        200: {
            "type": "object",
            "properties": {
                "cloud_name": {"type": "string"},
                "api_key": {"type": "string"},
                "folder": {"type": "string"},
            },
            "required": ["cloud_name", "api_key"],
        }
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cloudinary_widget_config(request: Request) -> Response:
    """Return Cloudinary config needed to initialize the Upload Widget."""
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    folder = os.environ.get("CLOUDINARY_UPLOAD_FOLDER", "").strip()

    if not cloud_name or not api_key:
        return Response(
            {"detail": "Cloudinary is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    payload: dict[str, str] = {"cloud_name": cloud_name, "api_key": api_key}
    if folder:
        payload["folder"] = folder
    preset = os.environ.get("CLOUDINARY_UPLOAD_PRESET", "").strip()
    if preset:
        payload["upload_preset"] = preset
    return Response(payload)


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {"params_to_sign": {"type": "object"}},
            "required": ["params_to_sign"],
        }
    },
    responses={
        200: {
            "type": "object",
            "properties": {"signature": {"type": "string"}},
            "required": ["signature"],
        }
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cloudinary_widget_sign(request: Request) -> Response:
    """Sign the params_to_sign dict provided by the Cloudinary Upload Widget."""
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    if not api_secret:
        return Response(
            {"detail": "Cloudinary is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    params_to_sign = request.data.get("params_to_sign", {})
    if not isinstance(params_to_sign, dict):
        return Response(
            {"detail": "params_to_sign must be an object."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Cloudinary signature format: sorted key=value pairs joined by '&',
    # then append the API secret and SHA1-hash the result.
    signing_string = "&".join(
        f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign.keys())
    )
    signature = hashlib.sha1(
        f"{signing_string}{api_secret}".encode("utf-8")
    ).hexdigest()
    return Response({"signature": signature})


@extend_schema(
    methods=["GET"],
    responses={
        200: {
            "type": "object",
            "properties": {
                "assets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "public_id": {"type": "string"},
                            "cloud_name": {"type": "string"},
                            "path_prefix": {"type": ["string", "null"]},
                            "url": {"type": "string"},
                            "thumbnail_url": {"type": "string"},
                            "bytes": {"type": ["integer", "null"]},
                            "created_at": {"type": ["string", "null"]},
                            "referenced": {"type": "boolean"},
                        },
                    },
                },
                "summary": {
                    "type": "object",
                    "properties": {
                        "total": {"type": "integer"},
                        "referenced": {"type": "integer"},
                        "unused": {"type": "integer"},
                        "referenced_breakdown": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "key": {"type": "string"},
                                    "label": {"type": "string"},
                                    "count": {"type": "integer"},
                                },
                            },
                        },
                        "reference_warnings": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                },
            },
        },
        503: {"type": "object"},
    },
)
@extend_schema(
    methods=["DELETE"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "public_ids": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["public_ids"],
        }
    },
    responses={
        200: {"type": "object"},
        400: {"type": "object"},
        503: {"type": "object"},
    },
)
@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def admin_cloudinary_cleanup(request: Request) -> Response:
    from .cloudinary_cleanup import (
        delete_cloudinary_assets,
        list_cloudinary_assets,
        summarize_referenced_public_ids,
    )

    if request.method == "GET":
        try:
            assets = list_cloudinary_assets()
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        unused = [asset for asset in assets if not asset.referenced]
        referenced_breakdown = summarize_referenced_public_ids(
            {asset.public_id for asset in assets}
        )
        return Response(
            {
                "assets": [
                    {
                        "public_id": asset.public_id,
                        "cloud_name": asset.cloud_name,
                        "path_prefix": asset.path_prefix,
                        "url": asset.url,
                        "thumbnail_url": asset.thumbnail_url,
                        "bytes": asset.bytes,
                        "created_at": asset.created_at,
                    }
                    for asset in unused
                ],
                "summary": {
                    "total": len(assets),
                    "referenced": len(assets) - len(unused),
                    "unused": len(unused),
                    "referenced_breakdown": [
                        {
                            "key": source.key,
                            "label": source.label,
                            "count": source.count,
                        }
                        for source in referenced_breakdown.sources
                    ],
                    "reference_warnings": referenced_breakdown.warnings,
                },
            }
        )

    public_ids = request.data.get("public_ids")
    if not isinstance(public_ids, list) or not all(
        isinstance(public_id, str) and public_id for public_id in public_ids
    ):
        return Response(
            {"detail": "public_ids must be a non-empty list of strings."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        deleted = delete_cloudinary_assets(public_ids)
    except ValueError as exc:
        message = str(exc)
        service_unavailable_messages = {
            "Cloudinary is not configured on the server.",
            "Unable to delete Cloudinary assets.",
        }
        response_status: int = status.HTTP_400_BAD_REQUEST
        if message in service_unavailable_messages:
            response_status = status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({"detail": message}, status=response_status)

    return Response({"deleted": deleted})


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="unreferenced_only",
            type=bool,
            location=OpenApiParameter.QUERY,
            description="Restrict the archive to assets not referenced by PotterDoc. Defaults to false (all assets).",
        ),
    ],
    responses={
        200: {"type": "string", "format": "binary"},
        503: {"type": "object"},
    },
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_cloudinary_cleanup_archive(
    request: Request,
) -> StreamingHttpResponse | Response:
    from .cloudinary_cleanup import (
        list_cloudinary_assets,
        stream_cloudinary_cleanup_archive,
    )

    unreferenced_only = request.query_params.get("unreferenced_only", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    try:
        # list_cloudinary_assets does synchronous network I/O; run in a thread.
        assets = list_cloudinary_assets()
    except ValueError as exc:
        return Response(
            {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    selected = [a for a in assets if not a.referenced] if unreferenced_only else assets
    filename = (
        "cloudinary-unreferenced-images.zip"
        if unreferenced_only
        else "cloudinary-all-images.zip"
    )
    # stream_cloudinary_cleanup_archive is an async generator (AsyncIterator).
    # Django's StreamingHttpResponse in ASGI mode handles this correctly without warnings.
    response = StreamingHttpResponse(
        stream_cloudinary_cleanup_archive(selected),
        content_type="application/zip",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Cache-Control"] = "no-store"
    response["X-Accel-Buffering"] = "no"
    return response
