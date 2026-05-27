# ruff: noqa: F401
import hashlib
import os

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


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
@traced
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

    payload: dict[str, str] = {
        "cloud_name": cloud_name,
        "api_key": api_key,
        "transformation": "fl_force_strip",
    }
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
@traced
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

    # Reject non-image resource types — enforcement without signature injection.
    if params_to_sign.get("resource_type", "image") != "image":
        return Response(
            {"detail": "Only image uploads are permitted."},
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


__all__ = [
    "cloudinary_widget_config",
    "cloudinary_widget_sign",
]
